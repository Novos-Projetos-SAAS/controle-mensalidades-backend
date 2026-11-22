import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { consultaMensalidades } from './financeiro.repository.js';

const filtros = z.object({ data: z.iso.date().optional() }).strict();

function dataAtualSaoPaulo(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(data: string, dias: number): string {
    const date = new Date(data + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + dias);
    return date.toISOString().slice(0, 10);
}

/**
 * Indicadores read-only: nenhum pagamento ou cobranca e criado neste endpoint.
 * Sempre usa a query multitenant e soma somente saldos de contas nao pagas e nao canceladas.
 */
export default async function indicadoresFinanceiros(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.auth?.areaNegocioId) {
            throw new AppError('Contexto financeiro ausente.', 400, 'CONTEXTO_FINANCEIRO_AUSENTE');
        }
        const resultado = filtros.safeParse(req.query);
        if (!resultado.success) {
            throw new AppError('Data de referência inválida.', 400, 'DATA_INDICADORES_INVALIDA');
        }
        const data = resultado.data.data ?? dataAtualSaoPaulo();
        const fim = somarDias(data, 7);
        const valorPendente = 'GREATEST(m.valor_final - COALESCE(pagos.valor_pago, 0), 0)';

        const resumo = await consultaMensalidades(req.auth.organizacaoId, req.auth.areaNegocioId)
            .whereNull('cr.cancelado_em')
            .whereNotIn('cr.status', ['CANCELADO', 'PAGO'])
            .whereRaw('m.valor_final > COALESCE(pagos.valor_pago, 0)')
            .select(
                connection.raw(`COUNT(*)::text AS mensalidades_com_saldo`),
                connection.raw(`COALESCE(SUM(${valorPendente}), 0)::numeric(12,2)::text AS saldo_total`),
                connection.raw(
                    `COUNT(*) FILTER (WHERE m.vencimento_em < ?::date)::text AS mensalidades_vencidas`,
                    [data],
                ),
                connection.raw(
                    `COUNT(DISTINCT cr.cliente_id) FILTER (WHERE m.vencimento_em < ?::date)::text AS clientes_inadimplentes`,
                    [data],
                ),
                connection.raw(
                    `COALESCE(SUM(${valorPendente}) FILTER (WHERE m.vencimento_em < ?::date), 0)::numeric(12,2)::text AS saldo_vencido`,
                    [data],
                ),
                connection.raw(
                    `COUNT(*) FILTER (WHERE m.vencimento_em BETWEEN ?::date AND ?::date)::text AS mensalidades_proximos_7_dias`,
                    [data, fim],
                ),
                connection.raw(
                    `COALESCE(SUM(${valorPendente}) FILTER (WHERE m.vencimento_em BETWEEN ?::date AND ?::date), 0)::numeric(12,2)::text AS saldo_proximos_7_dias`,
                    [data, fim],
                ),
            ).first();

        return res.status(200).json({
            status: 'success',
            message: 'Indicadores financeiros.',
            data: {
                data_referencia: data,
                janela_vencimentos_fim: fim,
                mensalidades_com_saldo: String(resumo?.mensalidades_com_saldo ?? '0'),
                saldo_total: String(resumo?.saldo_total ?? '0.00'),
                mensalidades_vencidas: String(resumo?.mensalidades_vencidas ?? '0'),
                clientes_inadimplentes: String(resumo?.clientes_inadimplentes ?? '0'),
                saldo_vencido: String(resumo?.saldo_vencido ?? '0.00'),
                mensalidades_proximos_7_dias: String(resumo?.mensalidades_proximos_7_dias ?? '0'),
                saldo_proximos_7_dias: String(resumo?.saldo_proximos_7_dias ?? '0.00'),
            },
        });
    } catch (error) {
        next(error);
    }
}
