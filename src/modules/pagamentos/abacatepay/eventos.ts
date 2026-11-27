import { randomUUID, createHash } from 'node:crypto';
import { converterValorCentavos } from '../../financeiro/financeiro.validator.js';
import { z } from 'zod';
import AppError from '../../../shared/errors/AppError.js';
import { verifyAbacatePayWebhook } from './abacatepay.provider.js';
import { credenciais, falha, type Config, type Dependencias, type Recorrencia } from './model.js';
import type { CobrancaAbacate } from './cobrancas.js';
import { CobrancasAbacatePay } from './cobrancas.js';
import { RecorrenciasAbacatePay } from './recorrencias.js';
import type { AbacatePayCheckout, AbacatePayPayment, AbacatePaySubscription } from './types.js';

const envelope = z.object({
    id: z.string().min(1).max(150),
    event: z.string().min(1).max(100),
    apiVersion: z.literal(2),
    devMode: z.boolean(),
    data: z.record(z.string(), z.unknown()),
});
const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
const pick = (value: unknown, keys: string[]) =>
    Object.fromEntries(Object.entries(object(value)).filter(([k]) => keys.includes(k)));
type EventPayload = {
    devMode: boolean;
    data: {
        checkout: Record<string, unknown>;
        payment: Record<string, unknown>;
        subscription: Record<string, unknown>;
        payerInformation: Record<string, unknown>;
    };
    hash: string;
};
type Evento = {
    id: string;
    organizacao_id: string;
    provedor: string;
    tipo_evento: string;
    payload: EventPayload;
    tentativas: number;
    lease_token: string;
};
export class EventosAbacatePay {
    constructor(
        private d: Dependencias,
        private charges: CobrancasAbacatePay,
        private recurring: RecorrenciasAbacatePay,
    ) {}
    async receber(configId: string, raw: Buffer, secret: string, signature: string) {
        if (!z.uuid().safeParse(configId).success || !Buffer.isBuffer(raw) || raw.length > 1048576)
            throw falha('Notificação inválida.', 'ABACATEPAY_WEBHOOK_INVALIDO', 400);
        const config = await this.d
            .db<Config>('integracoes_pagamento')
            .where({ id: configId, provedor: 'ABACATEPAY' })
            .first();
        if (!config)
            throw falha('Notificação não autorizada.', 'ABACATEPAY_WEBHOOK_NAO_AUTORIZADO', 401);
        let json: unknown;
        try {
            json = JSON.parse(raw.toString('utf8'));
        } catch {
            throw falha('Notificação inválida.', 'ABACATEPAY_WEBHOOK_INVALIDO', 400);
        }
        const parsed = envelope.safeParse(json);
        if (!parsed.success)
            throw falha('Notificação inválida.', 'ABACATEPAY_WEBHOOK_INVALIDO', 400);
        const v = parsed.data;
        const snapshots = [config.configuracao_criptografada];
        const old = await this.d
            .db<Recorrencia>('recorrencias_pagamento')
            .where({
                integracao_id: config.id,
                organizacao_id: config.organizacao_id,
                ambiente: v.devMode ? 'TESTE' : 'PRODUCAO',
            })
            .select('credencial_snapshot');
        snapshots.push(...old.map((x) => x.credencial_snapshot));
        const charges = await this.d
            .db<CobrancaAbacate>('cobrancas_pagamento')
            .where({
                organizacao_id: config.organizacao_id,
                provedor: 'ABACATEPAY',
                ambiente: v.devMode ? 'TESTE' : 'PRODUCAO',
            })
            .select('credencial_snapshot');
        snapshots.push(...charges.map((x) => x.credencial_snapshot));
        const valid = [...new Set(snapshots)].some((value) => {
            try {
                const credential = credenciais(
                    {
                        ...config,
                        ambiente: v.devMode ? 'TESTE' : 'PRODUCAO',
                        configuracao_criptografada: value,
                    },
                    this.d.key(),
                );
                return verifyAbacatePayWebhook(raw, secret, signature, credential.webhookSecret);
            } catch {
                return false;
            }
        });
        if (!valid)
            throw falha('Notificação não autorizada.', 'ABACATEPAY_WEBHOOK_NAO_AUTORIZADO', 401);
        const payload: EventPayload = {
            devMode: v.devMode,
            hash: createHash('sha256').update(raw).digest('hex'),
            data: {
                checkout: pick(v.data.checkout, [
                    'id',
                    'externalId',
                    'amount',
                    'paidAmount',
                    'frequency',
                    'status',
                    'items',
                    'customerId',
                    'methods',
                    'createdAt',
                    'updatedAt',
                    'devMode',
                ]),
                payment: pick(v.data.payment, [
                    'id',
                    'externalId',
                    'amount',
                    'paidAmount',
                    'status',
                    'methods',
                    'createdAt',
                    'updatedAt',
                ]),
                subscription: pick(v.data.subscription, [
                    'id',
                    'amount',
                    'currency',
                    'method',
                    'status',
                    'frequency',
                    'createdAt',
                    'updatedAt',
                    'checkoutId',
                    'customerId',
                ]),
                payerInformation: pick(v.data.payerInformation, ['method']),
            },
        };
        await this.d
            .db('eventos_webhook')
            .insert({
                organizacao_id: config.organizacao_id,
                provedor: 'ABACATEPAY',
                identificador_externo: v.id,
                tipo_evento: v.event,
                payload,
                recebido_em: this.d.now(),
                status: 'PENDENTE',
                disponivel_em: this.d.now(),
            })
            .onConflict()
            .ignore();
        return { recebido: true };
    }
    async processar() {
        for (let count = 0; count < 30; count++) {
            const event = await this.d.db.transaction(async (trx) => {
                const row = await trx<Evento>('eventos_webhook')
                    .where({ provedor: 'ABACATEPAY' })
                    .where((q) =>
                        q
                            .where('status', 'PENDENTE')
                            .orWhere((q2) =>
                                q2
                                    .where('status', 'PROCESSANDO')
                                    .where('lease_ate', '<', this.d.now()),
                            ),
                    )
                    .where('disponivel_em', '<=', this.d.now())
                    .orderBy('recebido_em')
                    .forUpdate()
                    .skipLocked()
                    .first();
                if (!row) return null;
                const token = randomUUID();
                await trx('eventos_webhook')
                    .where('id', row.id)
                    .update({
                        status: 'PROCESSANDO',
                        lease_token: token,
                        lease_ate: new Date(this.d.now().getTime() + 60000),
                        tentativas: row.tentativas + 1,
                    });
                return { ...row, lease_token: token, tentativas: row.tentativas + 1 };
            });
            if (!event) return;
            try {
                await this.aplicar(event);
                await this.owned(event).update({
                    status: 'CONCLUIDO',
                    processado_em: this.d.now(),
                    erro: null,
                    lease_token: null,
                    lease_ate: null,
                });
            } catch (error) {
                const retry =
                    error instanceof AppError &&
                    [
                        'ABACATEPAY_INDISPONIVEL',
                        'ABACATEPAY_ERRO_API',
                        'ABACATEPAY_NAO_ENCONTRADO',
                    ].includes(error.code ?? '');
                await this.owned(event).update({
                    status: retry && event.tentativas < 8 ? 'PENDENTE' : 'REVISAO',
                    erro: error instanceof AppError ? error.code : 'ABACATEPAY_EVENTO_EM_REVISAO',
                    lease_token: null,
                    lease_ate: null,
                    disponivel_em: new Date(
                        this.d.now().getTime() + Math.min(300000, 5000 * 2 ** event.tentativas),
                    ),
                });
            }
        }
    }
    private owned(e: Evento) {
        return this.d.db('eventos_webhook').where({ id: e.id, lease_token: e.lease_token });
    }
    private async aplicar(e: Evento) {
        if (
            ![
                'checkout.completed',
                'subscription.completed',
                'subscription.renewed',
                'subscription.payment_failed',
                'subscription.cancelled',
            ].includes(e.tipo_evento)
        )
            return;
        const { checkout, payment, subscription, payerInformation } = e.payload.data;
        if (typeof checkout.id !== 'string' || !/^bill_[A-Za-z0-9_-]+$/.test(checkout.id))
            throw falha('Notificação precisa de conferência.');
        const ambiente = e.payload.devMode ? 'TESTE' : 'PRODUCAO',
            checkoutId = checkout.id;
        const byContract = z.uuid().safeParse(checkout.externalId);
        const r = await this.d
            .db<Recorrencia>('recorrencias_pagamento')
            .where({ organizacao_id: e.organizacao_id, ambiente })
            .where((q) => {
                q.where('checkout_externo_id', checkoutId);
                if (byContract.success) q.orWhere('assinatura_id', byContract.data);
            })
            .first();
        if (r) {
            if (
                checkout.externalId !== r.assinatura_id ||
                checkout.amount !== Number(converterValorCentavos(r.valor))
            )
                throw falha('Notificação da adesão precisa de conferência.');
            // checkout.completed does not identify each recurring payment. Its paired subscription event owns the settlement.
            if (e.tipo_evento === 'checkout.completed' && typeof payment.id !== 'string') return;
            const actualSubscription =
                typeof subscription.id === 'string'
                    ? subscription
                    : await this.d.provider.getSubscription(
                          credenciais(this.recurring.snapshot(r), this.d.key()),
                          r.assinatura_externa_id
                              ? { id: r.assinatura_externa_id }
                              : { externalId: r.assinatura_id },
                      );
            const typedCheckout = { ...checkout, devMode: e.payload.devMode } as AbacatePayCheckout;
            await this.recurring.evento(
                r,
                e.tipo_evento,
                typedCheckout,
                typeof payment.id === 'string'
                    ? (payment as unknown as AbacatePayPayment)
                    : undefined,
                actualSubscription as unknown as AbacatePaySubscription,
            );
            return;
        }
        if (e.tipo_evento !== 'checkout.completed')
            throw falha('Adesão não encontrada para esta notificação.');
        const charge = await this.d
            .db<CobrancaAbacate>('cobrancas_pagamento')
            .where({
                organizacao_id: e.organizacao_id,
                provedor: 'ABACATEPAY',
                ambiente,
                tipo: 'CHECKOUT',
                identificador_externo: String(checkout.externalId ?? ''),
            })
            .first();
        if (!charge) throw falha('Cobrança não encontrada para esta notificação.');
        if (charge.recurso_externo_id && charge.recurso_externo_id !== checkout.id)
            throw falha('Notificação de pagamento precisa de conferência.');
        const official = await this.d.provider.getCheckout(
            credenciais(this.charges.snapshot(charge), this.d.key()),
            { id: checkout.id },
        );
        if (official.status !== 'PAID' || official.externalId !== charge.identificador_externo)
            throw falha('Ainda não foi possível confirmar este pagamento.');
        const method = object(payerInformation).method;
        if (!['PIX', 'CARD'].includes(String(method)))
            throw falha('A forma de pagamento precisa de conferência.');
        const date = checkout.updatedAt ?? checkout.createdAt;
        if (typeof date !== 'string') throw falha('Data do pagamento precisa de conferência.');
        const normalized: AbacatePayPayment = {
            id: checkoutId,
            amount: Number(checkout.amount),
            paidAmount: typeof checkout.paidAmount === 'number' ? checkout.paidAmount : null,
            status: String(checkout.status),
            methods: [method as 'PIX' | 'CARD'],
            updatedAt: date,
        };
        await this.charges.aplicar(charge, normalized, official, false, method as 'PIX' | 'CARD');
    }
}
