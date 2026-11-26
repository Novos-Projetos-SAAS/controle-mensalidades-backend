import type { Knex } from 'knex';

export type ContextoPagamento = {
    organizacaoId: string;
    areaNegocioId: string;
    usuarioId: string | null;
};
export type ConfiguracaoPagamento = {
    id: string;
    organizacao_id: string;
    provedor: string;
    ativo: boolean;
    geracao_automatica: boolean;
    dias_antecedencia: 1 | 2;
    handle: string | null;
    configuracao_criptografada: string | null;
    origem_plataforma: string | null;
    atualizado_em: Date;
};
export type Cobranca = {
    id: string;
    organizacao_id: string;
    conta_receber_id: string;
    provedor: string;
    identificador_externo: string;
    tipo: string;
    status: string;
    valor: string;
    expira_em: Date;
    checkout_url: string | null;
    handle_snapshot: string;
    credencial_snapshot: string;
    token_criptografado: string;
    token_hash: string;
    payload_checkout: Record<string, unknown>;
    criado_em: Date;
    criacao_iniciada_em: Date | null;
    ultimo_erro: string | null;
};
export type ContaMensalidade = {
    id: string;
    conta_receber_id: string;
    organizacao_id: string;
    area_negocio_id: string;
    valor_final: string;
    competencia: string;
    vencimento_em: string;
    status_conta: string;
    cancelado_em: Date | null;
};
export type EventoPagamento = {
    id: string;
    organizacao_id: string;
    provedor: string;
    identificador_externo: string;
    payload: Record<string, string>;
    tipo_evento: string;
    status: string;
    tentativas: number;
    lease_token: string;
    lease_ate: Date;
    disponivel_em: Date;
};

export class PagamentosRepository {
    constructor(readonly db: Knex) {}

    conta(trx: Knex | Knex.Transaction, id: string, contexto?: ContextoPagamento) {
        const query = trx<ContaMensalidade>('mensalidades as m')
            .join('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
            .whereRaw(
                'cr.organizacao_id = m.organizacao_id AND cr.area_negocio_id = m.area_negocio_id',
            )
            .where('m.id', id)
            .select(
                'm.id',
                'm.organizacao_id',
                'm.area_negocio_id',
                'm.conta_receber_id',
                'm.valor_final',
                'm.competencia',
                'm.vencimento_em',
                'cr.status as status_conta',
                'cr.cancelado_em',
            );
        if (contexto)
            query
                .where('m.organizacao_id', contexto.organizacaoId)
                .where('m.area_negocio_id', contexto.areaNegocioId);
        return query;
    }

    contaDaCobranca(trx: Knex | Knex.Transaction, charge: Cobranca) {
        return trx<ContaMensalidade>('mensalidades as m')
            .join('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
            .where('m.conta_receber_id', charge.conta_receber_id)
            .where('m.organizacao_id', charge.organizacao_id)
            .where('cr.organizacao_id', charge.organizacao_id)
            .whereRaw('cr.area_negocio_id = m.area_negocio_id')
            .select(
                'm.id',
                'm.organizacao_id',
                'm.area_negocio_id',
                'm.conta_receber_id',
                'm.valor_final',
                'm.competencia',
                'm.vencimento_em',
                'cr.status as status_conta',
                'cr.cancelado_em',
            );
    }

    async saldo(
        trx: Knex | Knex.Transaction,
        conta: ContaMensalidade,
        converter: (value: string) => bigint,
    ) {
        const total = await trx('pagamentos')
            .where({
                organizacao_id: conta.organizacao_id,
                conta_receber_id: conta.conta_receber_id,
            })
            .sum({ total: 'valor' })
            .first();
        return converter(conta.valor_final) - converter(String(total?.total ?? '0'));
    }

    configuracao(org: string, trx: Knex | Knex.Transaction = this.db) {
        return trx<ConfiguracaoPagamento>('integracoes_pagamento').where({
            organizacao_id: org,
            provedor: 'INFINITEPAY',
        });
    }

    cobranca(id: string, trx: Knex | Knex.Transaction = this.db) {
        return trx<Cobranca>('cobrancas_pagamento').where({ id, provedor: 'INFINITEPAY' });
    }
}
