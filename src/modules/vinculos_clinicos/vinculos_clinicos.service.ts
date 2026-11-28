import type { Knex } from 'knex';
import connection from '../../database/connection.js';
import { aplicarTimeoutsTransacaoClinica } from '../../database/clinical-transaction-timeouts.js';
import AppError from '../../shared/errors/AppError.js';

export type ContextoVinculo = {
    usuarioId: string;
    organizacaoId: string;
    areaNegocioId: string;
};

type Identificadores = { clienteId: string; profissionalId: string };

async function exigirAdministrador(trx: Knex.Transaction, ctx: ContextoVinculo) {
    const identidade = await trx('usuarios as u')
        .innerJoin('usuarios_organizacoes as uo', 'uo.usuario_id', 'u.id')
        .innerJoin('organizacoes as o', 'o.id', 'uo.organizacao_id')
        .select('u.id')
        .where({
            'u.id': ctx.usuarioId,
            'uo.organizacao_id': ctx.organizacaoId,
            'uo.perfil': 'ADMINISTRADOR',
            'uo.ativo': true,
            'o.ativo': true,
            'u.ativo': true,
        })
        .whereNull('u.deletado_em')
        .whereNull('uo.deletado_em')
        .whereNull('o.deletado_em')
        .forShare()
        .first();

    if (!identidade) {
        throw new AppError('Operação de vínculo clínico não autorizada.', 403, 'VINCULO_CLINICO_NAO_AUTORIZADO');
    }
}

async function auditar(trx: Knex.Transaction, ctx: ContextoVinculo, vinculoId: string, acao: string) {
    try {
        await trx('registros_auditoria').insert({
            organizacao_id: ctx.organizacaoId,
            area_negocio_id: ctx.areaNegocioId,
            usuario_id: ctx.usuarioId,
            acao,
            recurso: 'VINCULO_CLINICO_PACIENTE',
            recurso_id: vinculoId,
            dados_contexto: {},
        });
    } catch {
        throw new AppError('Auditoria clínica indisponível.', 503, 'AUDITORIA_CLINICA_INDISPONIVEL');
    }
}

class VinculosClinicosService {
    private async executar<T>(fn: (trx: Knex.Transaction) => Promise<T>) {
        return connection.transaction(async (trx) => {
            await aplicarTimeoutsTransacaoClinica(trx);
            return fn(trx);
        });
    }

    async conceder(ctx: ContextoVinculo, dados: Identificadores) {
        try {
            return await this.executar(async (trx) => {
                await exigirAdministrador(trx, ctx);
                // As triggers da migration 069 também conferem tenant, cliente e
                // profissional, área, permissão clínica e papel do concedente.
                const existente = await trx('vinculos_clinicos_pacientes')
                    .select('id')
                    .where({
                        organizacao_id: ctx.organizacaoId,
                        area_negocio_id: ctx.areaNegocioId,
                        cliente_id: dados.clienteId,
                        profissional_id: dados.profissionalId,
                    })
                    .whereNull('revogado_em')
                    .first();
                if (existente) {
                    throw new AppError('Vínculo clínico já ativo.', 409, 'VINCULO_CLINICO_DUPLICADO');
                }

                const [registro] = await trx('vinculos_clinicos_pacientes')
                    .insert({
                        organizacao_id: ctx.organizacaoId,
                        area_negocio_id: ctx.areaNegocioId,
                        cliente_id: dados.clienteId,
                        profissional_id: dados.profissionalId,
                        concedido_por_usuario_id: ctx.usuarioId,
                    })
                    .returning(['id', 'cliente_id', 'profissional_id', 'concedido_em']);
                if (!registro) {
                    throw new AppError('Vínculo clínico indisponível.', 503, 'VINCULO_CLINICO_INDISPONIVEL');
                }
                await auditar(trx, ctx, registro.id as string, 'VINCULO_CLINICO.CONCEDIDO');
                return registro;
            });
        } catch (erro) {
            if (typeof erro === 'object' && erro !== null && 'code' in erro) {
                if (erro.code === '23505') {
                    throw new AppError('Vínculo clínico já ativo.', 409, 'VINCULO_CLINICO_DUPLICADO');
                }
                if (erro.code === 'P0001' || erro.code === '23503' || erro.code === '23514') {
                    throw new AppError('Dados ou escopo do vínculo clínico inválidos.', 400, 'VINCULO_CLINICO_INVALIDO');
                }
            }
            throw erro;
        }
    }

    async revogar(ctx: ContextoVinculo, vinculoId: string, motivo: string) {
        return this.executar(async (trx) => {
            await exigirAdministrador(trx, ctx);
            const vinculo = await trx('vinculos_clinicos_pacientes')
                .select('id', 'revogado_em')
                .where({
                    id: vinculoId,
                    organizacao_id: ctx.organizacaoId,
                    area_negocio_id: ctx.areaNegocioId,
                })
                .forUpdate()
                .first();

            if (!vinculo) {
                throw new AppError('Vínculo clínico não encontrado.', 404, 'VINCULO_CLINICO_NAO_ENCONTRADO');
            }
            if (vinculo.revogado_em) {
                throw new AppError('Vínculo clínico já revogado.', 409, 'VINCULO_CLINICO_JA_REVOGADO');
            }

            await trx('vinculos_clinicos_pacientes')
                .where('id', vinculo.id)
                .update({
                    revogado_em: trx.fn.now(),
                    revogado_por_usuario_id: ctx.usuarioId,
                    motivo_revogacao: motivo,
                });
            await auditar(trx, ctx, vinculo.id as string, 'VINCULO_CLINICO.REVOGADO');
            return { id: vinculo.id as string, revogado: true as const };
        });
    }

    async listar(ctx: ContextoVinculo, clienteId: string) {
        return this.executar(async (trx) => {
            await exigirAdministrador(trx, ctx);
            const registros = await trx('vinculos_clinicos_pacientes')
                .select('id', 'cliente_id', 'profissional_id', 'concedido_em', 'revogado_em')
                .where({
                    organizacao_id: ctx.organizacaoId,
                    area_negocio_id: ctx.areaNegocioId,
                    cliente_id: clienteId,
                })
                .orderBy('concedido_em', 'desc');
            await auditar(trx, ctx, clienteId, 'VINCULO_CLINICO.LISTADO');
            return registros;
        });
    }
}

export default new VinculosClinicosService();
