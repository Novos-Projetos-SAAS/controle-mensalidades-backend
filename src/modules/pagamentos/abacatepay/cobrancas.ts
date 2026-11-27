import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import AppError from '../../../shared/errors/AppError.js';
import { registrarRecebimentoTransacional } from '../../financeiro/financeiro.service.js';
import { converterValorCentavos, formatarCentavos } from '../../financeiro/financeiro.validator.js';
import { cifrarSegredo, decifrarSegredo } from '../credenciais.js';
import { expiraCobranca, resolverOrigemPlataforma } from '../pagamento.policy.js';
import { PagamentosRepository, type Cobranca } from '../pagamentos.repository.js';
import {
    ativas,
    auditoria,
    credenciais,
    dataIso,
    falha,
    type Config,
    type Contexto,
    type Dependencias,
} from './model.js';
import { RecursosAbacatePay } from './recursos.js';
import type { AbacatePayCheckout, AbacatePayPayment } from './types.js';

export type CobrancaAbacate = Cobranca & {
    ambiente: 'TESTE' | 'PRODUCAO';
    recurso_externo_id: string | null;
};
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export class CobrancasAbacatePay {
    readonly repo: PagamentosRepository;
    constructor(
        private d: Dependencias,
        private recursos: RecursosAbacatePay,
    ) {
        this.repo = new PagamentosRepository(d.db);
    }
    query(id: string, trx: Knex | Knex.Transaction = this.d.db) {
        return trx<CobrancaAbacate>('cobrancas_pagamento').where({ id, provedor: 'ABACATEPAY' });
    }
    snapshot(c: CobrancaAbacate) {
        return {
            organizacao_id: c.organizacao_id,
            ambiente: c.ambiente,
            configuracao_criptografada: c.credencial_snapshot,
        };
    }
    async gerar(contexto: Contexto, mensalidadeId: string) {
        const id = await this.d.db.transaction(async (trx) => {
            const conta = await this.repo
                .conta(trx, mensalidadeId, contexto)
                .forUpdate('cr')
                .first();
            if (!conta)
                throw falha(
                    'Mensalidade não encontrada nesta área.',
                    'MENSALIDADE_NAO_ENCONTRADA',
                    404,
                );
            const saldo = await this.repo.saldo(trx, conta, converterValorCentavos);
            if (conta.status_conta !== 'PENDENTE' || conta.cancelado_em || saldo <= 0n)
                throw falha('A mensalidade não possui saldo disponível para cobrança.');
            const m = await trx('mensalidades')
                .where({ id: mensalidadeId, organizacao_id: contexto.organizacaoId })
                .first();
            const recurring = await trx('recorrencias_pagamento')
                .where({ assinatura_id: m.assinatura_id, organizacao_id: contexto.organizacaoId })
                .whereNot('status', 'CANCELADA')
                .first();
            if (recurring)
                throw falha(
                    'Esta mensalidade está vinculada a pagamento automático. Cancele a recorrência e confira os pagamentos antes de gerar uma cobrança avulsa.',
                    'RECORRENCIA_EM_ANDAMENTO',
                );
            const existing = await trx<CobrancaAbacate>('cobrancas_pagamento')
                .where({
                    conta_receber_id: conta.conta_receber_id,
                    organizacao_id: contexto.organizacaoId,
                })
                .whereIn('status', ativas)
                .first();
            if (existing) {
                if (existing.provedor !== 'ABACATEPAY')
                    throw falha('Já existe uma cobrança em andamento em outra conta de pagamento.');
                return existing.id;
            }
            const config = await trx<Config>('integracoes_pagamento')
                .where({ organizacao_id: contexto.organizacaoId, provedor: 'ABACATEPAY' })
                .forUpdate()
                .first();
            if (!config?.ativo) throw falha('Configure e ative a AbacatePay para gerar cobranças.');
            credenciais(config, this.d.key());
            if (config.ambiente === 'PRODUCAO')
                throw falha(
                    'Homologação de produção ainda pendente.',
                    'ABACATEPAY_HOMOLOGACAO_PENDENTE',
                );
            if (saldo < 100n || saldo > BigInt(Number.MAX_SAFE_INTEGER))
                throw falha('A cobrança exige valor mínimo de R$ 1,00.');
            const origin = resolverOrigemPlataforma(
                config.origem_plataforma ?? undefined,
                this.d.origens(),
                this.d.ambiente(),
            );
            const id = randomUUID(),
                token = randomBytes(32).toString('base64url');
            await trx('cobrancas_pagamento').insert({
                id,
                organizacao_id: contexto.organizacaoId,
                conta_receber_id: conta.conta_receber_id,
                provedor: 'ABACATEPAY',
                identificador_externo: `cm-${id}`,
                tipo: 'CHECKOUT',
                status: 'AGUARDANDO_CRIACAO',
                valor: formatarCentavos(saldo),
                expira_em: expiraCobranca(dataIso(conta.vencimento_em), this.d.now()),
                credencial_snapshot: config.configuracao_criptografada,
                ambiente: config.ambiente,
                token_hash: hash(token),
                token_criptografado: cifrarSegredo(
                    token,
                    this.d.key(),
                    `cobranca:${contexto.organizacaoId}:${id}`,
                ),
                payload_checkout: {
                    externalId: `cm-${id}`,
                    completionUrl: new URL('/pagamento/retorno', origin).href,
                    returnUrl: new URL(`/pagamento/${token}`, origin).href,
                },
            });
            await auditoria(trx, contexto, 'COBRANCA_CRIADA', id, {
                valor: formatarCentavos(saldo),
            });
            return id;
        });
        await this.criar(id);
        return (await this.consultar(contexto, mensalidadeId))!;
    }
    async criar(id: string) {
        const [charge] = await this.query(id)
            .where('status', 'AGUARDANDO_CRIACAO')
            .update({ status: 'CRIANDO', criacao_iniciada_em: this.d.now() })
            .returning('*');
        if (!charge) return;
        try {
            const config = await this.d
                .db<Config>('integracoes_pagamento')
                .where({
                    organizacao_id: charge.organizacao_id,
                    provedor: 'ABACATEPAY',
                    ativo: true,
                })
                .first();
            if (!config) throw falha('A conta de pagamento está desativada.');
            const account = await this.repo.contaDaCobranca(this.d.db, charge).first();
            if (!account) throw falha('Mensalidade não encontrada.');
            const row = await this.d
                .db('contas_receber')
                .where({ id: charge.conta_receber_id, organizacao_id: charge.organizacao_id })
                .first();
            const customerId = await this.recursos.cliente(config, row.cliente_id);
            const productId = await this.recursos.produto(
                config,
                charge.id,
                Number(converterValorCentavos(charge.valor)),
                false,
            );
            const token = this.token(charge),
                completion = new URL(String(charge.payload_checkout.completionUrl));
            completion.searchParams.set('token', token);
            const official = await this.d.provider.createCheckout(
                credenciais(this.snapshot(charge), this.d.key()),
                {
                    externalId: charge.identificador_externo,
                    items: [{ id: productId, quantity: 1 }],
                    ...(customerId ? { customerId } : {}),
                    methods: ['PIX', 'CARD'],
                    returnUrl: String(charge.payload_checkout.returnUrl),
                    completionUrl: completion.href,
                    card: { maxInstallments: 1, passFeesToCustomer: false },
                },
            );
            await this.salvarCheckout(charge, official);
        } catch (error) {
            await this.query(id)
                .where('status', 'CRIANDO')
                .update({
                    status: 'CRIACAO_INCERTA',
                    ultimo_erro:
                        error instanceof AppError ? error.code : 'ABACATEPAY_CRIACAO_INCERTA',
                });
        }
    }
    async salvarCheckout(charge: CobrancaAbacate, official: AbacatePayCheckout) {
        if (
            official.externalId !== charge.identificador_externo ||
            official.amount !== Number(converterValorCentavos(charge.valor)) ||
            official.frequency === 'SUBSCRIPTION'
        )
            throw falha('O valor da cobrança precisa ser conferido.', 'ABACATEPAY_DIVERGENCIA');
        await this.query(charge.id)
            .whereNotIn('status', ['PAGO_VERIFICADO', 'PAGO_EM_REVISAO'])
            .update({
                recurso_externo_id: official.id,
                checkout_url: official.url,
                status:
                    official.status === 'EXPIRED' || official.status === 'CANCELLED'
                        ? 'CANCELADO'
                        : 'AGUARDANDO_PAGAMENTO',
                ultimo_erro: null,
            });
    }
    token(c: CobrancaAbacate) {
        return decifrarSegredo(
            c.token_criptografado,
            this.d.key(),
            `cobranca:${c.organizacao_id}:${c.id}`,
        );
    }
    async publica(c: CobrancaAbacate) {
        const conta = await this.repo.contaDaCobranca(this.d.db, c).first();
        if (!conta) throw falha('Cobrança não encontrada.', 'COBRANCA_NAO_ENCONTRADA', 404);
        const saldo = await this.repo.saldo(this.d.db, conta, converterValorCentavos);
        const status =
            conta.cancelado_em || conta.status_conta === 'CANCELADO' ? 'CANCELADO' : c.status;
        return {
            provedor: 'ABACATEPAY' as const,
            status,
            valor: c.valor,
            vencimento_em: dataIso(conta.vencimento_em),
            checkout_url:
                status === 'AGUARDANDO_PAGAMENTO' && saldo >= converterValorCentavos(c.valor)
                    ? c.checkout_url
                    : null,
            expira_em: null,
        };
    }
    async consultar(c: Contexto, mensalidadeId: string) {
        const conta = await this.repo.conta(this.d.db, mensalidadeId, c).first();
        if (!conta)
            throw falha(
                'Mensalidade não encontrada nesta área.',
                'MENSALIDADE_NAO_ENCONTRADA',
                404,
            );
        const charge = await this.d
            .db<CobrancaAbacate>('cobrancas_pagamento')
            .where({
                organizacao_id: c.organizacaoId,
                conta_receber_id: conta.conta_receber_id,
                provedor: 'ABACATEPAY',
            })
            .orderBy('criado_em', 'desc')
            .first();
        return charge
            ? {
                  id: charge.id,
                  ...(await this.publica(charge)),
                  url_plataforma: charge.token_criptografado
                      ? `/pagamento/${this.token(charge)}`
                      : null,
                  ultimo_erro: charge.ultimo_erro,
              }
            : null;
    }
    async conciliar(c: Contexto, id: string) {
        const charge = await this.query(id).where('organizacao_id', c.organizacaoId).first();
        if (
            !charge ||
            !(await this.repo
                .contaDaCobranca(this.d.db, charge)
                .where('m.area_negocio_id', c.areaNegocioId)
                .first())
        )
            throw falha('Cobrança não encontrada nesta área.', 'COBRANCA_NAO_ENCONTRADA', 404);
        try {
            const official = await this.d.provider.getCheckout(
                credenciais(this.snapshot(charge), this.d.key()),
                { externalId: charge.identificador_externo },
            );
            await this.salvarCheckout(charge, official);
            if (official.status === 'PAID') {
                // A one-time checkout has a unique bill identifier; recurring cycles require payment.id from a verified event.
                if (
                    official.methods?.length !== 1 ||
                    !['PIX', 'CARD'].includes(official.methods[0] ?? '')
                ) {
                    await this.query(id)
                        .whereNotIn('status', ['PAGO_VERIFICADO', 'PAGO_EM_REVISAO'])
                        .update({ ultimo_erro: 'AGUARDANDO_DETALHES_PAGAMENTO' });
                    return this.publica((await this.query(id).first())!);
                }
                const paidAt = official.updatedAt ?? official.createdAt;
                await this.aplicar(
                    charge,
                    {
                        id: official.id,
                        amount: official.amount,
                        paidAmount: official.paidAmount ?? null,
                        status: 'PAID',
                        ...(official.methods ? { methods: official.methods } : {}),
                        ...(paidAt ? { createdAt: paidAt } : {}),
                    },
                    official,
                );
            }
        } catch (error) {
            if (
                error instanceof AppError &&
                error.code === 'ABACATEPAY_NAO_ENCONTRADO' &&
                charge.status === 'CRIACAO_INCERTA'
            ) {
                await this.query(id)
                    .where('status', 'CRIACAO_INCERTA')
                    .update({ status: 'AGUARDANDO_CRIACAO' });
                await this.criar(id);
            } else throw error;
        }
        return this.publica((await this.query(id).first())!);
    }
    async aplicar(
        charge: CobrancaAbacate,
        payment: AbacatePayPayment,
        checkout: AbacatePayCheckout,
        recorrente = false,
        metodo?: 'CARD' | 'PIX',
    ) {
        await this.d.db.transaction(async (trx) => {
            const account = await this.repo.contaDaCobranca(trx, charge).forUpdate('cr').first();
            if (!account) throw falha('Vínculo de cobrança inválido.');
            const current = (await this.query(charge.id, trx).forUpdate().first())!;
            if (!/^(?:bill|card|char|pix)_[A-Za-z0-9_-]+$/.test(payment.id))
                throw falha(
                    'Identificação do pagamento precisa de conferência.',
                    'ABACATEPAY_PAGAMENTO_INVALIDO',
                );
            const externalId = `${charge.ambiente}:${payment.id}`;
            const reference = `${charge.ambiente}:${recorrente ? `RECORRENTE:${payment.id}` : `AVULSO:${checkout.id}`}`;
            const duplicate = await trx('transacoes_pagamento')
                .where('provedor', 'ABACATEPAY')
                .where((q) =>
                    q
                        .where('transaction_nsu', externalId)
                        .orWhere('referencia_liquidacao', reference),
                )
                .first();
            if (duplicate) {
                if (duplicate.cobranca_pagamento_id !== charge.id)
                    throw falha(
                        'Pagamento precisa de conferência.',
                        'ABACATEPAY_TRANSACAO_CONFLITANTE',
                    );
                if (
                    !recorrente &&
                    duplicate.transaction_nsu === `${charge.ambiente}:${checkout.id}` &&
                    payment.id !== checkout.id
                )
                    await trx('transacoes_pagamento')
                        .where('id', duplicate.id)
                        .update({ transaction_nsu: externalId });
                return;
            }
            const amount = converterValorCentavos(current.valor),
                saldo = await this.repo.saldo(trx, account, converterValorCentavos);
            const method =
                metodo ?? (payment.methods?.length === 1 ? payment.methods[0] : undefined);
            const paidAt = payment.updatedAt ?? payment.createdAt;
            const valid =
                payment.amount === Number(amount) &&
                payment.paidAmount === Number(amount) &&
                checkout.amount === Number(amount) &&
                checkout.devMode === (charge.ambiente === 'TESTE') &&
                checkout.externalId === charge.identificador_externo &&
                checkout.status === 'PAID' &&
                ['APPROVED', 'PAID'].includes(payment.status) &&
                ['CARD', 'PIX'].includes(method ?? '') &&
                Boolean(paidAt && Number.isFinite(Date.parse(paidAt))) &&
                account.status_conta === 'PENDENTE' &&
                !account.cancelado_em &&
                saldo >= amount;
            await trx('transacoes_pagamento').insert({
                organizacao_id: charge.organizacao_id,
                cobranca_pagamento_id: charge.id,
                provedor: 'ABACATEPAY',
                transaction_nsu: externalId,
                referencia_liquidacao: reference,
                slug: checkout.id,
                valor_centavos: payment.amount,
                pago_centavos: payment.paidAmount ?? 0,
                capture_method: method ?? 'UNKNOWN',
                installments: 1,
                status: valid ? 'APLICADO' : 'REVISAO',
                verificado_em: this.d.now(),
            });
            if (valid)
                await registrarRecebimentoTransacional(
                    trx,
                    {
                        organizacaoId: account.organizacao_id,
                        areaNegocioId: account.area_negocio_id,
                        usuarioId: null,
                    },
                    account.id,
                    `ABACATEPAY:${hash(externalId)}`,
                    {
                        valor: current.valor,
                        forma_pagamento: method === 'PIX' ? 'PIX' : 'CARTAO_CREDITO',
                        pago_em: paidAt!,
                    },
                    { cobrancaId: charge.id, transactionNsu: externalId, provedor: 'ABACATEPAY' },
                );
            await this.query(charge.id, trx).update({
                status: valid ? 'PAGO_VERIFICADO' : 'PAGO_EM_REVISAO',
                ultimo_erro: valid ? null : 'PAGAMENTO_EXIGE_CONFERENCIA',
            });
        });
    }
}
