import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import AppError from '../../../shared/errors/AppError.js';
import { validarTokenPagamento } from '../pagamentos.validator.js';
import { gerarCompetenciasAutomaticas } from '../../financeiro/financeiro.rotina.js';
import { dataSaoPaulo } from '../pagamento.policy.js';
import { AbacatePayProvider } from './abacatepay.provider.js';
import { AbacatePayConfiguracao } from './configuracao.js';
import { CobrancasAbacatePay, type CobrancaAbacate } from './cobrancas.js';
import { RecursosAbacatePay } from './recursos.js';
import { RecorrenciasAbacatePay } from './recorrencias.js';
import { EventosAbacatePay } from './eventos.js';
import { type Contexto, type Dependencias, type Recorrencia, falha } from './model.js';
import type { AbacatePayPort } from './types.js';

type Input = {
    db: Knex;
    key: () => string | undefined;
    origens: () => ReadonlySet<string>;
    ambiente: () => string;
    now?: () => Date;
    provider?: AbacatePayPort;
};
export class AbacatePayService {
    readonly configuracao: AbacatePayConfiguracao;
    readonly cobrancas: CobrancasAbacatePay;
    readonly recorrencias: RecorrenciasAbacatePay;
    readonly eventos: EventosAbacatePay;
    private d: Dependencias;
    constructor(input: Input) {
        this.d = {
            ...input,
            provider: input.provider ?? new AbacatePayProvider(),
            now: input.now ?? (() => new Date()),
        };
        const recursos = new RecursosAbacatePay(this.d);
        this.configuracao = new AbacatePayConfiguracao(
            input.db,
            input.key,
            input.origens,
            input.ambiente,
        );
        this.cobrancas = new CobrancasAbacatePay(this.d, recursos);
        this.recorrencias = new RecorrenciasAbacatePay(this.d, recursos, this.cobrancas);
        this.eventos = new EventosAbacatePay(this.d, this.cobrancas, this.recorrencias);
    }
    lerConfiguracao(c: Contexto) {
        return this.configuracao.ler(c);
    }
    atualizarConfiguracao(c: Contexto, b: unknown, o?: string) {
        return this.configuracao.atualizar(c, b, o);
    }
    gerarCobranca(c: Contexto, id: string) {
        return this.cobrancas.gerar(c, id);
    }
    consultarCobranca(c: Contexto, id: string) {
        return this.cobrancas.consultar(c, id);
    }
    conciliar(c: Contexto, id: string) {
        return this.cobrancas.conciliar(c, id);
    }
    criarRecorrencia(c: Contexto, id: string, b: unknown) {
        return this.recorrencias.criar(c, id, b);
    }
    consultarRecorrencia(c: Contexto, id: string) {
        return this.recorrencias.consultar(c, id);
    }
    conciliarRecorrencia(c: Contexto, id: string) {
        return this.recorrencias.conciliar(c, id);
    }
    cancelarRecorrencia(c: Contexto, id: string) {
        return this.recorrencias.cancelar(c, id);
    }
    receberWebhook(id: string, raw: Buffer, secret: string, signature: string) {
        return this.eventos.receber(id, raw, secret, signature);
    }
    processarEventos() {
        return this.eventos.processar();
    }
    private async porToken(token: unknown) {
        const value = validarTokenPagamento(token);
        const hash = createHash('sha256').update(value).digest('hex');
        const charge = await this.d
            .db<CobrancaAbacate>('cobrancas_pagamento')
            .where({ provedor: 'ABACATEPAY', token_hash: hash })
            .first();
        if (!charge) throw falha('Cobrança não encontrada.', 'COBRANCA_NAO_ENCONTRADA', 404);
        return charge;
    }
    async consultarPublica(token: unknown) {
        return this.cobrancas.publica(await this.porToken(token));
    }
    async confirmarPublica(token: unknown) {
        const charge = await this.porToken(token);
        const view = await this.cobrancas.publica(charge);
        if (view.status === 'QUITADO') return view;
        const account = await this.cobrancas.repo.contaDaCobranca(this.d.db, charge).first();
        if (!account) throw falha('Cobrança não encontrada.');
        await this.conciliar(
            {
                organizacaoId: account.organizacao_id,
                areaNegocioId: account.area_negocio_id,
                usuarioId: null,
            },
            charge.id,
        );
        return this.consultarPublica(token);
    }
    async executarCiclo() {
        const today = dataSaoPaulo(this.d.now());
        await gerarCompetenciasAutomaticas(this.d.db, today);
        await this.recuperarIntencoes();
        await this.processarEventos();
        const invalid = await this.d
            .db<Recorrencia>('recorrencias_pagamento as rp')
            .join('assinaturas as a', 'a.id', 'rp.assinatura_id')
            .whereRaw('a.organizacao_id=rp.organizacao_id AND a.area_negocio_id=rp.area_negocio_id')
            .whereIn('rp.status', ['ATIVA', 'FALHA_PAGAMENTO'])
            .where((q) =>
                q
                    .whereNot('a.status', 'ATIVA')
                    .orWhereNotNull('a.cancelado_em')
                    .orWhereNotNull('a.fim_em'),
            )
            .select('rp.*')
            .limit(10);
        for (const r of invalid)
            await this.cancelarRecorrencia(
                {
                    organizacaoId: r.organizacao_id,
                    areaNegocioId: r.area_negocio_id,
                    usuarioId: null,
                },
                r.assinatura_id,
            );
        const rec = await this.d
            .db<Recorrencia>('recorrencias_pagamento')
            .whereIn('status', [
                'AGUARDANDO_AUTORIZACAO',
                'CRIACAO_INCERTA',
                'CANCELAMENTO_PENDENTE',
            ])
            .orderBy('atualizado_em')
            .limit(10);
        for (const r of rec) {
            const c = {
                organizacaoId: r.organizacao_id,
                areaNegocioId: r.area_negocio_id,
                usuarioId: null,
            };
            try {
                if (r.status === 'CANCELAMENTO_PENDENTE' || today !== dataIsoInicio(r))
                    await this.cancelarRecorrencia(c, r.assinatura_id);
                else await this.conciliarRecorrencia(c, r.assinatura_id);
            } catch (error) {
                console.warn('Pagamento automático aguardando confirmação.', {
                    codigo: error instanceof AppError ? error.code : 'PAGAMENTO_INDISPONIVEL',
                });
            } finally {
                await this.d
                    .db('recorrencias_pagamento')
                    .where('id', r.id)
                    .update({ atualizado_em: this.d.now() });
            }
        }
    }
    async recuperarIntencoes() {
        const today = dataSaoPaulo(this.d.now());
        await this.d
            .db('cobrancas_pagamento')
            .where({ provedor: 'ABACATEPAY', status: 'CRIANDO' })
            .where('criacao_iniciada_em', '<', new Date(this.d.now().getTime() - 60000))
            .update({ status: 'CRIACAO_INCERTA', ultimo_erro: 'CRIACAO_INTERROMPIDA' });
        await this.d
            .db('recorrencias_pagamento')
            .where({ status: 'PREPARANDO' })
            .where('operacao_iniciada_em', '<', new Date(this.d.now().getTime() - 60000))
            .update({ status: 'CRIACAO_INCERTA', ultimo_erro: 'CRIACAO_INTERROMPIDA' });
        const pending = await this.d
            .db<CobrancaAbacate>('cobrancas_pagamento as cp')
            .join('integracoes_pagamento as i', 'i.organizacao_id', 'cp.organizacao_id')
            .where({
                'cp.provedor': 'ABACATEPAY',
                'cp.status': 'AGUARDANDO_CRIACAO',
                'i.provedor': 'ABACATEPAY',
                'i.ativo': true,
            })
            .select('cp.*')
            .orderBy('cp.criado_em')
            .limit(5);
        for (const charge of pending) await this.cobrancas.criar(charge.id);
        const rec = await this.d
            .db<Recorrencia>('recorrencias_pagamento as rp')
            .join('integracoes_pagamento as i', 'i.id', 'rp.integracao_id')
            .where({ 'rp.status': 'PREPARANDO', 'i.ativo': true })
            .whereNull('rp.operacao_iniciada_em')
            .select('rp.*')
            .orderBy('rp.criado_em')
            .limit(5);
        for (const r of rec) {
            if (today === dataIsoInicio(r)) await this.recorrencias.checkout(r.id);
            else
                await this.d
                    .db('recorrencias_pagamento')
                    .where({ id: r.id, status: 'PREPARANDO' })
                    .whereNull('operacao_iniciada_em')
                    .update({
                        status: 'CANCELADA',
                        cancelado_em: this.d.now(),
                        ultimo_erro: 'PRAZO_ADESAO_ENCERRADO',
                    });
        }
    }
}
function dataIsoInicio(r: Recorrencia) {
    const month = (
        r.competencia_inicial instanceof Date
            ? r.competencia_inicial.toISOString()
            : r.competencia_inicial
    ).slice(0, 7);
    return `${month}-${String(r.dia_vencimento).padStart(2, '0')}`;
}
