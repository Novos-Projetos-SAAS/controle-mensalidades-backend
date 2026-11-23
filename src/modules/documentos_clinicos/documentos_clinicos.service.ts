import type { Knex } from 'knex';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import autorizacaoClinicaService from '../sessoes_clinicas/autorizacao_clinica.service.js';
import {
    validarConteudoParaTipo,
    type NovoDocumentoClinico,
    type RevisaoDocumentoClinico,
    type FinalizarDocumentoClinico,
} from './documentos_clinicos.validator.js';

export type ContextoDocumentoClinico = {
    usuarioId: string;
    organizacaoId: string;
    areaNegocioId: string;
};

export type AuditoriaDocumentoClinico = {
    requestId?: string;
};

type TipoDocumento = 'ANAMNESE' | 'LAUDO';
type Estado = 'RASCUNHO' | 'FINALIZADO';
type Natureza = 'INICIAL' | 'CORRECAO' | 'ADENDO';

type Registro = {
    id: string;
    organizacao_id: string;
    area_negocio_id: string;
    cliente_id: string;
    profissional_id: string;
    tipo: TipoDocumento;
};

type Versao = {
    id: string;
    registro_id: string;
    autor_usuario_id: string;
    versao: number;
    natureza: Natureza;
    estado: Estado;
    conteudo: Record<string, string>;
    justificativa: string | null;
    registrado_em: Date;
};

function naoEncontrado() {
    return new AppError('Registro clínico não encontrado.', 404, 'REGISTRO_CLINICO_NAO_ENCONTRADO');
}

function conflitoVersao() {
    return new AppError(
        'O registro foi alterado desde sua última leitura. Atualize os dados antes de editar.',
        409,
        'VERSAO_CLINICA_DESATUALIZADA',
    );
}

class DocumentosClinicosService {
    private async transacao<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
        return connection.transaction(async (trx) => {
            await trx.raw("SET LOCAL statement_timeout = '8s'");
            await trx.raw("SET LOCAL lock_timeout = '3s'");
            return fn(trx);
        });
    }

    private async profissional(contexto: ContextoDocumentoClinico, trx: Knex.Transaction) {
        return autorizacaoClinicaService.identificarProfissional(
            contexto.usuarioId, contexto.organizacaoId, contexto.areaNegocioId, trx, true,
        );
    }

    private async paciente(contexto: ContextoDocumentoClinico, clienteId: string, trx: Knex.Transaction) {
        const encontrado = await trx('clientes as c')
            .innerJoin('clientes_areas as ca', function () {
                this.on('ca.cliente_id', '=', 'c.id').andOnVal(
                    'ca.area_negocio_id', contexto.areaNegocioId,
                );
            })
            .select('c.id')
            .where({
                'c.id': clienteId,
                'c.organizacao_id': contexto.organizacaoId,
                'c.ativo': true,
                'ca.ativo': true,
            })
            .whereNull('c.deletado_em')
            .whereNull('ca.deletado_em')
            .first();
        if (!encontrado) throw naoEncontrado();
    }

    private async buscarRegistro(
        contexto: ContextoDocumentoClinico,
        profissionalId: string,
        id: string,
        trx: Knex.Transaction,
        bloquear = false,
    ): Promise<Registro> {
        const consulta = trx<Registro>('registros_clinicos_documentais')
            .where({
                id, organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                profissional_id: profissionalId,
            });
        if (bloquear) consulta.forUpdate();
        const registro = await consulta.first();
        if (!registro) throw naoEncontrado();
        return registro;
    }

    private async ultimaVersao(id: string, trx: Knex.Transaction): Promise<Versao> {
        const versao = await trx<Versao>('versoes_registros_clinicos')
            .where('registro_id', id).orderBy('versao', 'desc').first();
        if (!versao) throw naoEncontrado();
        return versao;
    }

    private async auditar(
        trx: Knex.Transaction,
        contexto: ContextoDocumentoClinico,
        recursoId: string | null,
        acao: string,
        extra: AuditoriaDocumentoClinico = {},
    ) {
        try {
            await trx('registros_auditoria').insert({
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                usuario_id: contexto.usuarioId,
                acao,
                recurso: 'DOCUMENTO_CLINICO',
                recurso_id: recursoId,
                dados_contexto: {
                    ...(extra.requestId ? { requestId: extra.requestId } : {}),
                },
            });
        } catch {
            // Nunca enviar dados clínicos ou SQL bruto para respostas HTTP.
            throw new AppError('Auditoria clínica indisponível.', 503, 'AUDITORIA_CLINICA_INDISPONIVEL');
        }
    }

    async criar(contexto: ContextoDocumentoClinico, dados: NovoDocumentoClinico, meta?: AuditoriaDocumentoClinico) {
        return this.transacao(async (trx) => {
            const identidade = await this.profissional(contexto, trx);
            await this.paciente(contexto, dados.cliente_id, trx);
            const [registro] = await trx<Registro>('registros_clinicos_documentais').insert({
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: dados.cliente_id,
                profissional_id: identidade.profissionalId,
                tipo: dados.tipo,
            }).returning('id');
            if (!registro) throw new Error('Falha ao criar registro.');
            await trx('versoes_registros_clinicos').insert({
                registro_id: registro.id,
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: dados.cliente_id,
                autor_usuario_id: contexto.usuarioId,
                versao: 1,
                natureza: 'INICIAL',
                estado: 'RASCUNHO',
                conteudo: JSON.stringify(dados.conteudo),
                justificativa: null,
            });
            await this.auditar(trx, contexto, registro.id, 'DOCUMENTO_CLINICO.CRIADO', meta);
            return { id: registro.id, tipo: dados.tipo, versao: 1, estado: 'RASCUNHO' as const };
        });
    }

    async listar(contexto: ContextoDocumentoClinico, clienteId: string, meta?: AuditoriaDocumentoClinico) {
        return this.transacao(async (trx) => {
            const identidade = await this.profissional(contexto, trx);
            await this.paciente(contexto, clienteId, trx);
            const documentos = await trx<Registro>('registros_clinicos_documentais')
                .select('id', 'tipo', 'cliente_id', 'profissional_id', 'criado_em')
                .where({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    cliente_id: clienteId,
                    profissional_id: identidade.profissionalId,
                })
                .orderBy('criado_em', 'desc')
                .orderBy('id', 'asc');
            await this.auditar(trx, contexto, null, 'DOCUMENTO_CLINICO.LISTADO', meta);
            return documentos;
        });
    }

    async consultar(contexto: ContextoDocumentoClinico, id: string, meta?: AuditoriaDocumentoClinico) {
        return this.transacao(async (trx) => {
            const identidade = await this.profissional(contexto, trx);
            const registro = await this.buscarRegistro(contexto, identidade.profissionalId, id, trx);
            const versoes = await trx<Versao>('versoes_registros_clinicos')
                .where('registro_id', id)
                .andWhere('organizacao_id', contexto.organizacaoId)
                .andWhere('area_negocio_id', contexto.areaNegocioId)
                .andWhere('cliente_id', registro.cliente_id)
                .orderBy('versao', 'asc');
            await this.auditar(trx, contexto, id, 'DOCUMENTO_CLINICO.CONSULTADO', meta);
            return { registro, versoes };
        });
    }

    async revisar(
        contexto: ContextoDocumentoClinico,
        id: string,
        dados: RevisaoDocumentoClinico,
        meta?: AuditoriaDocumentoClinico,
    ) {
        return this.transacao(async (trx) => {
            const identidade = await this.profissional(contexto, trx);
            const registro = await this.buscarRegistro(contexto, identidade.profissionalId, id, trx, true);
            const anterior = await this.ultimaVersao(id, trx);
            if (anterior.versao !== dados.ultima_versao_esperada) throw conflitoVersao();
            if (anterior.estado === 'FINALIZADO' && dados.natureza !== 'ADENDO') {
                throw new AppError('Documento finalizado exige adendo.', 409, 'ADENDO_CLINICO_NECESSARIO');
            }
            if (anterior.estado === 'RASCUNHO' && dados.natureza !== 'CORRECAO') {
                throw new AppError('Rascunho exige correção.', 409, 'CORRECAO_CLINICA_NECESSARIA');
            }
            const conteudo = validarConteudoParaTipo(registro.tipo, dados.conteudo);
            await trx('versoes_registros_clinicos').insert({
                registro_id: id,
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: registro.cliente_id,
                autor_usuario_id: contexto.usuarioId,
                versao: anterior.versao + 1,
                natureza: dados.natureza,
                estado: anterior.estado,
                conteudo: JSON.stringify(conteudo),
                justificativa: dados.justificativa,
            });
            await this.auditar(trx, contexto, id, 'DOCUMENTO_CLINICO.REVISADO', meta);
            return { id, versao: anterior.versao + 1, estado: anterior.estado };
        });
    }

    async finalizar(
        contexto: ContextoDocumentoClinico,
        id: string,
        dados: FinalizarDocumentoClinico,
        meta?: AuditoriaDocumentoClinico,
    ) {
        return this.transacao(async (trx) => {
            const identidade = await this.profissional(contexto, trx);
            const registro = await this.buscarRegistro(contexto, identidade.profissionalId, id, trx, true);
            const anterior = await this.ultimaVersao(id, trx);
            if (anterior.versao !== dados.ultima_versao_esperada) throw conflitoVersao();
            if (anterior.estado === 'FINALIZADO') {
                throw new AppError('Documento já finalizado.', 409, 'DOCUMENTO_JA_FINALIZADO');
            }
            await trx('versoes_registros_clinicos').insert({
                registro_id: id,
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: registro.cliente_id,
                autor_usuario_id: contexto.usuarioId,
                versao: anterior.versao + 1,
                natureza: 'CORRECAO',
                estado: 'FINALIZADO',
                conteudo: JSON.stringify(anterior.conteudo),
                justificativa: 'Finalização do documento clínico sem assinatura digital',
            });
            await this.auditar(trx, contexto, id, 'DOCUMENTO_CLINICO.FINALIZADO', meta);
            return { id, versao: anterior.versao + 1, estado: 'FINALIZADO' as const };
        });
    }
}

export default new DocumentosClinicosService();
