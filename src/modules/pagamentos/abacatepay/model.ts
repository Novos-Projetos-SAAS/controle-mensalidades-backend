import type { Knex } from 'knex';
import AppError from '../../../shared/errors/AppError.js';
import { cifrarSegredo, decifrarSegredo } from '../credenciais.js';
import type { ContextoPagamento } from '../pagamentos.repository.js';
import type { AbacatePayCredentials, AbacatePayPort } from './types.js';

export type Contexto = ContextoPagamento;
export type Ambiente = 'TESTE' | 'PRODUCAO';
export type Dependencias = {
    db: Knex;
    provider: AbacatePayPort;
    key: () => string | undefined;
    origens: () => ReadonlySet<string>;
    ambiente: () => string;
    now: () => Date;
};
export type Config = {
    id: string;
    organizacao_id: string;
    provedor: string;
    ativo: boolean;
    ambiente: Ambiente;
    padrao: boolean;
    configuracao_criptografada: string | null;
    origem_plataforma: string | null;
    recorrencia_habilitada: boolean;
    cartao_recorrente: boolean;
    pix_automatico_estado: string;
};
export type Recorrencia = {
    id: string;
    organizacao_id: string;
    area_negocio_id: string;
    assinatura_id: string;
    cliente_id: string;
    plano_comercial_id: string;
    integracao_id: string;
    ambiente: Ambiente;
    status: string;
    metodo: 'CARD' | 'PIX';
    valor: string;
    dia_vencimento: number;
    competencia_inicial: Date | string;
    cliente_externo_id: string | null;
    produto_externo_id: string | null;
    checkout_externo_id: string | null;
    checkout_url: string | null;
    assinatura_externa_id: string | null;
    credencial_snapshot: string;
    data_debito: Date | string | null;
    ciclo_inicio_em: Date | string | null;
    ciclo_fim_em: Date | string | null;
    proxima_cobranca_em: Date | string | null;
    operacao_iniciada_em: Date | null;
    ultimo_erro: string | null;
    cancelado_em: Date | null;
};
export const ativas = [
    'AGUARDANDO_CRIACAO',
    'CRIANDO',
    'CRIACAO_INCERTA',
    'AGUARDANDO_PAGAMENTO',
    'PAGO_EM_REVISAO',
];
export const dataIso = (v: Date | string) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : v.slice(0, 10);
export const falha = (message: string, code = 'ABACATEPAY_OPERACAO_INVALIDA', status = 409) =>
    new AppError(message, status, code);
export function credenciais(
    config: Pick<Config, 'organizacao_id' | 'ambiente' | 'configuracao_criptografada'>,
    key: string | undefined,
): AbacatePayCredentials & { webhookSecret: string } {
    if (!config.configuracao_criptografada)
        throw falha('Configure sua conta para começar a receber.');
    try {
        const parsed = JSON.parse(
            decifrarSegredo(
                config.configuracao_criptografada,
                key,
                `abacatepay:${config.organizacao_id}:${config.ambiente}`,
            ),
        );
        if (typeof parsed.apiKey !== 'string' || typeof parsed.webhookSecret !== 'string')
            throw new Error('credential');
        return { ...parsed, devMode: config.ambiente === 'TESTE' };
    } catch {
        throw falha(
            'A conta de pagamento está indisponível. Revise a configuração.',
            'ABACATEPAY_CREDENCIAL_INVALIDA',
            503,
        );
    }
}
export const cifrarCredenciais = (
    config: Pick<Config, 'organizacao_id' | 'ambiente'>,
    value: { apiKey: string; webhookSecret: string },
    key: string | undefined,
) =>
    cifrarSegredo(
        JSON.stringify(value),
        key,
        `abacatepay:${config.organizacao_id}:${config.ambiente}`,
    );
export function configuracaoPublica(c?: Config) {
    return {
        id: c?.id ?? null,
        ativo: c?.ativo ?? false,
        ambiente: c?.ambiente ?? 'TESTE',
        has_api_key: !!c?.configuracao_criptografada,
        has_webhook_secret: !!c?.configuracao_criptografada,
        recorrencia_habilitada: c?.recorrencia_habilitada ?? false,
        cartao_recorrente: c?.cartao_recorrente ?? true,
        pix_automatico_disponivel: c?.pix_automatico_estado === 'DISPONIVEL',
        pix_automatico_estado: c?.pix_automatico_estado ?? 'NAO_VERIFICADO',
        webhook_path: c ? `/api/v1/pagamentos/webhook/abacatepay/${c.id}` : null,
        estado: c?.ativo
            ? 'ATIVA'
            : c?.configuracao_criptografada
              ? 'CONFIGURADA'
              : 'NAO_CONFIGURADA',
        producao_liberada: false,
    };
}
export function recorrenciaPublica(r: Recorrencia) {
    return {
        id: r.id,
        assinatura_id: r.assinatura_id,
        status: r.status,
        metodo: r.metodo,
        checkout_url: r.status === 'AGUARDANDO_AUTORIZACAO' ? r.checkout_url : null,
        assinatura_externa_id: r.assinatura_externa_id,
        ambiente: r.ambiente,
        valor: r.valor,
        data_debito: r.data_debito,
        ciclo_inicio_em: r.ciclo_inicio_em,
        ciclo_fim_em: r.ciclo_fim_em,
        proxima_cobranca_em: r.proxima_cobranca_em,
        ultimo_erro: r.ultimo_erro,
    };
}
export async function auditoria(
    trx: Knex | Knex.Transaction,
    c: Contexto,
    acao: string,
    id: string,
    dados: Record<string, unknown> = {},
) {
    await trx('registros_auditoria').insert({
        organizacao_id: c.organizacaoId,
        area_negocio_id: c.areaNegocioId,
        usuario_id: c.usuarioId,
        acao: `ABACATEPAY.${acao}`,
        recurso: 'INTEGRACAO_PAGAMENTO',
        recurso_id: id,
        dados_contexto: dados,
    });
}
