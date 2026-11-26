import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import AppError from '../../shared/errors/AppError.js';
import { converterValorCentavos, formatarCentavos } from '../financeiro/financeiro.validator.js';
import { cifrarSegredo, decifrarSegredo } from './credenciais.js';
import { InfinitepayProvider, providerUrl } from './infinitepay.provider.js';
import {
    dataSaoPaulo,
    deveGerarAutomaticamente,
    expiraCobranca,
    resolverOrigemPlataforma,
} from './pagamento.policy.js';
import { PagamentosConfiguracao } from './pagamentos.configuracao.js';
import { PagamentosEventos } from './pagamentos.eventos.js';
import {
    PagamentosRepository,
    type Cobranca,
    type ContextoPagamento,
} from './pagamentos.repository.js';
import { validarTokenPagamento } from './pagamentos.validator.js';
import type { PagamentoProvider } from './types.js';
import { montarClienteCheckout } from './cliente-checkout.js';

const ativas = [
    'AGUARDANDO_CRIACAO',
    'CRIANDO',
    'CRIACAO_INCERTA',
    'AGUARDANDO_PAGAMENTO',
    'PAGO_EM_REVISAO',
];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const data = (value: Date | string) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);

type Dependencias = {
    db: Knex;
    provider?: PagamentoProvider;
    key: () => string | undefined;
    origens: () => ReadonlySet<string>;
    ambiente: () => string;
    now?: () => Date;
};

export class PagamentosService {
    readonly repo: PagamentosRepository;
    private readonly provider: PagamentoProvider;
    private readonly now: () => Date;
    private readonly configuracao: PagamentosConfiguracao;
    private readonly eventos: PagamentosEventos;

    constructor(private readonly deps: Dependencias) {
        this.repo = new PagamentosRepository(deps.db);
        this.provider = deps.provider ?? new InfinitepayProvider();
        this.now = deps.now ?? (() => new Date());
        this.configuracao = new PagamentosConfiguracao(
            deps.db,
            deps.key,
            deps.origens,
            deps.ambiente,
        );
        this.eventos = new PagamentosEventos(this.repo, this.provider, deps.key, this.now);
    }

    lerConfiguracao(contexto: ContextoPagamento) {
        return this.configuracao.ler(contexto);
    }
    atualizarConfiguracao(contexto: ContextoPagamento, input: unknown, origem?: string) {
        return this.configuracao.atualizar(contexto, input, origem);
    }

    async gerarCobranca(contexto: ContextoPagamento, mensalidadeId: string) {
        const charge = await this.deps.db.transaction(async (trx) => {
            const conta = await this.repo
                .conta(trx, mensalidadeId, contexto)
                .forUpdate('cr')
                .first();
            if (!conta)
                throw new AppError(
                    'Mensalidade não encontrada nesta área.',
                    404,
                    'MENSALIDADE_NAO_ENCONTRADA',
                );
            const saldo = await this.repo.saldo(trx, conta, converterValorCentavos);
            if (conta.status_conta !== 'PENDENTE' || conta.cancelado_em || saldo <= 0n)
                throw new AppError(
                    'A mensalidade não possui saldo disponível para cobrança.',
                    409,
                    'COBRANCA_SEM_SALDO',
                );
            await trx('cobrancas_pagamento')
                .where({ conta_receber_id: conta.conta_receber_id, provedor: 'INFINITEPAY' })
                .whereIn(
                    'status',
                    ativas.filter((s) => s !== 'PAGO_EM_REVISAO'),
                )
                .where('expira_em', '<=', this.now())
                .update({ status: 'EXPIRADO' });
            const current = await trx<Cobranca>('cobrancas_pagamento')
                .where({
                    conta_receber_id: conta.conta_receber_id,
                    organizacao_id: contexto.organizacaoId,
                    provedor: 'INFINITEPAY',
                })
                .whereIn('status', ativas)
                .first();
            if (current) return current;
            const config = await this.repo.configuracao(contexto.organizacaoId, trx).first();
            if (!config?.ativo || !config.handle || !config.configuracao_criptografada)
                throw new AppError(
                    'Integração InfinitePay desativada ou incompleta.',
                    409,
                    'INFINITEPAY_DESATIVADA',
                );
            const origin = resolverOrigemPlataforma(
                config.origem_plataforma ?? undefined,
                this.deps.origens(),
                this.deps.ambiente(),
            );
            if (saldo < 100n || saldo > BigInt(Number.MAX_SAFE_INTEGER))
                throw new AppError(
                    'O checkout exige saldo de pelo menos R$ 1,00.',
                    422,
                    'INFINITEPAY_VALOR_INVALIDO',
                );
            // The encrypted credential snapshot keeps existing checkouts verifiable after account changes.
            decifrarSegredo(
                config.configuracao_criptografada,
                this.deps.key(),
                `infinitepay:${contexto.organizacaoId}:${config.handle}`,
            );
            const id = randomUUID(),
                token = randomBytes(32).toString('base64url'),
                nsu = `mensalidades-${id}`;
            const expires = expiraCobranca(data(conta.vencimento_em), this.now());
            const payload = {
                handle: config.handle,
                order_nsu: nsu,
                items: [
                    {
                        quantity: 1,
                        price: Number(saldo),
                        description: `Mensalidade ${data(conta.competencia).slice(0, 7)}`,
                    },
                ],
                redirect_url: new URL('/pagamento/retorno', origin).href,
                webhook: {
                    url: new URL('/api/v1/pagamentos/webhook/infinitepay', origin).href,
                    events: ['paid', 'refunded', 'canceled'],
                },
                options: {
                    single_payment: true,
                    valid_until: expires.toISOString(),
                    payment_methods_enabled: ['pix', 'credit_card'],
                    assured_installments: 0,
                },
            };
            const [created] = await trx<Cobranca>('cobrancas_pagamento')
                .insert({
                    id,
                    organizacao_id: contexto.organizacaoId,
                    conta_receber_id: conta.conta_receber_id,
                    provedor: 'INFINITEPAY',
                    identificador_externo: nsu,
                    tipo: 'CHECKOUT',
                    status: 'AGUARDANDO_CRIACAO',
                    valor: formatarCentavos(saldo),
                    expira_em: expires,
                    handle_snapshot: config.handle,
                    credencial_snapshot: config.configuracao_criptografada,
                    token_hash: hash(token),
                    token_criptografado: cifrarSegredo(
                        token,
                        this.deps.key(),
                        `cobranca:${contexto.organizacaoId}:${id}`,
                    ),
                    payload_checkout: payload,
                })
                .returning('*');
            return created!;
        });
        await this.criarCheckout(charge.id);
        return (await this.consultarCobranca(contexto, mensalidadeId))!;
    }

    async criarCheckout(id: string) {
        const [charge] = await this.repo
            .cobranca(id)
            .where('status', 'AGUARDANDO_CRIACAO')
            .whereExists(
                this.deps
                    .db('integracoes_pagamento as i')
                    .select(this.deps.db.raw('1'))
                    .whereRaw('i.organizacao_id = cobrancas_pagamento.organizacao_id')
                    .where({ 'i.provedor': 'INFINITEPAY', 'i.ativo': true }),
            )
            .update({ status: 'CRIANDO', criacao_iniciada_em: this.now() })
            .returning('*');
        if (!charge) return;
        try {
            if (new Date(charge.expira_em) <= this.now()) {
                await this.repo
                    .cobranca(id)
                    .where('status', 'CRIANDO')
                    .update({ status: 'EXPIRADO' });
                return;
            }
            const credential = decifrarSegredo(
                charge.credencial_snapshot,
                this.deps.key(),
                `infinitepay:${charge.organizacao_id}:${charge.handle_snapshot}`,
            );
            const token = this.token(charge);
            const redirect = new URL(String(charge.payload_checkout.redirect_url));
            redirect.searchParams.set('token', token);
            const customer = montarClienteCheckout(await this.repo.clienteDaCobranca(charge));
            const { customer: _storedCustomer, ...checkoutPayload } = charge.payload_checkout;
            const { url } = await this.provider.createLink(credential, {
                ...checkoutPayload,
                redirect_url: redirect.href,
                ...(customer ? { customer } : {}),
            });
            if (!providerUrl(url))
                throw new AppError(
                    'Link de pagamento inválido.',
                    502,
                    'INFINITEPAY_RESPOSTA_INVALIDA',
                );
            await this.repo.cobranca(id).update({
                checkout_url: url,
                status: this.deps.db.raw(
                    "CASE WHEN status = 'CRIANDO' THEN 'AGUARDANDO_PAGAMENTO' ELSE status END",
                ),
            });
        } catch {
            // A timeout cannot establish whether /links created a checkout. Never resend it blindly.
            await this.repo
                .cobranca(id)
                .where('status', 'CRIANDO')
                .update({ status: 'CRIACAO_INCERTA', ultimo_erro: 'CRIACAO_NAO_CONFIRMADA' });
        }
    }

    private token(charge: Cobranca) {
        return decifrarSegredo(
            charge.token_criptografado,
            this.deps.key(),
            `cobranca:${charge.organizacao_id}:${charge.id}`,
        );
    }

    async consultarCobranca(contexto: ContextoPagamento, mensalidadeId: string) {
        const conta = await this.repo.conta(this.deps.db, mensalidadeId, contexto).first();
        if (!conta)
            throw new AppError(
                'Mensalidade não encontrada nesta área.',
                404,
                'MENSALIDADE_NAO_ENCONTRADA',
            );
        const charge = await this.deps
            .db<Cobranca>('cobrancas_pagamento')
            .where({
                conta_receber_id: conta.conta_receber_id,
                organizacao_id: contexto.organizacaoId,
                provedor: 'INFINITEPAY',
            })
            .orderBy('criado_em', 'desc')
            .first();
        if (!charge) return null;
        return {
            id: charge.id,
            ...(await this.visaoPublica(charge)),
            url_plataforma: `/pagamento/${this.token(charge)}`,
            ultimo_erro: charge.ultimo_erro,
        };
    }

    private async porToken(value: unknown) {
        const token = validarTokenPagamento(value);
        const charge = await this.deps
            .db<Cobranca>('cobrancas_pagamento')
            .where({ token_hash: hash(token), provedor: 'INFINITEPAY' })
            .first();
        if (!charge) throw new AppError('Cobrança não encontrada.', 404, 'COBRANCA_NAO_ENCONTRADA');
        return charge;
    }

    private async visaoPublica(charge: Cobranca) {
        const conta = await this.repo.contaDaCobranca(this.deps.db, charge).first();
        if (!conta) throw new AppError('Cobrança não encontrada.', 404, 'COBRANCA_NAO_ENCONTRADA');
        const saldo = await this.repo.saldo(this.deps.db, conta, converterValorCentavos);
        const status =
            conta.cancelado_em || conta.status_conta === 'CANCELADO'
                ? 'CANCELADO'
                : charge.status === 'AGUARDANDO_PAGAMENTO' &&
                    new Date(charge.expira_em) <= this.now()
                  ? 'EXPIRADO'
                  : charge.status;
        const payable =
            status === 'AGUARDANDO_PAGAMENTO' &&
            conta.status_conta === 'PENDENTE' &&
            saldo >= converterValorCentavos(charge.valor);
        return {
            status,
            valor: charge.valor,
            vencimento_em: data(conta.vencimento_em),
            checkout_url: payable ? providerUrl(charge.checkout_url) : null,
            expira_em: charge.expira_em,
        };
    }

    async consultarPublica(token: unknown) {
        return this.visaoPublica(await this.porToken(token));
    }

    async confirmarPublica(token: unknown, signal: unknown) {
        const charge = await this.porToken(token);
        const event = await this.eventos.receber(signal, 'RETORNO', charge.id);
        await this.eventos.processar(event.id);
        return this.consultarPublica(token);
    }

    async conciliar(contexto: ContextoPagamento, id: string, signal: unknown) {
        const charge = await this.repo
            .cobranca(id)
            .where('organizacao_id', contexto.organizacaoId)
            .first();
        if (
            !charge ||
            !(await this.repo
                .contaDaCobranca(this.deps.db, charge)
                .where('m.area_negocio_id', contexto.areaNegocioId)
                .first())
        )
            throw new AppError(
                'Cobrança não encontrada nesta área.',
                404,
                'COBRANCA_NAO_ENCONTRADA',
            );
        const event = await this.eventos.receber(signal, 'ADMIN', id);
        await this.eventos.processar(event.id);
        return this.visaoPublica((await this.repo.cobranca(id).first())!);
    }

    receberSinal(signal: unknown, origem: 'WEBHOOK' | 'RETORNO' | 'ADMIN') {
        return this.eventos.receber(signal, origem);
    }
    processarEventos() {
        return this.eventos.processar();
    }

    async executarCiclo() {
        const db = this.deps.db,
            now = this.now(),
            hoje = dataSaoPaulo(now);
        await db('cobrancas_pagamento')
            .where({ provedor: 'INFINITEPAY', status: 'CRIANDO' })
            .where('criacao_iniciada_em', '<', new Date(now.getTime() - 60000))
            .update({ status: 'CRIACAO_INCERTA', ultimo_erro: 'CRIACAO_INTERROMPIDA' });
        await db('cobrancas_pagamento')
            .where('provedor', 'INFINITEPAY')
            .whereIn(
                'status',
                ativas.filter((s) => s !== 'PAGO_EM_REVISAO'),
            )
            .where('expira_em', '<=', now)
            .update({ status: 'EXPIRADO' });
        await this.eventos.processar();
        const pendentes = await db<Cobranca>('cobrancas_pagamento as cp')
            .join('integracoes_pagamento as i', 'i.organizacao_id', 'cp.organizacao_id')
            .where({
                'cp.provedor': 'INFINITEPAY',
                'cp.status': 'AGUARDANDO_CRIACAO',
                'i.provedor': 'INFINITEPAY',
                'i.ativo': true,
            })
            .select('cp.*')
            .orderBy('cp.criado_em')
            .limit(5);
        for (const charge of pendentes) await this.criarCheckout(charge.id);
        const candidates = await db('mensalidades as m')
            .join('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
            .join('integracoes_pagamento as i', 'i.organizacao_id', 'm.organizacao_id')
            .join('organizacoes as o', 'o.id', 'm.organizacao_id')
            .join('areas_negocio as a', 'a.id', 'm.area_negocio_id')
            .where({
                'i.provedor': 'INFINITEPAY',
                'i.ativo': true,
                'i.geracao_automatica': true,
                'cr.status': 'PENDENTE',
                'o.ativo': true,
                'a.ativo': true,
            })
            .whereNull('cr.cancelado_em')
            .whereRaw(
                'cr.organizacao_id = m.organizacao_id AND a.organizacao_id = m.organizacao_id AND cr.area_negocio_id = m.area_negocio_id',
            )
            .where('m.vencimento_em', '>=', hoje)
            .whereRaw('m.vencimento_em <= ?::date + i.dias_antecedencia', [hoje])
            .whereRaw(
                'm.valor_final - COALESCE((SELECT SUM(p.valor) FROM pagamentos p WHERE p.conta_receber_id = cr.id AND p.organizacao_id = cr.organizacao_id), 0) >= 1',
            )
            .whereNotExists(
                db('cobrancas_pagamento as cp')
                    .select(db.raw('1'))
                    .whereRaw('cp.conta_receber_id = m.conta_receber_id')
                    .where('cp.provedor', 'INFINITEPAY'),
            )
            .select(
                'm.id',
                'm.organizacao_id',
                'm.area_negocio_id',
                'm.vencimento_em',
                'i.dias_antecedencia',
            )
            .orderBy('m.vencimento_em')
            .limit(10);
        for (const candidate of candidates) {
            if (
                !deveGerarAutomaticamente(
                    data(candidate.vencimento_em),
                    hoje,
                    candidate.dias_antecedencia,
                )
            )
                continue;
            try {
                await this.gerarCobranca(
                    {
                        organizacaoId: candidate.organizacao_id,
                        areaNegocioId: candidate.area_negocio_id,
                        usuarioId: null,
                    },
                    candidate.id,
                );
            } catch (error) {
                console.warn('Geração automática de cobrança pendente.', {
                    codigo: error instanceof AppError ? error.code : 'COBRANCA_INDISPONIVEL',
                });
            }
        }
    }
}
