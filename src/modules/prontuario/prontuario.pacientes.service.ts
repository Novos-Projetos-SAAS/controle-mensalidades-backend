import type { Knex } from 'knex';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { aplicarTimeoutsTransacaoClinica } from '../../database/clinical-transaction-timeouts.js';
import autorizacaoClinicaService from '../sessoes_clinicas/autorizacao_clinica.service.js';

export type ContextoPacientesClinicos = {
    usuarioId: string;
    organizacaoId: string;
    areaNegocioId: string;
};

export type PacienteVinculado = {
    id: string;
    nome: string;
};

export type ListagemPacientesVinculados = {
    items: PacienteVinculado[];
    pagina: number;
    limite: number;
    temMais: boolean;
};

class PacientesVinculadosService {
    async identidade(contexto: ContextoPacientesClinicos, requestId?: string) {
        return connection.transaction(async (trx: Knex.Transaction) => {
            await aplicarTimeoutsTransacaoClinica(trx);
            const identidade = await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId, contexto.organizacaoId, contexto.areaNegocioId, trx, true,
            );
            try {
                await trx('registros_auditoria').insert({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    usuario_id: contexto.usuarioId,
                    acao: 'PRONTUARIO.IDENTIDADE_PROFISSIONAL_CONSULTADA',
                    recurso: 'PRONTUARIO',
                    recurso_id: null,
                    dados_contexto: { ...(requestId ? { requestId } : {}) },
                });
            } catch {
                throw new AppError('Auditoria clínica indisponível.', 503, 'AUDITORIA_CLINICA_INDISPONIVEL');
            }
            return { profissional_id: identidade.profissionalId };
        });
    }

    async listar(
        contexto: ContextoPacientesClinicos,
        pagina: number,
        limite: number,
        requestId?: string,
    ): Promise<ListagemPacientesVinculados> {
        return connection.transaction(async (trx: Knex.Transaction) => {
            await aplicarTimeoutsTransacaoClinica(trx);

            const identidade = await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                trx,
                true,
            );

            // Retorna somente id/nome dos pacientes com vínculo ATIVO do
            // fisioterapeuta autenticado. Nunca retorna CPF, telefone,
            // endereço, nascimento ou dados clínicos nesta listagem.
            const linhas = await trx('vinculos_clinicos_pacientes as vc')
                .innerJoin('clientes as c', function () {
                    this.on('c.id', '=', 'vc.cliente_id')
                        .andOn('c.organizacao_id', '=', 'vc.organizacao_id');
                })
                .innerJoin('clientes_areas as ca', function () {
                    this.on('ca.cliente_id', '=', 'c.id')
                        .andOn('ca.area_negocio_id', '=', 'vc.area_negocio_id');
                })
                .innerJoin('profissionais as p', function () {
                    this.on('p.id', '=', 'vc.profissional_id')
                        .andOn('p.organizacao_id', '=', 'vc.organizacao_id');
                })
                .innerJoin('profissionais_areas as pa', function () {
                    this.on('pa.profissional_id', '=', 'p.id')
                        .andOn('pa.area_negocio_id', '=', 'vc.area_negocio_id');
                })
                .innerJoin('areas_negocio as a', function () {
                    this.on('a.id', '=', 'vc.area_negocio_id')
                        .andOn('a.organizacao_id', '=', 'vc.organizacao_id');
                })
                .select('c.id', 'c.nome')
                .where({
                    'vc.organizacao_id': contexto.organizacaoId,
                    'vc.area_negocio_id': contexto.areaNegocioId,
                    'vc.profissional_id': identidade.profissionalId,
                    'c.ativo': true,
                    'ca.ativo': true,
                    'p.ativo': true,
                    'pa.ativo': true,
                    'pa.acesso_clinico_autorizado': true,
                    'a.ativo': true,
                })
                .whereNull('vc.revogado_em')
                .whereNull('c.deletado_em')
                .whereNull('ca.deletado_em')
                .whereNull('p.deletado_em')
                .whereNull('pa.deletado_em')
                .whereNull('a.deletado_em')
                .orderBy('c.nome', 'asc')
                .orderBy('c.id', 'asc')
                .limit(limite + 1)
                .offset((pagina - 1) * limite)
                .forShare() as PacienteVinculado[];

            const temMais = linhas.length > limite;
            const items = linhas.slice(0, limite);

            try {
                await trx('registros_auditoria').insert({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    usuario_id: contexto.usuarioId,
                    acao: 'PRONTUARIO.PACIENTES_VINCULADOS_LISTADOS',
                    recurso: 'PRONTUARIO',
                    // Nao registrar IDs de pacientes nem textos nas trilhas de listagem.
                    recurso_id: null,
                    dados_contexto: {
                        pagina,
                        limite,
                        quantidade: items.length,
                        ...(requestId ? { requestId } : {}),
                    },
                });
            } catch {
                throw new AppError(
                    'Auditoria clínica indisponível.',
                    503,
                    'AUDITORIA_CLINICA_INDISPONIVEL',
                );
            }

            return { items, pagina, limite, temMais };
        });
    }
}

export default new PacientesVinculadosService();
