import { randomUUID } from 'node:crypto';
import { exigirPosseEvento, type PosseEvento } from '../evento-lease.js';
import { z } from 'zod';
import type { Knex } from 'knex';
import AppError from '../../../shared/errors/AppError.js';
import { gerarMensalidadeTransacional } from '../../financeiro/financeiro.service.js';
import { converterValorCentavos } from '../../financeiro/financeiro.validator.js';
import { dataSaoPaulo, resolverOrigemPlataforma } from '../pagamento.policy.js';
import {
    ativas,
    auditoria,
    credenciais,
    dataIso,
    falha,
    recorrenciaPublica,
    type Config,
    type Contexto,
    type Dependencias,
    type Recorrencia,
} from './model.js';
import { CobrancasAbacatePay, type CobrancaAbacate } from './cobrancas.js';
import { RecursosAbacatePay } from './recursos.js';
import type { AbacatePayCheckout, AbacatePayPayment, AbacatePaySubscription } from './types.js';

export class RecorrenciasAbacatePay {
    constructor(
        private d: Dependencias,
        private recursos: RecursosAbacatePay,
        private cobrancas: CobrancasAbacatePay,
    ) {}
    query(c: Contexto, id: string, trx: Knex | Knex.Transaction = this.d.db) {
        return trx<Recorrencia>('recorrencias_pagamento').where({
            assinatura_id: id,
            organizacao_id: c.organizacaoId,
            area_negocio_id: c.areaNegocioId,
        });
    }
    async contrato(c: Contexto, id: string, trx: Knex | Knex.Transaction = this.d.db) {
        const row = await trx('assinaturas as a')
            .join('clientes as cl', 'cl.id', 'a.cliente_id')
            .join('planos_comerciais as p', 'p.id', 'a.plano_comercial_id')
            .where({
                'a.id': id,
                'a.organizacao_id': c.organizacaoId,
                'a.area_negocio_id': c.areaNegocioId,
                'cl.organizacao_id': c.organizacaoId,
                'p.organizacao_id': c.organizacaoId,
            })
            .whereNull('cl.deletado_em')
            .select('a.*', 'p.periodicidade')
            .first();
        if (!row)
            throw falha('Assinatura não encontrada nesta área.', 'ASSINATURA_NAO_ENCONTRADA', 404);
        return row;
    }
    async consultar(c: Contexto, id: string) {
        await this.contrato(c, id);
        const r = await this.query(c, id).orderBy('criado_em', 'desc').first();
        return r ? recorrenciaPublica(r) : null;
    }
    snapshot(r: Recorrencia) {
        return {
            organizacao_id: r.organizacao_id,
            ambiente: r.ambiente,
            configuracao_criptografada: r.credencial_snapshot,
        };
    }
    async criar(c: Contexto, id: string, body: unknown) {
        const input = z
            .object({ metodo: z.enum(['CARD', 'PIX']) })
            .strict()
            .safeParse(body);
        if (!input.success)
            throw falha(
                'Escolha uma forma de pagamento automático.',
                'RECORRENCIA_DADOS_INVALIDOS',
                400,
            );
        const recurrence = await this.d.db.transaction(async (trx) => {
            await trx('assinaturas')
                .where({ id, organizacao_id: c.organizacaoId, area_negocio_id: c.areaNegocioId })
                .forUpdate()
                .first();
            const contract = await this.contrato(c, id, trx);
            const existing = await this.query(c, id, trx).orderBy('criado_em', 'desc').first();
            if (existing) {
                if (existing.metodo !== input.data.metodo)
                    throw falha(
                        'Existe uma adesão com outra forma de pagamento. Confira a situação antes de continuar.',
                    );
                if (existing.status === 'CANCELADA')
                    throw falha(
                        'Esta adesão foi cancelada. Crie um novo contrato para uma nova autorização.',
                    );
                return existing;
            }
            const cfg = await trx<Config>('integracoes_pagamento')
                .where({ organizacao_id: c.organizacaoId, provedor: 'ABACATEPAY' })
                .forUpdate()
                .first();
            if (!cfg?.ativo || !cfg.recorrencia_habilitada)
                throw falha('Configure a conta e habilite pagamento automático primeiro.');
            if (input.data.metodo === 'PIX' && cfg.pix_automatico_estado !== 'DISPONIVEL')
                throw falha(
                    'Pix Automático ainda não está liberado e validado nesta conta.',
                    'ABACATEPAY_PIX_INDISPONIVEL',
                );
            if (input.data.metodo === 'CARD' && !cfg.cartao_recorrente)
                throw falha('Pagamento automático por cartão está desativado.');
            if (cfg.ambiente === 'PRODUCAO')
                throw falha(
                    'Conclua a homologação antes de ativar pagamentos automáticos em produção.',
                );
            const today = dataSaoPaulo(this.d.now());
            if (
                contract.status !== 'ATIVA' ||
                contract.periodicidade !== 'MENSAL' ||
                contract.cancelado_em
            )
                throw falha(
                    'Somente contratos mensais ativos podem oferecer pagamento automático.',
                );
            if (contract.fim_em)
                throw falha(
                    'Neste MVP, pagamento automático está disponível para contratos sem prazo de término. Use cobrança avulsa para contratos com término definido.',
                );
            if (
                Number(contract.dia_vencimento) > 28 ||
                Number(today.slice(8)) !== Number(contract.dia_vencimento)
            )
                throw falha(
                    'Neste MVP, envie a adesão no dia do vencimento contratado, entre os dias 1 e 28.',
                );
            const amount =
                converterValorCentavos(String(contract.valor_contratado)) -
                converterValorCentavos(String(contract.desconto_recorrente));
            if (amount < 100n || amount > BigInt(Number.MAX_SAFE_INTEGER))
                throw falha('Confira o valor mensal contratado.');
            const result = await gerarMensalidadeTransacional(trx, c, id, {
                competencia: `${today.slice(0, 7)}-01`,
            });
            const m = await trx('mensalidades').where('id', result.mensalidadeId).first();
            const account = await trx('contas_receber')
                .where({ id: m.conta_receber_id, organizacao_id: c.organizacaoId })
                .forUpdate()
                .first();
            const paid = await trx('pagamentos')
                .where({ conta_receber_id: account.id, organizacao_id: c.organizacaoId })
                .first();
            const charge = await trx('cobrancas_pagamento')
                .where('conta_receber_id', account.id)
                .whereIn('status', ativas)
                .first();
            if (
                paid ||
                account.status !== 'PENDENTE' ||
                account.cancelado_em ||
                converterValorCentavos(String(m.valor_final)) !== amount ||
                charge
            )
                throw falha(
                    'A mensalidade atual já possui pagamento ou cobrança. Confira a situação antes de oferecer pagamento automático.',
                );
            if (!cfg.configuracao_criptografada)
                throw falha('Configure sua conta para começar a receber.');
            const [created] = await trx<Recorrencia>('recorrencias_pagamento')
                .insert({
                    organizacao_id: c.organizacaoId,
                    area_negocio_id: c.areaNegocioId,
                    assinatura_id: id,
                    cliente_id: contract.cliente_id,
                    plano_comercial_id: contract.plano_comercial_id,
                    integracao_id: cfg.id,
                    ambiente: cfg.ambiente,
                    status: 'PREPARANDO',
                    metodo: input.data.metodo,
                    valor: m.valor_final,
                    dia_vencimento: contract.dia_vencimento,
                    competencia_inicial: m.competencia,
                    credencial_snapshot: cfg.configuracao_criptografada,
                })
                .returning('*');
            await auditoria(trx, c, 'RECORRENCIA_INICIADA', created!.id, {
                assinatura_id: id,
                metodo: input.data.metodo,
                valor: m.valor_final,
            });
            return created!;
        });
        await this.checkout(recurrence.id);
        return (await this.consultar(c, id))!;
    }
    async checkout(id: string) {
        const [r] = await this.d
            .db<Recorrencia>('recorrencias_pagamento')
            .where({ id, status: 'PREPARANDO' })
            .whereNull('operacao_iniciada_em')
            .update({ operacao_iniciada_em: this.d.now() })
            .returning('*');
        if (!r) return;
        try {
            const cfg = await this.d
                .db<Config>('integracoes_pagamento')
                .where({ id: r.integracao_id, organizacao_id: r.organizacao_id, ativo: true })
                .first();
            if (!cfg) throw falha('A conta de pagamento está desativada.');
            const customerId = await this.recursos.cliente(cfg, r.cliente_id);
            const productId = await this.recursos.produto(
                cfg,
                r.plano_comercial_id,
                Number(converterValorCentavos(r.valor)),
                true,
            );
            const origin = resolverOrigemPlataforma(
                cfg.origem_plataforma ?? undefined,
                this.d.origens(),
                this.d.ambiente(),
            );
            const official = await this.d.provider.createSubscriptionCheckout(
                credenciais(this.snapshot(r), this.d.key()),
                {
                    externalId: r.assinatura_id,
                    items: [{ id: productId, quantity: 1 }],
                    ...(customerId ? { customerId } : {}),
                    methods: [r.metodo],
                    completionUrl: new URL('/financeiro', origin).href,
                    returnUrl: new URL('/financeiro', origin).href,
                    card: { maxInstallments: 1, passFeesToCustomer: false },
                },
            );
            if (
                official.amount !== Number(converterValorCentavos(r.valor)) ||
                official.externalId !== r.assinatura_id ||
                official.frequency === 'ONE_TIME'
            )
                throw falha('A adesão precisa de conferência.', 'ABACATEPAY_DIVERGENCIA');
            await this.d
                .db('recorrencias_pagamento')
                .where({ id, status: 'PREPARANDO' })
                .update({
                    status: 'AGUARDANDO_AUTORIZACAO',
                    cliente_externo_id: customerId ?? official.customerId ?? null,
                    produto_externo_id: productId,
                    checkout_externo_id: official.id,
                    checkout_url: official.url,
                    ultimo_erro: null,
                });
        } catch (error) {
            await this.d
                .db('recorrencias_pagamento')
                .where({ id, status: 'PREPARANDO' })
                .update({
                    status: 'CRIACAO_INCERTA',
                    ultimo_erro:
                        error instanceof AppError ? error.code : 'RECORRENCIA_CRIACAO_INCERTA',
                });
        }
    }
    async conciliar(c: Contexto, id: string) {
        await this.contrato(c, id);
        const r = await this.query(c, id).orderBy('criado_em', 'desc').first();
        if (!r) throw falha('Adesão não encontrada.', 'RECORRENCIA_NAO_ENCONTRADA', 404);
        const credential = credenciais(this.snapshot(r), this.d.key());
        if (!r.assinatura_externa_id) {
            const checkout = await this.d.provider.getSubscriptionCheckout(credential, {
                externalId: r.assinatura_id,
            });
            if (
                checkout.externalId !== r.assinatura_id ||
                checkout.amount !== Number(converterValorCentavos(r.valor))
            )
                throw falha('Adesão precisa de conferência.');
            await this.d
                .db('recorrencias_pagamento')
                .where('id', r.id)
                .update({
                    checkout_externo_id: checkout.id,
                    checkout_url: checkout.url,
                    status:
                        r.status === 'CRIACAO_INCERTA' && checkout.status === 'PENDING'
                            ? 'AGUARDANDO_AUTORIZACAO'
                            : r.status,
                });
            if (checkout.status === 'PAID') {
                const sub = await this.d.provider.getSubscription(credential, {
                    externalId: r.assinatura_id,
                });
                await this.sincronizar(r, sub);
            }
        } else
            await this.sincronizar(
                r,
                await this.d.provider.getSubscription(credential, { id: r.assinatura_externa_id }),
            );
        return (await this.consultar(c, id))!;
    }
    async sincronizar(r: Recorrencia, sub: AbacatePaySubscription) {
        this.validar(r, sub);
        const status = this.d.db.raw(
            "CASE WHEN ? = 'CANCELLED' THEN 'CANCELADA' WHEN status IN ('CANCELADA','CANCELAMENTO_PENDENTE','ATIVA','FALHA_PAGAMENTO') THEN status ELSE 'REVISAO' END",
            [sub.status],
        );
        await this.d
            .db('recorrencias_pagamento')
            .where('id', r.id)
            .update({
                assinatura_externa_id: sub.id,
                status,
                ...(sub.currentPeriodStart ? { ciclo_inicio_em: sub.currentPeriodStart } : {}),
                ...(sub.currentPeriodEnd ? { ciclo_fim_em: sub.currentPeriodEnd } : {}),
                ...(sub.nextChargeAt ? { proxima_cobranca_em: sub.nextChargeAt } : {}),
                ...(sub.status === 'CANCELLED' ? { cancelado_em: this.d.now() } : {}),
            });
    }
    validar(r: Recorrencia, sub: AbacatePaySubscription) {
        if (
            sub.amount !== Number(converterValorCentavos(r.valor)) ||
            sub.devMode !== (r.ambiente === 'TESTE') ||
            sub.checkoutId !== r.checkout_externo_id ||
            (r.cliente_externo_id && sub.customerId !== r.cliente_externo_id) ||
            sub.method !== r.metodo ||
            (sub.currency && sub.currency !== 'BRL') ||
            (r.assinatura_externa_id && sub.id !== r.assinatura_externa_id)
        )
            throw falha('A adesão precisa de conferência.', 'ABACATEPAY_ASSINATURA_DIVERGENTE');
    }
    async cancelar(c: Contexto, id: string) {
        await this.contrato(c, id);
        let r = await this.query(c, id).orderBy('criado_em', 'desc').first();
        if (!r) throw falha('Adesão não encontrada.', 'RECORRENCIA_NAO_ENCONTRADA', 404);
        if (r.status === 'CANCELADA') return recorrenciaPublica(r);
        await this.d
            .db('recorrencias_pagamento')
            .where('id', r.id)
            .whereNot('status', 'CANCELADA')
            .update({ status: 'CANCELAMENTO_PENDENTE' });
        const credential = credenciais(this.snapshot(r), this.d.key());
        try {
            if (!r.assinatura_externa_id) {
                const bill = await this.d.provider.getSubscriptionCheckout(credential, {
                    externalId: r.assinatura_id,
                });
                if (bill.status === 'PENDING')
                    await this.d.provider.deleteSubscriptionCheckout(credential, { id: bill.id });
                else if (bill.status === 'PAID') {
                    const sub = await this.d.provider.getSubscription(credential, {
                        externalId: r.assinatura_id,
                    });
                    this.validar({ ...r, checkout_externo_id: bill.id }, sub);
                    r = { ...r, assinatura_externa_id: sub.id };
                }
            }
            if (r.assinatura_externa_id) {
                const sub = await this.d.provider.cancelSubscription(credential, {
                    id: r.assinatura_externa_id,
                });
                this.validar(r, sub);
                if (sub.status !== 'CANCELLED') return (await this.consultar(c, id))!;
            }
            await this.d.db('recorrencias_pagamento').where('id', r.id).update({
                status: 'CANCELADA',
                assinatura_externa_id: r.assinatura_externa_id,
                cancelado_em: this.d.now(),
                ultimo_erro: null,
            });
            await auditoria(this.d.db, c, 'RECORRENCIA_CANCELADA', r.id, { assinatura_id: id });
        } catch {
            await this.d
                .db('recorrencias_pagamento')
                .where('id', r.id)
                .update({ ultimo_erro: 'CANCELAMENTO_AGUARDANDO_CONFIRMACAO' });
        }
        return (await this.consultar(c, id))!;
    }
    async evento(
        r: Recorrencia,
        event: string,
        checkout: AbacatePayCheckout,
        payment: AbacatePayPayment | undefined,
        subscription: AbacatePaySubscription,
        evento?: PosseEvento,
    ) {
        const credential = credenciais(this.snapshot(r), this.d.key());
        const official = await this.d.provider.getSubscription(credential, { id: subscription.id });
        if (evento) {
            const result = await this.d.db.transaction(async (trx) => {
                await exigirPosseEvento(trx, evento, this.d.now());
                const d = { ...this.d, db: trx };
                const recursos = new RecursosAbacatePay(d);
                const charges = new CobrancasAbacatePay(d, recursos);
                const recurring = new RecorrenciasAbacatePay(d, recursos, charges);
                try {
                    await recurring.aplicarEvento(
                        r,
                        event,
                        checkout,
                        payment,
                        subscription,
                        official,
                    );
                    return null;
                } catch (error) {
                    if (error instanceof AppError && error.code === 'DATA_DEBITO_INCOMPATIVEL')
                        return error;
                    const pending = await trx('recorrencias_pagamento')
                        .where({
                            id: r.id,
                            organizacao_id: r.organizacao_id,
                            status: 'CANCELAMENTO_PENDENTE',
                            ultimo_erro: 'DATA_DEBITO_INCOMPATIVEL',
                            assinatura_externa_id: official.id,
                        })
                        .first('id');
                    if (pending) return error;
                    throw error;
                }
            });
            if (result) throw result;
            return;
        }
        return this.aplicarEvento(r, event, checkout, payment, subscription, official);
    }
    private async aplicarEvento(
        r: Recorrencia,
        event: string,
        checkout: AbacatePayCheckout,
        payment: AbacatePayPayment | undefined,
        subscription: AbacatePaySubscription,
        official: AbacatePaySubscription,
    ) {
        const credential = credenciais(this.snapshot(r), this.d.key());
        this.validar(r, official);
        if (
            subscription.currency !== 'BRL' ||
            subscription.frequency !== 'MONTHLY' ||
            subscription.id !== official.id ||
            subscription.amount !== official.amount
        )
            throw falha('Adesão precisa de conferência.', 'ABACATEPAY_ASSINATURA_DIVERGENTE');
        if (event === 'subscription.cancelled') {
            if (official.status === 'CANCELLED') await this.sincronizar(r, official);
            return;
        }
        if (event === 'subscription.payment_failed') {
            const last = await this.d
                .db('pagamentos as p')
                .join('mensalidades as m', 'm.conta_receber_id', 'p.conta_receber_id')
                .where({ 'm.assinatura_id': r.assinatura_id, 'p.organizacao_id': r.organizacao_id })
                .max({ pago_em: 'p.pago_em' })
                .first();
            const failedAt = payment?.updatedAt ?? payment?.createdAt;
            if (
                failedAt &&
                last?.pago_em &&
                Date.parse(failedAt) <= new Date(last.pago_em as string).getTime()
            )
                return;
            if (r.status !== 'CANCELADA' && official.status !== 'CANCELLED')
                await this.d
                    .db('recorrencias_pagamento')
                    .where('id', r.id)
                    .whereNotIn('status', ['CANCELADA', 'CANCELAMENTO_PENDENTE'])
                    .update({ status: 'FALHA_PAGAMENTO', ultimo_erro: 'PAGAMENTO_NAO_CONFIRMADO' });
            return;
        }
        if (
            !payment ||
            !['subscription.completed', 'subscription.renewed', 'checkout.completed'].includes(
                event,
            )
        )
            return;
        const date = payment.updatedAt ?? payment.createdAt;
        if (!date || !Number.isFinite(Date.parse(date)))
            throw falha('Data do pagamento precisa de conferência.');
        if (r.cancelado_em && Date.parse(date) > new Date(r.cancelado_em).getTime())
            throw falha('Pagamento posterior ao cancelamento exige conferência.');
        const debit = dataSaoPaulo(new Date(date));
        const expectedMonth = dataIso(r.competencia_inicial).slice(0, 7);
        const scheduled = competenciaDoDebito(debit, r.dia_vencimento);
        const first = !r.data_debito;
        if (
            (first &&
                (Number(debit.slice(8)) !== r.dia_vencimento ||
                    debit.slice(0, 7) !== expectedMonth)) ||
            scheduled.slice(0, 7) < expectedMonth
        ) {
            await this.d
                .db('recorrencias_pagamento')
                .where('id', r.id)
                .whereNotIn('status', ['CANCELADA', 'CANCELAMENTO_PENDENTE'])
                .update({
                    status: 'CANCELAMENTO_PENDENTE',
                    assinatura_externa_id: official.id,
                    ultimo_erro: 'DATA_DEBITO_INCOMPATIVEL',
                });
            const cancelled = await this.d.provider.cancelSubscription(credential, {
                id: official.id,
            });
            if (cancelled.status === 'CANCELLED')
                await this.d
                    .db('recorrencias_pagamento')
                    .where('id', r.id)
                    .whereNot('status', 'CANCELADA')
                    .update({
                        status: 'REVISAO',
                        cancelado_em: this.d.now(),
                        ultimo_erro: 'DATA_DEBITO_INCOMPATIVEL',
                    });
            throw falha(
                'A data da autorização precisa de conferência.',
                'DATA_DEBITO_INCOMPATIVEL',
            );
        }
        if (official.status === 'PENDING')
            throw falha('Estamos aguardando a confirmação da adesão.');
        const c = {
            organizacaoId: r.organizacao_id,
            areaNegocioId: r.area_negocio_id,
            usuarioId: null,
        };
        const charge = await this.d.db.transaction(async (trx) => {
            const result = await gerarMensalidadeTransacional(trx, c, r.assinatura_id, {
                competencia: scheduled,
            });
            const m = await trx('mensalidades').where('id', result.mensalidadeId).first();
            await trx('contas_receber').where('id', m.conta_receber_id).forUpdate().first();
            if (converterValorCentavos(String(m.valor_final)) !== converterValorCentavos(r.valor))
                throw falha(
                    'O valor da mensalidade mudou. Cancele a autorização anterior e confira o pagamento.',
                    'ABACATEPAY_VALOR_ALTERADO',
                );
            const existing = await trx<CobrancaAbacate>('cobrancas_pagamento')
                .where({
                    conta_receber_id: m.conta_receber_id,
                    organizacao_id: r.organizacao_id,
                    provedor: 'ABACATEPAY',
                    tipo: 'RECORRENTE',
                })
                .first();
            if (existing) return existing;
            const competing = await trx('cobrancas_pagamento')
                .where('conta_receber_id', m.conta_receber_id)
                .whereIn('status', ativas)
                .first();
            if (competing)
                throw falha(
                    'Existe outra cobrança para esta mensalidade.',
                    'ABACATEPAY_COBRANCA_CONFLITANTE',
                );
            const [created] = await trx<CobrancaAbacate>('cobrancas_pagamento')
                .insert({
                    id: randomUUID(),
                    organizacao_id: r.organizacao_id,
                    conta_receber_id: m.conta_receber_id,
                    provedor: 'ABACATEPAY',
                    identificador_externo: r.assinatura_id,
                    tipo: 'RECORRENTE',
                    status: 'AGUARDANDO_PAGAMENTO',
                    valor: r.valor,
                    ambiente: r.ambiente,
                    credencial_snapshot: r.credencial_snapshot,
                    recurso_externo_id: null,
                    expira_em: this.d.now(),
                })
                .returning('*');
            return created!;
        });
        await this.cobrancas.aplicar(charge, payment, checkout, true, r.metodo);
        const paid = (await this.cobrancas.query(charge.id).first())?.status === 'PAGO_VERIFICADO';
        await this.d
            .db('recorrencias_pagamento')
            .where('id', r.id)
            .update({
                assinatura_externa_id: official.id,
                status: this.d.db.raw(
                    "CASE WHEN status IN ('CANCELADA','CANCELAMENTO_PENDENTE') THEN status WHEN ? = 'CANCELLED' THEN 'CANCELADA' ELSE ? END",
                    [official.status, paid ? 'ATIVA' : 'REVISAO'],
                ),
                data_debito: this.d.db.raw('COALESCE(data_debito,?::date)', [debit]),
                ...(official.currentPeriodStart
                    ? { ciclo_inicio_em: official.currentPeriodStart }
                    : {}),
                ...(official.currentPeriodEnd ? { ciclo_fim_em: official.currentPeriodEnd } : {}),
                ...(official.nextChargeAt ? { proxima_cobranca_em: official.nextChargeAt } : {}),
                ultimo_erro: paid ? null : 'PAGAMENTO_EXIGE_CONFERENCIA',
            });
    }
}
function competenciaDoDebito(debit: string, due: number) {
    const date = new Date(`${debit.slice(0, 7)}-01T12:00:00Z`);
    if (Number(debit.slice(8)) < due) date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 10);
}
