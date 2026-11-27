import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import AppError from '../../../shared/errors/AppError.js';
import {
    cancelSubscriptionInputSchema,
    checkoutInputSchema,
    checkoutListQuerySchema,
    checkoutQuerySchema,
    checkoutSchema,
    customerInputSchema,
    customerListQuerySchema,
    customerQuerySchema,
    customerSchema,
    deleteSubscriptionCheckoutInputSchema,
    paginationSchema,
    productInputSchema,
    productListQuerySchema,
    productQuerySchema,
    productSchema,
    storeSchema,
    subscriptionCheckoutInputSchema,
    subscriptionCheckoutListQuerySchema,
    subscriptionCheckoutQuerySchema,
    subscriptionListQuerySchema,
    subscriptionQuerySchema,
    subscriptionSchema,
} from './types.js';
import type {
    AbacatePayCheckout,
    AbacatePayCredentials,
    AbacatePayPage,
    AbacatePayPort,
    CheckoutListQuery,
    CheckoutQuery,
    CreateCheckoutInput,
    CreateCustomerInput,
    CreateProductInput,
    CreateSubscriptionCheckoutInput,
    CustomerListQuery,
    CustomerQuery,
    ProductListQuery,
    ProductQuery,
    SubscriptionCheckoutListQuery,
    SubscriptionCheckoutQuery,
    SubscriptionListQuery,
    SubscriptionQuery,
} from './types.js';

// https://docs.abacatepay.com/pages/notificacoes/seguranca
const PUBLIC_HMAC_KEY =
    't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

export function verifyAbacatePayWebhook(
    rawBody: Buffer,
    receivedSecret: string,
    signature: string,
    expectedSecret: string,
): boolean {
    if (
        !Buffer.isBuffer(rawBody) ||
        typeof receivedSecret !== 'string' ||
        typeof expectedSecret !== 'string' ||
        expectedSecret.length < 32 ||
        !signature ||
        typeof signature !== 'string'
    )
        return false;
    const receivedHash = createHash('sha256').update(receivedSecret).digest();
    const expectedHash = createHash('sha256').update(expectedSecret).digest();
    const secretValid = timingSafeEqual(receivedHash, expectedHash);
    const expectedSignature = createHmac('sha256', PUBLIC_HMAC_KEY).update(rawBody).digest();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
    const actualSignature = Buffer.from(signature, 'base64');
    return (
        actualSignature.length === expectedSignature.length &&
        timingSafeEqual(actualSignature, expectedSignature) &&
        secretValid
    );
}

function invalidResponse(): AppError {
    return new AppError('Resposta inválida da AbacatePay.', 502, 'ABACATEPAY_RESPOSTA_INVALIDA');
}
function parse<T>(schema: z.ZodType<T>, value: unknown, response = false): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        if (response) throw invalidResponse();
        throw new AppError(
            'Requisição inválida para a AbacatePay.',
            400,
            'ABACATEPAY_REQUISICAO_INVALIDA',
        );
    }
    return parsed.data;
}
function matching(value: Record<string, unknown>, expected: Record<string, unknown>): void {
    for (const key of ['id', 'externalId', 'customerId', 'checkoutId']) {
        if (expected[key] !== undefined && value[key] !== expected[key]) throw invalidResponse();
    }
    if (
        typeof expected.email === 'string' &&
        typeof value.email === 'string' &&
        value.email.toLowerCase() !== expected.email.toLowerCase()
    )
        throw invalidResponse();
}
function validateCheckout(checkout: AbacatePayCheckout): void {
    try {
        const url = new URL(checkout.url);
        if (
            checkout.url !== checkout.url.trim() ||
            /[\\\s]/.test(checkout.url) ||
            url.protocol !== 'https:' ||
            url.hostname !== 'app.abacatepay.com' ||
            url.port ||
            url.username ||
            url.password ||
            url.pathname !== `/pay/${checkout.id}`
        )
            throw invalidResponse();
    } catch {
        throw invalidResponse();
    }
    if (
        checkout.status === 'PAID' &&
        (checkout.paidAmount == null || checkout.paidAmount < checkout.amount)
    )
        throw invalidResponse();
}
function validateCheckoutCreation(checkout: AbacatePayCheckout, input: CreateCheckoutInput): void {
    matching(checkout, input);
    const normalize = (items: Array<{ id: string; quantity: number }>) =>
        items.map(({ id, quantity }) => `${id}:${quantity}`).sort();
    if (JSON.stringify(normalize(checkout.items)) !== JSON.stringify(normalize(input.items)))
        throw invalidResponse();
}

export class AbacatePayProvider implements AbacatePayPort {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;
    constructor(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60_000)
            throw new Error('Timeout inválido.');
    }

    private async request(
        credentials: AbacatePayCredentials,
        method: 'GET' | 'POST',
        path: string,
        input: Record<string, unknown>,
        query = false,
    ): Promise<Record<string, unknown>> {
        const prefix = credentials?.devMode === true ? 'abc_dev_' : 'abc_prod_';
        if (
            typeof credentials?.devMode !== 'boolean' ||
            typeof credentials?.apiKey !== 'string' ||
            !credentials.apiKey.startsWith(prefix) ||
            credentials.apiKey.length <= prefix.length ||
            /\s/.test(credentials.apiKey)
        )
            throw new AppError(
                'Credenciais AbacatePay inválidas para o ambiente.',
                400,
                'ABACATEPAY_CREDENCIAIS_INVALIDAS',
            );
        const url = new URL(`https://api.abacatepay.com/v2/${path}`);
        if (method === 'GET' || query) {
            for (const [key, value] of Object.entries(input))
                if (value !== undefined) url.searchParams.set(key, String(value));
        }
        let response: Response;
        try {
            response = await this.fetcher(url.toString(), {
                method,
                redirect: 'error',
                signal: AbortSignal.timeout(this.timeoutMs),
                headers: {
                    Authorization: `Bearer ${credentials.apiKey}`,
                    'Content-Type': 'application/json',
                },
                ...(method === 'POST' && !query ? { body: JSON.stringify(input) } : {}),
            });
        } catch {
            throw new AppError(
                method === 'POST'
                    ? 'Resultado da operação AbacatePay incerto. Consulte antes de repetir.'
                    : 'AbacatePay temporariamente indisponível.',
                502,
                method === 'POST' ? 'ABACATEPAY_RESULTADO_INCERTO' : 'ABACATEPAY_INDISPONIVEL',
            );
        }
        if (response.status === 404)
            throw new AppError(
                'Recurso não encontrado na AbacatePay.',
                404,
                'ABACATEPAY_NAO_ENCONTRADO',
            );
        let payload: unknown;
        try {
            payload = await response.json();
        } catch {
            if (method === 'POST')
                throw new AppError(
                    'Resultado da operação AbacatePay incerto. Consulte antes de repetir.',
                    502,
                    'ABACATEPAY_RESULTADO_INCERTO',
                );
            throw invalidResponse();
        }
        const envelope =
            payload !== null && typeof payload === 'object' && !Array.isArray(payload)
                ? (payload as Record<string, unknown>)
                : null;
        if (!response.ok || envelope?.success !== true) {
            const reason = typeof envelope?.error === 'string' ? envelope.error : '';
            if (response.status === 400 && /not found|não encontrad/i.test(reason))
                throw new AppError(
                    'Recurso não encontrado na AbacatePay.',
                    404,
                    'ABACATEPAY_NAO_ENCONTRADO',
                );
            if (response.status === 400 && /already exists|já existe/i.test(reason))
                throw new AppError(
                    'Recurso já existe na AbacatePay.',
                    409,
                    'ABACATEPAY_CONFLITO_EXTERNO',
                );
            if (response.status === 401)
                throw new AppError(
                    'Credenciais ou permissões AbacatePay inválidas.',
                    400,
                    'ABACATEPAY_CREDENCIAIS_INVALIDAS',
                );
            throw new AppError(
                'A operação não foi confirmada pela AbacatePay.',
                502,
                method === 'POST' && response.status >= 500
                    ? 'ABACATEPAY_RESULTADO_INCERTO'
                    : 'ABACATEPAY_ERRO_API',
            );
        }
        if (envelope.error !== null || envelope.data == null) throw invalidResponse();
        return envelope;
    }

    private checked<T>(
        schema: z.ZodType<T>,
        value: unknown,
        credentials: AbacatePayCredentials,
    ): T {
        const data = parse(schema, value, true);
        if (
            typeof data === 'object' &&
            data !== null &&
            'devMode' in data &&
            data.devMode !== credentials.devMode
        )
            throw invalidResponse();
        if (schema === checkoutSchema) validateCheckout(data as AbacatePayCheckout);
        return data;
    }
    private async one<T>(
        credentials: AbacatePayCredentials,
        path: string,
        query: Record<string, unknown>,
        schema: z.ZodType<T>,
    ): Promise<T> {
        if (
            !['id', 'externalId', 'customerId', 'email', 'taxId', 'name'].some(
                (key) => query[key] !== undefined,
            )
        )
            throw new AppError(
                'Informe um filtro de consulta AbacatePay.',
                400,
                'ABACATEPAY_REQUISICAO_INVALIDA',
            );
        const envelope = await this.request(credentials, 'GET', path, query);
        const data = this.checked(schema, envelope.data, credentials);
        const record = data as Record<string, unknown>;
        const expected = { ...query };
        // O GET de assinatura filtra externalId, mas não promete retorná-lo no objeto.
        if (schema === subscriptionSchema && record.externalId === undefined)
            delete expected.externalId;
        matching(record, expected);
        return data;
    }
    private async list<T>(
        credentials: AbacatePayCredentials,
        path: string,
        query: Record<string, unknown>,
        schema: z.ZodType<T>,
    ): Promise<AbacatePayPage<T>> {
        if (query.after !== undefined && query.before !== undefined)
            throw new AppError(
                'Use apenas um cursor de paginação.',
                400,
                'ABACATEPAY_REQUISICAO_INVALIDA',
            );
        const envelope = await this.request(credentials, 'GET', path, query);
        if (!Array.isArray(envelope.data)) throw invalidResponse();
        return {
            data: envelope.data.map((value) => {
                const data = this.checked(schema, value, credentials);
                matching(data as Record<string, unknown>, query);
                return data;
            }),
            pagination: parse(paginationSchema, envelope.pagination, true),
        };
    }

    async createCustomer(credentials: AbacatePayCredentials, input: CreateCustomerInput) {
        const body = parse(customerInputSchema, input);
        const envelope = await this.request(credentials, 'POST', 'customers/create', body);
        const data = this.checked(customerSchema, envelope.data, credentials);
        matching(data, body);
        return data;
    }
    async getCustomer(credentials: AbacatePayCredentials, query: CustomerQuery) {
        return this.one(
            credentials,
            'customers/get',
            parse(customerQuerySchema, query),
            customerSchema,
        );
    }
    async listCustomers(credentials: AbacatePayCredentials, query: CustomerListQuery = {}) {
        return this.list(
            credentials,
            'customers/list',
            parse(customerListQuerySchema, query),
            customerSchema,
        );
    }
    async createProduct(credentials: AbacatePayCredentials, input: CreateProductInput) {
        const body = parse(productInputSchema, input);
        const envelope = await this.request(credentials, 'POST', 'products/create', body);
        const data = this.checked(productSchema, envelope.data, credentials);
        matching(data, { externalId: body.externalId });
        if (data.price !== body.price || (data.cycle ?? null) !== (body.cycle ?? null))
            throw invalidResponse();
        return data;
    }
    async getProduct(credentials: AbacatePayCredentials, query: ProductQuery) {
        return this.one(
            credentials,
            'products/get',
            parse(productQuerySchema, query),
            productSchema,
        );
    }
    async listProducts(credentials: AbacatePayCredentials, query: ProductListQuery = {}) {
        return this.list(
            credentials,
            'products/list',
            parse(productListQuerySchema, query),
            productSchema,
        );
    }
    async createCheckout(credentials: AbacatePayCredentials, input: CreateCheckoutInput) {
        const body = parse(checkoutInputSchema, input);
        const envelope = await this.request(credentials, 'POST', 'checkouts/create', body);
        const data = this.checked(checkoutSchema, envelope.data, credentials);
        validateCheckoutCreation(data, body);
        return data;
    }
    async getCheckout(credentials: AbacatePayCredentials, query: CheckoutQuery) {
        return this.one(
            credentials,
            'checkouts/get',
            parse(checkoutQuerySchema, query),
            checkoutSchema,
        );
    }
    async listCheckouts(credentials: AbacatePayCredentials, query: CheckoutListQuery = {}) {
        return this.list(
            credentials,
            'checkouts/list',
            parse(checkoutListQuerySchema, query),
            checkoutSchema,
        );
    }
    async createSubscriptionCheckout(
        credentials: AbacatePayCredentials,
        input: CreateSubscriptionCheckoutInput,
    ) {
        const body = parse(subscriptionCheckoutInputSchema, input);
        const envelope = await this.request(credentials, 'POST', 'subscriptions/create', body);
        const data = this.checked(checkoutSchema, envelope.data, credentials);
        validateCheckoutCreation(data, body);
        return data;
    }
    async getSubscriptionCheckout(
        credentials: AbacatePayCredentials,
        query: SubscriptionCheckoutQuery,
    ) {
        return this.one(
            credentials,
            'subscriptions/checkouts/get',
            parse(subscriptionCheckoutQuerySchema, query),
            checkoutSchema,
        );
    }
    async listSubscriptionCheckouts(
        credentials: AbacatePayCredentials,
        query: SubscriptionCheckoutListQuery = {},
    ) {
        return this.list(
            credentials,
            'subscriptions/checkouts/list',
            parse(subscriptionCheckoutListQuerySchema, query),
            checkoutSchema,
        );
    }
    async deleteSubscriptionCheckout(credentials: AbacatePayCredentials, input: { id: string }) {
        const body = parse(deleteSubscriptionCheckoutInputSchema, input);
        const envelope = await this.request(
            credentials,
            'POST',
            'subscriptions/checkouts/delete',
            body,
            true,
        );
        const data = this.checked(checkoutSchema, envelope.data, credentials);
        matching(data, body);
        return data;
    }
    async getSubscription(credentials: AbacatePayCredentials, query: SubscriptionQuery) {
        return this.one(
            credentials,
            'subscriptions/get',
            parse(subscriptionQuerySchema, query),
            subscriptionSchema,
        );
    }
    async listSubscriptions(credentials: AbacatePayCredentials, query: SubscriptionListQuery = {}) {
        return this.list(
            credentials,
            'subscriptions/list',
            parse(subscriptionListQuerySchema, query),
            subscriptionSchema,
        );
    }
    async cancelSubscription(credentials: AbacatePayCredentials, input: { id: string }) {
        const body = parse(cancelSubscriptionInputSchema, input);
        const envelope = await this.request(credentials, 'POST', 'subscriptions/cancel', body);
        const data = this.checked(subscriptionSchema, envelope.data, credentials);
        matching(data, body);
        if (data.status !== 'CANCELLED') throw invalidResponse();
        return data;
    }
    async getStore(credentials: AbacatePayCredentials) {
        const envelope = await this.request(credentials, 'GET', 'stores/get', {});
        return parse(storeSchema, envelope.data, true);
    }
}
