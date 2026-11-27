import type { OfficialPayment, PagamentoProvider, PaymentIdentifiers } from './types.js';
import AppError from '../../shared/errors/AppError.js';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function providerUrl(value: unknown): string | null {
    if (
        typeof value !== 'string' ||
        [...value].some(
            (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\',
        )
    )
        return null;
    try {
        const url = new URL(value);
        const allowed = ['buy.infinitepay.io', 'checkout.infinitepay.io'];
        return url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port &&
            allowed.includes(url.hostname)
            ? url.href
            : null;
    } catch {
        return null;
    }
}

export function validatePaymentCheck(
    result: unknown,
    amount: bigint,
    identifiers: PaymentIdentifiers,
): OfficialPayment {
    if (!isRecord(result)) {
        throw new AppError('Resposta de pagamento inválida.', 502, 'INFINITEPAY_RESPOSTA_INVALIDA');
    }
    if (result.success !== true || result.paid !== true) {
        throw new AppError(
            'Pagamento ainda não confirmado pela API oficial.',
            409,
            'INFINITEPAY_PAGAMENTO_NAO_CONFIRMADO',
        );
    }
    if (
        typeof result.amount !== 'number' ||
        !Number.isSafeInteger(result.amount) ||
        result.amount <= 0 ||
        typeof result.paid_amount !== 'number' ||
        !Number.isSafeInteger(result.paid_amount) ||
        result.paid_amount < result.amount ||
        typeof result.installments !== 'number' ||
        !Number.isInteger(result.installments) ||
        result.installments < 1 ||
        result.installments > 12 ||
        (result.capture_method !== 'pix' && result.capture_method !== 'credit_card')
    ) {
        throw new AppError('Resposta de pagamento inválida.', 502, 'INFINITEPAY_RESPOSTA_INVALIDA');
    }
    if (amount <= 0n || BigInt(result.amount) !== amount) {
        throw new AppError('Valor do pagamento divergente.', 409, 'INFINITEPAY_DIVERGENCIA');
    }
    const pairs = [
        ['order_nsu', identifiers.order_nsu],
        ['transaction_nsu', identifiers.transaction_nsu],
        ['slug', identifiers.slug],
        ['invoice_slug', identifiers.slug],
    ] as const;
    if (
        pairs.some(
            ([field, expected]) => Object.hasOwn(result, field) && result[field] !== expected,
        )
    ) {
        throw new AppError('Identidade do pagamento divergente.', 409, 'INFINITEPAY_DIVERGENCIA');
    }
    return {
        amount: result.amount,
        paid_amount: result.paid_amount,
        capture_method: result.capture_method,
        installments: result.installments,
    };
}

export class InfinitepayProvider implements PagamentoProvider {
    constructor(private readonly fetcher: typeof fetch = globalThis.fetch) {}

    private async request(
        path: 'links' | 'payment_check',
        apiKey: string,
        payload: Record<string, unknown>,
    ): Promise<unknown> {
        try {
            const response = await this.fetcher(`https://api.checkout.infinitepay.io/${path}`, {
                method: 'POST',
                redirect: 'error',
                signal: AbortSignal.timeout(10_000),
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error('provider');
            return await response.json();
        } catch {
            throw new AppError(
                'InfinitePay temporariamente indisponível.',
                502,
                'INFINITEPAY_INDISPONIVEL',
            );
        }
    }

    async createLink(apiKey: string, payload: Record<string, unknown>): Promise<{ url: string }> {
        const result = await this.request('links', apiKey, payload);
        const url = providerUrl(isRecord(result) ? result.url : undefined);
        if (!url)
            throw new AppError('URL de checkout inválida.', 502, 'INFINITEPAY_RESPOSTA_INVALIDA');
        return { url };
    }

    checkPayment(apiKey: string, payload: Record<string, unknown>): Promise<unknown> {
        return this.request('payment_check', apiKey, payload);
    }
}
