import type { Knex } from 'knex';

import connection from '../../database/connection.js';
import { aplicarTimeoutsTransacaoClinica } from '../../database/clinical-transaction-timeouts.js';
import AppError from '../../shared/errors/AppError.js';
import autorizacaoClinicaService from '../sessoes_clinicas/autorizacao_clinica.service.js';

export type ContextoLinhaTempo = {
    usuarioId: string;
    organizacaoId: string;
    areaNegocioId: string;
};

export type TipoLinhaTempo = 'ANAMNESE' | 'EVOLUCAO' | 'LAUDO';

export type EntradaLinhaTempo = {
    id: string;
    tipo: TipoLinhaTempo;
    paciente_id: string;
    data: string;
    profissional_id: string;
    profissional_nome: string;
    titulo: string;
    versao: number | null;
    estado: 'RASCUNHO' | 'FINALIZADO' | null;
};

type Sessao = {
    id: string;
    cliente_id: string;
    profissional_id: string;
    data_sessao: Date;
    nome_profissional: string;
};

type Documento = {
    id: string;
    cliente_id: string;
    profissional_id: string;
    tipo: 'ANAMNESE' | 'LAUDO';
    criado_em: Date;
    nome_profissional: string;
};

type Versao = { registro_id: string; versao: number; estado: 'RASCUNHO' | 'FINALIZADO' };

function iso(data: Date | string): string {
    const date = new Date(data);
    if (!Number.isFinite(date.getTime())) {
        throw new AppError('Data clínica inválida.', 500, 'DATA_CLINICA_INVALIDA');
    }
    return date.toISOString();
}

export function ordenarLinhaTempo(entradas: EntradaLinhaTempo[], limite: number) {
    // Ordenação determinística, inclusive quando dois registros compartilham a mesma data.
    return entradas.sort((a, b) => b.data.localeCompare(a.data) || a.id.localeCompare(b.id))
        .slice(0, limite);
}

class LinhaTempoClinicaService {
    async listar(
        contexto: ContextoLinhaTempo,
        pacienteId: string,
        limite: number,
        requestId?: string,
    ): Promise<EntradaLinhaTempo[]> {
        return connection.transaction(async (trx: Knex.Transaction) => {
            await aplicarTimeoutsTransacaoClinica(trx);

            const identidade = await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                trx,
                true,
            );

            const paciente = await trx('clientes as c')
                .innerJoin('clientes_areas as ca', function () {
                    this.on('ca.cliente_id', '=', 'c.id').andOnVal(
                        'ca.area_negocio_id',
                        contexto.areaNegocioId,
                    );
                })
                .select('c.id')
                .where({
                    'c.id': pacienteId,
                    'c.organizacao_id': contexto.organizacaoId,
                    'c.ativo': true,
                    'ca.ativo': true,
                })
                .whereNull('c.deletado_em')
                .whereNull('ca.deletado_em')
                .first();

            // Não informar sequer a existência de paciente de outra organização/área.
            if (!paciente) {
                throw new AppError('Paciente não encontrado.', 404, 'PACIENTE_CLINICO_NAO_ENCONTRADO');
            }

            const escopo = {
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: pacienteId,
                profissional_id: identidade.profissionalId,
            };

            // As consultas só devolvem metadados mínimos. Dados de saúde são
            // consultados individualmente por endpoints auditados e autorizados.
            const sessoes = await trx('sessoes_clinicas as sc')
                .innerJoin('profissionais as p', 'p.id', 'sc.profissional_id')
                .select(
                    'sc.id', 'sc.cliente_id', 'sc.profissional_id',
                    'sc.data_sessao', 'p.nome as nome_profissional',
                )
                .where({
                    'sc.organizacao_id': escopo.organizacao_id,
                    'sc.area_negocio_id': escopo.area_negocio_id,
                    'sc.cliente_id': escopo.cliente_id,
                    'sc.profissional_id': escopo.profissional_id,
                    'p.organizacao_id': escopo.organizacao_id,
                })
                .whereNull('sc.deletado_em')
                .whereNull('p.deletado_em')
                .orderBy('sc.data_sessao', 'desc')
                .orderBy('sc.id', 'asc')
                .limit(limite) as Sessao[];

            const documentos = await trx('registros_clinicos_documentais as d')
                .innerJoin('profissionais as p', 'p.id', 'd.profissional_id')
                .select(
                    'd.id', 'd.cliente_id', 'd.profissional_id',
                    'd.tipo', 'd.criado_em', 'p.nome as nome_profissional',
                )
                .where({
                    'd.organizacao_id': escopo.organizacao_id,
                    'd.area_negocio_id': escopo.area_negocio_id,
                    'd.cliente_id': escopo.cliente_id,
                    'd.profissional_id': escopo.profissional_id,
                    'p.organizacao_id': escopo.organizacao_id,
                })
                .whereNull('p.deletado_em')
                .orderBy('d.criado_em', 'desc')
                .orderBy('d.id', 'asc')
                .limit(limite) as Documento[];

            const versoes = documentos.length
                ? await trx('versoes_registros_clinicos')
                    .select('registro_id', 'versao', 'estado')
                    .whereIn('registro_id', documentos.map((d) => d.id))
                    .where({
                        organizacao_id: escopo.organizacao_id,
                        area_negocio_id: escopo.area_negocio_id,
                        cliente_id: escopo.cliente_id,
                    })
                    .orderBy('registro_id', 'asc')
                    .orderBy('versao', 'desc') as Versao[]
                : [];

            const maisRecentes = new Map<string, Versao>();
            for (const versao of versoes) {
                if (!maisRecentes.has(versao.registro_id)) {
                    maisRecentes.set(versao.registro_id, versao);
                }
            }

            const entradas: EntradaLinhaTempo[] = [
                ...sessoes.map((s) => ({
                    id: s.id,
                    tipo: 'EVOLUCAO' as const,
                    paciente_id: s.cliente_id,
                    data: iso(s.data_sessao),
                    profissional_id: s.profissional_id,
                    profissional_nome: s.nome_profissional,
                    titulo: 'Evolução da sessão',
                    versao: null,
                    estado: null,
                })),
                ...documentos.map((d) => ({
                    id: d.id,
                    tipo: d.tipo,
                    paciente_id: d.cliente_id,
                    data: iso(d.criado_em),
                    profissional_id: d.profissional_id,
                    profissional_nome: d.nome_profissional,
                    titulo: d.tipo === 'ANAMNESE' ? 'Anamnese e avaliação inicial' : 'Laudo fisioterapêutico',
                    versao: maisRecentes.get(d.id)?.versao ?? null,
                    estado: maisRecentes.get(d.id)?.estado ?? null,
                })),
            ];

            try {
                await trx('registros_auditoria').insert({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    usuario_id: contexto.usuarioId,
                    acao: 'PRONTUARIO.LINHA_TEMPO_CONSULTADA',
                    recurso: 'PRONTUARIO',
                    recurso_id: pacienteId,
                    dados_contexto: {
                        ...(requestId ? { requestId } : {}),
                        // Sem textos, CPF ou dados sensíveis nos logs.
                    },
                });
            } catch {
                throw new AppError(
                    'Auditoria clínica indisponível.',
                    503,
                    'AUDITORIA_CLINICA_INDISPONIVEL',
                );
            }
            return ordenarLinhaTempo(entradas, limite);
        });
    }
}

export default new LinhaTempoClinicaService();
