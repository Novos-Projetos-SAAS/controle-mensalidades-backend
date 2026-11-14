import connection from '../../database/connection.js';

import type { ListarAssinaturasInput, ListarMensalidadesInput } from './financeiro.validator.js';

const statusMensalidadeSql = `CASE
    WHEN cr.cancelado_em IS NOT NULL OR cr.status = 'CANCELADO' THEN 'CANCELADA'
    WHEN cr.status = 'PAGO' OR COALESCE(pagos.valor_pago, 0) >= m.valor_final THEN 'PAGA'
    WHEN m.vencimento_em < CURRENT_DATE THEN 'VENCIDA'
    WHEN COALESCE(pagos.valor_pago, 0) > 0 THEN 'PARCIAL'
    ELSE 'PENDENTE'
END`;

function consultaMensalidades(organizacaoId: string, areaNegocioId: string) {
    const pagamentosPorConta = connection('pagamentos as p')
        .select('p.conta_receber_id')
        .sum({ valor_pago: 'p.valor' })
        .where('p.organizacao_id', organizacaoId)
        .whereNull('p.deletado_em')
        .groupBy('p.conta_receber_id')
        .as('pagos');

    return connection('mensalidades as m')
        .innerJoin('contas_receber as cr', function () {
            this.on('cr.id', '=', 'm.conta_receber_id')
                .andOn('cr.organizacao_id', '=', 'm.organizacao_id')
                .andOn('cr.area_negocio_id', '=', 'm.area_negocio_id');
        })
        .innerJoin('clientes as c', function () {
            this.on('c.id', '=', 'cr.cliente_id').andOn(
                'c.organizacao_id',
                '=',
                'm.organizacao_id',
            );
        })
        .leftJoin(pagamentosPorConta, 'pagos.conta_receber_id', 'cr.id')
        .where('m.organizacao_id', organizacaoId)
        .andWhere('m.area_negocio_id', areaNegocioId)
        .whereNull('m.deletado_em')
        .whereNull('cr.deletado_em')
        .whereNull('c.deletado_em');
}

export function obterStatusMensalidadeSql() {
    return statusMensalidadeSql;
}

class FinanceiroRepository {
    async listarPlanos(organizacaoId: string, areaNegocioId: string) {
        return connection('planos_comerciais')
            .select('id', 'nome', 'descricao', 'valor_base', 'periodicidade', 'area_negocio_id')
            .where('organizacao_id', organizacaoId)
            .andWhere('ativo', true)
            .whereNull('deletado_em')
            .andWhere((builder) =>
                builder.where('area_negocio_id', areaNegocioId).orWhereNull('area_negocio_id'),
            )
            .orderBy('nome', 'asc')
            .orderBy('id', 'asc');
    }

    async buscarPlano(organizacaoId: string, areaNegocioId: string, planoId: string) {
        return connection('planos_comerciais')
            .select(
                'id',
                'nome',
                'descricao',
                'valor_base',
                'periodicidade',
                'area_negocio_id',
                'ativo',
            )
            .where('organizacao_id', organizacaoId)
            .andWhere('id', planoId)
            .whereNull('deletado_em')
            .andWhere((builder) =>
                builder.where('area_negocio_id', areaNegocioId).orWhereNull('area_negocio_id'),
            )
            .first();
    }

    async listarAssinaturas(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: ListarAssinaturasInput,
    ) {
        const base = connection('assinaturas as a')
            .innerJoin('clientes as c', function () {
                this.on('c.id', '=', 'a.cliente_id').andOn(
                    'c.organizacao_id',
                    '=',
                    'a.organizacao_id',
                );
            })
            .innerJoin('planos_comerciais as p', function () {
                this.on('p.id', '=', 'a.plano_comercial_id').andOn(
                    'p.organizacao_id',
                    '=',
                    'a.organizacao_id',
                );
            })
            .where('a.organizacao_id', organizacaoId)
            .andWhere('a.area_negocio_id', areaNegocioId)
            .whereNull('a.deletado_em')
            .whereNull('c.deletado_em');

        if (filtros.clienteId) base.andWhere('a.cliente_id', filtros.clienteId);
        if (filtros.status) base.andWhere('a.status', filtros.status);

        const totalResult = await base.clone().countDistinct({ total: 'a.id' }).first();
        const items = await base
            .clone()
            .select(
                'a.id',
                'a.cliente_id',
                'c.nome as cliente_nome',
                'a.plano_comercial_id',
                'p.nome as plano_nome',
                'a.valor_contratado',
                'a.desconto_recorrente',
                'a.dia_vencimento',
                connection.raw('a.inicio_em::text AS inicio_em'),
                connection.raw('a.fim_em::text AS fim_em'),
                'a.status',
                'a.criado_em',
            )
            .orderBy('a.criado_em', 'desc')
            .orderBy('a.id', 'asc')
            .limit(filtros.pageSize)
            .offset((filtros.page - 1) * filtros.pageSize);

        return {
            items,
            pagination: this.paginar(filtros.page, filtros.pageSize, totalResult?.total),
        };
    }

    async buscarAssinatura(organizacaoId: string, areaNegocioId: string, assinaturaId: string) {
        return connection('assinaturas as a')
            .innerJoin('clientes as c', function () {
                this.on('c.id', '=', 'a.cliente_id').andOn(
                    'c.organizacao_id',
                    '=',
                    'a.organizacao_id',
                );
            })
            .innerJoin('planos_comerciais as p', function () {
                this.on('p.id', '=', 'a.plano_comercial_id').andOn(
                    'p.organizacao_id',
                    '=',
                    'a.organizacao_id',
                );
            })
            .select(
                'a.id',
                'a.cliente_id',
                'c.nome as cliente_nome',
                'a.plano_comercial_id',
                'p.nome as plano_nome',
                'a.valor_contratado',
                'a.desconto_recorrente',
                'a.dia_vencimento',
                connection.raw('a.inicio_em::text AS inicio_em'),
                connection.raw('a.fim_em::text AS fim_em'),
                'a.status',
                'a.criado_em',
            )
            .where('a.organizacao_id', organizacaoId)
            .andWhere('a.area_negocio_id', areaNegocioId)
            .andWhere('a.id', assinaturaId)
            .whereNull('a.deletado_em')
            .whereNull('c.deletado_em')
            .first();
    }

    async listarMensalidades(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: ListarMensalidadesInput,
    ) {
        const base = consultaMensalidades(organizacaoId, areaNegocioId);

        if (filtros.clienteId) base.andWhere('cr.cliente_id', filtros.clienteId);
        if (filtros.competencia) {
            base.andWhere('m.competencia', `${filtros.competencia}-01`);
        }
        if (filtros.vencimentoDe) base.andWhere('m.vencimento_em', '>=', filtros.vencimentoDe);
        if (filtros.vencimentoAte) base.andWhere('m.vencimento_em', '<=', filtros.vencimentoAte);
        if (filtros.status) {
            base.whereRaw(`${statusMensalidadeSql} = ?`, [filtros.status]);
        }

        const totalResult = await base.clone().countDistinct({ total: 'm.id' }).first();
        const items = await base
            .clone()
            .select(
                'm.id',
                'm.conta_receber_id',
                'm.assinatura_id',
                'cr.cliente_id',
                'c.nome as cliente_nome',
                connection.raw('m.competencia::text AS competencia'),
                'm.valor_base',
                'm.desconto_recorrente',
                'm.ajuste_competencia',
                'm.valor_final',
                connection.raw('m.vencimento_em::text AS vencimento_em'),
                'cr.status as status_conta',
                connection.raw('COALESCE(pagos.valor_pago, 0)::numeric(12,2)::text AS valor_pago'),
                connection.raw(
                    'GREATEST(m.valor_final - COALESCE(pagos.valor_pago, 0), 0)::numeric(12,2)::text AS saldo',
                ),
                connection.raw(`${statusMensalidadeSql} AS status`),
            )
            .orderBy('m.competencia', 'desc')
            .orderBy('m.id', 'asc')
            .limit(filtros.pageSize)
            .offset((filtros.page - 1) * filtros.pageSize);

        return {
            items,
            pagination: this.paginar(filtros.page, filtros.pageSize, totalResult?.total),
        };
    }

    async buscarMensalidade(organizacaoId: string, areaNegocioId: string, mensalidadeId: string) {
        const mensalidade = await consultaMensalidades(organizacaoId, areaNegocioId)
            .select(
                'm.id',
                'm.conta_receber_id',
                'm.assinatura_id',
                'cr.cliente_id',
                'c.nome as cliente_nome',
                connection.raw('m.competencia::text AS competencia'),
                'm.valor_base',
                'm.desconto_recorrente',
                'm.ajuste_competencia',
                'm.valor_final',
                connection.raw('m.vencimento_em::text AS vencimento_em'),
                'cr.status as status_conta',
                connection.raw('COALESCE(pagos.valor_pago, 0)::numeric(12,2)::text AS valor_pago'),
                connection.raw(
                    'GREATEST(m.valor_final - COALESCE(pagos.valor_pago, 0), 0)::numeric(12,2)::text AS saldo',
                ),
                connection.raw(`${statusMensalidadeSql} AS status`),
            )
            .andWhere('m.id', mensalidadeId)
            .first();

        if (!mensalidade) return undefined;

        const pagamentos = await connection('pagamentos')
            .select('id', 'valor', 'forma_pagamento', 'origem', 'pago_em', 'criado_em')
            .where('organizacao_id', organizacaoId)
            .andWhere('conta_receber_id', mensalidade.conta_receber_id)
            .whereNull('deletado_em')
            .orderBy('pago_em', 'asc')
            .orderBy('id', 'asc');

        return { ...mensalidade, pagamentos };
    }

    async obterResumo(
        organizacaoId: string,
        areaNegocioId: string,
        inicio: string,
        fimExclusivo: string,
    ) {
        const mensalidades = await consultaMensalidades(organizacaoId, areaNegocioId)
            .select(
                connection.raw(
                    `COUNT(*) FILTER (WHERE ${statusMensalidadeSql} IN ('PENDENTE', 'PARCIAL'))::text AS mensalidades_em_aberto`,
                ),
                connection.raw(
                    `COUNT(*) FILTER (WHERE ${statusMensalidadeSql} = 'VENCIDA')::text AS mensalidades_vencidas`,
                ),
                connection.raw(
                    `COALESCE(SUM(GREATEST(m.valor_final - COALESCE(pagos.valor_pago, 0), 0)) FILTER (WHERE ${statusMensalidadeSql} IN ('PENDENTE', 'PARCIAL')), 0)::numeric(12,2)::text AS valor_em_aberto`,
                ),
                connection.raw(
                    `COALESCE(SUM(GREATEST(m.valor_final - COALESCE(pagos.valor_pago, 0), 0)) FILTER (WHERE ${statusMensalidadeSql} = 'VENCIDA'), 0)::numeric(12,2)::text AS valor_vencido`,
                ),
            )
            .first();

        const recebimentos = await connection('pagamentos as p')
            .innerJoin('contas_receber as cr', function () {
                this.on('cr.id', '=', 'p.conta_receber_id').andOn(
                    'cr.organizacao_id',
                    '=',
                    'p.organizacao_id',
                );
            })
            .where('p.organizacao_id', organizacaoId)
            .andWhere('cr.area_negocio_id', areaNegocioId)
            .whereNull('p.deletado_em')
            .whereNull('cr.deletado_em')
            .andWhere('p.pago_em', '>=', `${inicio}T00:00:00.000Z`)
            .andWhere('p.pago_em', '<', `${fimExclusivo}T00:00:00.000Z`)
            .sum({ total: 'p.valor' })
            .first();

        const clientes = await connection('clientes as c')
            .innerJoin('clientes_areas as ca', 'ca.cliente_id', 'c.id')
            .where('c.organizacao_id', organizacaoId)
            .andWhere('ca.area_negocio_id', areaNegocioId)
            .andWhere('c.ativo', true)
            .andWhere('ca.ativo', true)
            .whereNull('c.deletado_em')
            .whereNull('ca.deletado_em')
            .countDistinct({ total: 'c.id' })
            .first();

        const profissionais = await connection('profissionais as p')
            .innerJoin('profissionais_areas as pa', 'pa.profissional_id', 'p.id')
            .where('p.organizacao_id', organizacaoId)
            .andWhere('pa.area_negocio_id', areaNegocioId)
            .andWhere('p.ativo', true)
            .andWhere('pa.ativo', true)
            .whereNull('p.deletado_em')
            .whereNull('pa.deletado_em')
            .countDistinct({ total: 'p.id' })
            .first();

        return {
            clientes_ativos: String(clientes?.total ?? 0),
            profissionais_ativos: String(profissionais?.total ?? 0),
            mensalidades_em_aberto: String(mensalidades?.mensalidades_em_aberto ?? 0),
            mensalidades_vencidas: String(mensalidades?.mensalidades_vencidas ?? 0),
            valor_em_aberto: String(mensalidades?.valor_em_aberto ?? '0.00'),
            valor_vencido: String(mensalidades?.valor_vencido ?? '0.00'),
            recebido_periodo: String(recebimentos?.total ?? '0.00'),
            periodo: { inicio, fim: fimExclusivo.slice(0, 10) },
        };
    }

    private paginar(page: number, pageSize: number, totalValue: unknown) {
        const total = Number(totalValue ?? 0);
        return { page, pageSize, total, pages: Math.ceil(total / pageSize) };
    }
}

export default new FinanceiroRepository();
