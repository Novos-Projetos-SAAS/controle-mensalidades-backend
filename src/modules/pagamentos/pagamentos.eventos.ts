import { createHash, randomUUID } from 'node:crypto';
import AppError from '../../shared/errors/AppError.js';
import { registrarRecebimentoTransacional } from '../financeiro/financeiro.service.js';
import { converterValorCentavos } from '../financeiro/financeiro.validator.js';
import { decifrarSegredo } from './credenciais.js';
import { validatePaymentCheck } from './infinitepay.provider.js';
import { PagamentosRepository, type EventoPagamento } from './pagamentos.repository.js';
import { validarSinalPagamento } from './pagamentos.validator.js';
import type { PagamentoProvider, PaymentIdentifiers } from './types.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function evidenciaPublicavel(result: unknown) {
    if (!result || typeof result !== 'object') return {};
    const data = result as Record<string, unknown>;
    return Object.fromEntries(
        ['success', 'paid', 'amount', 'paid_amount', 'capture_method', 'installments']
            .filter((key) => ['boolean', 'number', 'string'].includes(typeof data[key]))
            .map((key) => [key, data[key]]),
    );
}

export class PagamentosEventos {
    constructor(
        private readonly repo: PagamentosRepository,
        private readonly provider: PagamentoProvider,
        private readonly key: () => string | undefined,
        private readonly now: () => Date,
    ) {}

    async receber(
        value: unknown,
        origem: 'WEBHOOK' | 'RETORNO' | 'ADMIN',
        expectedCharge?: string,
    ) {
        const signal = validarSinalPagamento(value);
        if (origem !== 'WEBHOOK' && signal.event_type !== 'paid')
            throw new AppError('Retorno de pagamento inválido.', 400, 'PAGAMENTO_DADOS_INVALIDOS');
        const charge = await this.repo
            .db('cobrancas_pagamento')
            .where({ identificador_externo: signal.order_nsu, provedor: 'INFINITEPAY' })
            .first();
        if (!charge || (expectedCharge && charge.id !== expectedCharge))
            throw new AppError('Cobrança não encontrada.', 404, 'COBRANCA_NAO_ENCONTRADA');
        const identity = hash(
            JSON.stringify([charge.id, signal.transaction_nsu, signal.slug, signal.event_type]),
        );
        const db = this.repo.db;
        const [created] = await db('eventos_webhook')
            .insert({
                id: randomUUID(),
                organizacao_id: charge.organizacao_id,
                provedor: 'INFINITEPAY',
                identificador_externo: identity,
                tipo_evento: signal.event_type,
                payload: { ...signal, origem },
                recebido_em: this.now(),
                disponivel_em: this.now(),
            })
            .onConflict()
            .ignore()
            .returning('*');
        if (created) return created as EventoPagamento;
        const existing = await db<EventoPagamento>('eventos_webhook')
            .where({ provedor: 'INFINITEPAY', identificador_externo: identity })
            .first();
        if (!existing)
            throw new AppError('Evento indisponível.', 503, 'PAGAMENTO_EVENTO_INDISPONIVEL');
        if (
            existing.status === 'FALHOU' &&
            (origem === 'ADMIN' || new Date(existing.disponivel_em) <= this.now())
        ) {
            await db('eventos_webhook').where('id', existing.id).where('status', 'FALHOU').update({
                status: 'PENDENTE',
                tentativas: 0,
                disponivel_em: this.now(),
                erro: null,
            });
        }
        return existing;
    }

    private async claim(id?: string) {
        return this.repo.db.transaction(async (trx) => {
            const query = trx<EventoPagamento>('eventos_webhook')
                .where('provedor', 'INFINITEPAY')
                .where((q) =>
                    q
                        .where((pending) =>
                            pending
                                .where('status', 'PENDENTE')
                                .where('disponivel_em', '<=', this.now()),
                        )
                        .orWhere((stale) =>
                            stale
                                .where('status', 'PROCESSANDO')
                                .where('lease_ate', '<=', this.now()),
                        ),
                );
            if (id) query.where('id', id);
            const row = await query.orderBy('recebido_em').forUpdate().skipLocked().first();
            if (!row) return null;
            const [claimed] = await trx<EventoPagamento>('eventos_webhook')
                .where('id', row.id)
                .update({
                    status: 'PROCESSANDO',
                    tentativas: row.tentativas + 1,
                    lease_token: randomUUID(),
                    lease_ate: new Date(this.now().getTime() + 30000),
                })
                .returning('*');
            return claimed!;
        });
    }

    private owned(event: EventoPagamento) {
        return this.repo
            .db('eventos_webhook')
            .where({ id: event.id, status: 'PROCESSANDO', lease_token: event.lease_token });
    }

    async processar(id?: string) {
        for (let index = 0; index < (id ? 1 : 5); index++) {
            const event = await this.claim(id);
            if (!event) break;
            if (event.tipo_evento !== 'paid') {
                // These unsigned signals are evidence for an operator, never authority to reverse a receipt.
                await this.owned(event).update({
                    status: 'REVISAO',
                    processado_em: this.now(),
                    lease_token: null,
                    lease_ate: null,
                    erro: 'EVENTO_EXIGE_CONFERENCIA',
                });
                continue;
            }
            let official: unknown;
            try {
                const identifiers: PaymentIdentifiers = {
                    order_nsu: event.payload.order_nsu!,
                    transaction_nsu: event.payload.transaction_nsu!,
                    slug: event.payload.slug!,
                };
                const charge = await this.repo
                    .db('cobrancas_pagamento')
                    .where({
                        provedor: 'INFINITEPAY',
                        identificador_externo: identifiers.order_nsu,
                        organizacao_id: event.organizacao_id,
                    })
                    .first();
                if (!charge)
                    throw new AppError('Cobrança não encontrada.', 404, 'COBRANCA_NAO_ENCONTRADA');
                const credential = decifrarSegredo(
                    charge.credencial_snapshot,
                    this.key(),
                    `infinitepay:${charge.organizacao_id}:${charge.handle_snapshot}`,
                );
                official = await this.provider.checkPayment(credential, {
                    handle: charge.handle_snapshot,
                    ...identifiers,
                });
                const checked = validatePaymentCheck(
                    official,
                    converterValorCentavos(charge.valor),
                    identifiers,
                );
                await this.repo.db.transaction(async (trx) => {
                    const conta = await this.repo
                        .contaDaCobranca(trx, charge)
                        .forUpdate('cr')
                        .first();
                    const current = await this.repo.cobranca(charge.id, trx).forUpdate().first();
                    if (!conta || !current)
                        throw new AppError(
                            'Vínculo financeiro inválido.',
                            409,
                            'COBRANCA_VINCULO_INVALIDO',
                        );
                    const saldo = await this.repo.saldo(trx, conta, converterValorCentavos);
                    const eligible =
                        conta.status_conta === 'PENDENTE' &&
                        !conta.cancelado_em &&
                        saldo >= converterValorCentavos(current.valor);
                    const [transaction] = await trx('transacoes_pagamento')
                        .insert({
                            organizacao_id: charge.organizacao_id,
                            cobranca_pagamento_id: charge.id,
                            provedor: 'INFINITEPAY',
                            transaction_nsu: identifiers.transaction_nsu,
                            slug: identifiers.slug,
                            valor_centavos: checked.amount,
                            pago_centavos: checked.paid_amount,
                            capture_method: checked.capture_method,
                            installments: checked.installments,
                            status: eligible ? 'APLICADO' : 'REVISAO',
                            verificado_em: this.now(),
                        })
                        .onConflict(['provedor', 'transaction_nsu'])
                        .ignore()
                        .returning('id');
                    if (!transaction) {
                        const existing = await trx('transacoes_pagamento')
                            .where({
                                provedor: 'INFINITEPAY',
                                transaction_nsu: identifiers.transaction_nsu,
                            })
                            .first();
                        if (existing?.cobranca_pagamento_id !== charge.id)
                            throw new AppError(
                                'Transação vinculada a outra cobrança.',
                                409,
                                'INFINITEPAY_TRANSACAO_CONFLITANTE',
                            );
                        return;
                    }
                    if (eligible) {
                        await registrarRecebimentoTransacional(
                            trx,
                            {
                                organizacaoId: conta.organizacao_id,
                                areaNegocioId: conta.area_negocio_id,
                                usuarioId: null,
                            },
                            conta.id,
                            `INFINITEPAY:${hash(identifiers.transaction_nsu)}`,
                            {
                                valor: current.valor,
                                forma_pagamento:
                                    checked.capture_method === 'pix' ? 'PIX' : 'CARTAO_CREDITO',
                                pago_em: this.now().toISOString(),
                            },
                            { cobrancaId: charge.id, transactionNsu: identifiers.transaction_nsu },
                        );
                    }
                    await this.repo.cobranca(charge.id, trx).update({
                        status: eligible ? 'PAGO_VERIFICADO' : 'PAGO_EM_REVISAO',
                        ultimo_erro: eligible ? null : 'PAGAMENTO_EXIGE_CONFERENCIA',
                    });
                });
                await this.owned(event).update({
                    status: 'CONCLUIDO',
                    processado_em: this.now(),
                    lease_token: null,
                    lease_ate: null,
                    erro: null,
                    resultado: evidenciaPublicavel(official),
                });
            } catch (error) {
                const code =
                    error instanceof AppError ? error.code : 'PAGAMENTO_VERIFICACAO_INDISPONIVEL';
                const permanent = [
                    'INFINITEPAY_DIVERGENCIA',
                    'INFINITEPAY_RESPOSTA_INVALIDA',
                    'INFINITEPAY_TRANSACAO_CONFLITANTE',
                    'COBRANCA_VINCULO_INVALIDO',
                ].includes(code ?? '');
                const evidence = evidenciaPublicavel(official);
                if (permanent && evidence.success === true && evidence.paid === true) {
                    await this.repo
                        .db('cobrancas_pagamento')
                        .where({
                            provedor: 'INFINITEPAY',
                            organizacao_id: event.organizacao_id,
                            identificador_externo: event.payload.order_nsu,
                        })
                        .whereNot('status', 'PAGO_VERIFICADO')
                        .update({ status: 'PAGO_EM_REVISAO', ultimo_erro: code });
                }
                await this.owned(event).update({
                    status: permanent ? 'REVISAO' : event.tentativas >= 8 ? 'FALHOU' : 'PENDENTE',
                    erro: code,
                    lease_token: null,
                    lease_ate: null,
                    disponivel_em: new Date(
                        this.now().getTime() + Math.min(300000, 5000 * 2 ** event.tentativas),
                    ),
                    resultado: evidenciaPublicavel(official),
                });
            }
        }
    }
}
