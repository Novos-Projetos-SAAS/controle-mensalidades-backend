import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import AppError from '../../../src/shared/errors/AppError.js';
import {
    AbacatePayProvider,
    verifyAbacatePayWebhook,
} from '../../../src/modules/pagamentos/abacatepay/abacatepay.provider.js';

const credentials = { apiKey: 'abc_dev_unit-test', devMode: true };
const customer = { id: 'cust_test', email: 'test@example.com', devMode: true };
const product = {
    id: 'prod_test',
    externalId: 'product-org-1',
    name: 'Mensalidade',
    price: 1500,
    currency: 'BRL',
    cycle: 'MONTHLY',
    status: 'ACTIVE',
    devMode: true,
};
const checkout = {
    id: 'bill_test',
    externalId: 'charge-org-1',
    customerId: 'cust_test',
    url: 'https://app.abacatepay.com/pay/bill_test',
    amount: 1500,
    paidAmount: null,
    status: 'PENDING',
    items: [{ id: 'prod_test', quantity: 1 }],
    devMode: true,
};
const subscription = {
    id: 'subs_test',
    checkoutId: 'bill_test',
    customerId: 'cust_test',
    amount: 1500,
    status: 'ACTIVE',
    method: 'CARD',
    devMode: true,
};
const pagination = { hasMore: false, next: null, before: null };
const checkoutInput = {
    externalId: 'charge-org-1',
    customerId: 'cust_test',
    items: [{ id: 'prod_test', quantity: 1 }],
    methods: ['CARD' as const],
};
function providerWith(data: unknown, status = 200): AbacatePayProvider {
    return new AbacatePayProvider({
        fetcher: async () => Response.json({ success: true, error: null, data }, { status }),
    });
}
function errorCode(code: string): (error: unknown) => boolean {
    return (error) =>
        error instanceof AppError && error.code === code && !error.message.includes('unit-test');
}

test('API v2 recebe Bearer, corpo JSON, timeout e bloqueio de redirect', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new AbacatePayProvider({
        fetcher: async (url, init) => {
            calls.push({ url: String(url), init: init ?? {} });
            return Response.json({ success: true, error: null, data: customer });
        },
    });
    assert.equal(
        (await provider.createCustomer(credentials, { email: customer.email })).id,
        'cust_test',
    );
    assert.equal(calls[0]?.url, 'https://api.abacatepay.com/v2/customers/create');
    assert.equal(calls[0]?.init.method, 'POST');
    assert.equal(calls[0]?.init.redirect, 'error');
    assert.equal(
        new Headers(calls[0]?.init.headers).get('Authorization'),
        'Bearer abc_dev_unit-test',
    );
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { email: customer.email });
    assert.ok(calls[0]?.init.signal instanceof AbortSignal);
});

test('consulta por email codifica query e não envia corpo', async () => {
    let receivedUrl = '';
    let receivedInit: RequestInit | undefined;
    const provider = new AbacatePayProvider({
        fetcher: async (url, init) => {
            receivedUrl = String(url);
            receivedInit = init;
            return Response.json({ success: true, error: null, data: customer });
        },
    });
    await provider.getCustomer(credentials, { email: 'test@example.com' });
    assert.equal(
        receivedUrl,
        'https://api.abacatepay.com/v2/customers/get?email=test%40example.com',
    );
    assert.equal(receivedInit?.method, 'GET');
    assert.equal(receivedInit?.body, undefined);
});

test('paginação oficial preserva data, next e before e filtra externalId', async () => {
    let requested = '';
    const provider = new AbacatePayProvider({
        fetcher: async (url) => {
            requested = String(url);
            return Response.json({ success: true, error: null, data: [checkout], pagination });
        },
    });
    const result = await provider.listCheckouts(credentials, {
        externalId: 'charge-org-1',
        limit: 1,
    });
    assert.deepEqual(result, { data: [checkout], pagination });
    assert.equal(new URL(requested).searchParams.get('externalId'), 'charge-org-1');
    assert.equal(new URL(requested).searchParams.get('limit'), '1');
});

test('produtos avulsos e recorrentes validam preço inteiro e ciclo', async () => {
    assert.equal(
        (
            await providerWith(product).createProduct(credentials, {
                externalId: product.externalId,
                name: product.name,
                price: 1500,
                currency: 'BRL',
                cycle: 'MONTHLY',
            })
        ).cycle,
        'MONTHLY',
    );
    await assert.rejects(
        providerWith(product).createProduct(credentials, {
            externalId: product.externalId,
            name: product.name,
            price: 15.5,
            currency: 'BRL',
        }),
        errorCode('ABACATEPAY_REQUISICAO_INVALIDA'),
    );
});

test('checkout existente deve corresponder ao externalId e aos itens da criação', async () => {
    await assert.rejects(
        providerWith({ ...checkout, externalId: 'other' }).createCheckout(
            credentials,
            checkoutInput,
        ),
        errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
    );
    await assert.rejects(
        providerWith({ ...checkout, items: [{ id: 'prod_other', quantity: 1 }] }).createCheckout(
            credentials,
            checkoutInput,
        ),
        errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
    );
});

test('assinatura é criada como checkout bill_ e suporta apenas um produto', async () => {
    let path = '';
    const provider = new AbacatePayProvider({
        fetcher: async (url) => {
            path = String(url);
            return Response.json({ success: true, error: null, data: checkout });
        },
    });
    assert.equal(
        (await provider.createSubscriptionCheckout(credentials, checkoutInput)).id,
        'bill_test',
    );
    assert.equal(path, 'https://api.abacatepay.com/v2/subscriptions/create');
    await assert.rejects(
        provider.createSubscriptionCheckout(credentials, {
            ...checkoutInput,
            items: [checkoutInput.items[0]!, { id: 'prod_other', quantity: 1 }],
        }),
        errorCode('ABACATEPAY_REQUISICAO_INVALIDA'),
    );
});

test('consulta de assinatura mantém datas opcionais sem inventar histórico de pagamentos', async () => {
    const result = await providerWith({
        ...subscription,
        currentPeriodStart: '2026-11-01T00:00:00.000Z',
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
        nextChargeAt: null,
    }).getSubscription(credentials, { id: 'subs_test' });
    assert.equal(result.id, 'subs_test');
    assert.equal(result.currentPeriodEnd, '2026-12-01T00:00:00.000Z');
    assert.equal(result.nextChargeAt, null);
    assert.equal(result.payments, undefined);
});

test('cancelamento envia subs_ no body e exclusão de checkout envia bill_ na query', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new AbacatePayProvider({
        fetcher: async (url, init) => {
            calls.push({ url: String(url), init: init ?? {} });
            return Response.json({
                success: true,
                error: null,
                data: String(url).includes('/cancel')
                    ? { ...subscription, status: 'CANCELLED' }
                    : { ...checkout, status: 'CANCELLED' },
            });
        },
    });
    assert.equal(
        (await provider.cancelSubscription(credentials, { id: 'subs_test' })).status,
        'CANCELLED',
    );
    await provider.deleteSubscriptionCheckout(credentials, { id: 'bill_test' });
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { id: 'subs_test' });
    assert.equal(
        calls[1]?.url,
        'https://api.abacatepay.com/v2/subscriptions/checkouts/delete?id=bill_test',
    );
    assert.equal(calls[1]?.init.body, undefined);
});

test('timeouts de mutação são incertos, sem retry nem exposição de erro externo', async () => {
    let calls = 0;
    const provider = new AbacatePayProvider({
        fetcher: async () => {
            calls++;
            throw new Error('abc_dev_unit-test private response');
        },
    });
    await assert.rejects(
        provider.createCheckout(credentials, checkoutInput),
        errorCode('ABACATEPAY_RESULTADO_INCERTO'),
    );
    assert.equal(calls, 1);
});

test('resposta rejeita ambiente divergente e valores/status/identidade inválidos', async () => {
    for (const changed of [
        { devMode: false },
        { amount: 15.5 },
        { status: 'UNKNOWN' },
        { id: 'subs_wrong' },
        { id: 'bill_other' },
    ]) {
        await assert.rejects(
            providerWith({ ...checkout, ...changed }).getCheckout(credentials, { id: 'bill_test' }),
            errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
        );
    }
});

test('checkout rejeita URL fora do host oficial e credenciais na URL', async () => {
    for (const url of [
        'http://app.abacatepay.com/pay/x',
        'https://app.abacatepay.com.evil.example/pay/x',
        'https://user:pass@app.abacatepay.com/pay/x',
        'https://app.abacatepay.com:444/pay/x',
        'https://app.abacatepay.com/pay/bill_other',
    ]) {
        await assert.rejects(
            providerWith({ ...checkout, url }).getCheckout(credentials, { id: 'bill_test' }),
            errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
        );
    }
});

test('checkout PAID exige confirmação de valor pago integral e moeda BRL', async () => {
    for (const changed of [
        { paidAmount: null },
        { paidAmount: 1499 },
        { paidAmount: 1500, currency: 'USD' },
    ]) {
        await assert.rejects(
            providerWith({ ...checkout, status: 'PAID', ...changed }).getCheckout(credentials, {
                id: 'bill_test',
            }),
            errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
        );
    }
    assert.equal(
        (
            await providerWith({ ...checkout, status: 'PAID', paidAmount: 1500 }).getCheckout(
                credentials,
                { id: 'bill_test' },
            )
        ).paidAmount,
        1500,
    );
});

test('resposta JSON truncada em criação mantém resultado incerto', async () => {
    const provider = new AbacatePayProvider({
        fetcher: async () => new Response('{', { status: 200 }),
    });
    await assert.rejects(
        provider.createCheckout(credentials, checkoutInput),
        errorCode('ABACATEPAY_RESULTADO_INCERTO'),
    );
});

test('erros oficiais distinguem recurso ausente, conflito, permissão e indisponibilidade', async () => {
    for (const [status, reason, code] of [
        [400, 'Billing not found abc_dev_unit-test', 'ABACATEPAY_NAO_ENCONTRADO'],
        [404, 'abc_dev_unit-test private not found', 'ABACATEPAY_NAO_ENCONTRADO'],
        [400, 'Product with externalId already exists', 'ABACATEPAY_CONFLITO_EXTERNO'],
        [401, 'Missing permission', 'ABACATEPAY_CREDENCIAIS_INVALIDAS'],
        [500, 'Private server error', 'ABACATEPAY_ERRO_API'],
    ] as const) {
        const provider = new AbacatePayProvider({
            fetcher: async () =>
                Response.json({ success: false, error: reason, data: null }, { status }),
        });
        await assert.rejects(
            provider.getCheckout(credentials, { id: 'bill_test' }),
            errorCode(code),
        );
    }
});

test('consulta de assinatura por externalId suporta resposta oficial sem esse campo', async () => {
    assert.equal(
        (
            await providerWith(subscription).getSubscription(credentials, {
                externalId: 'charge-org-1',
            })
        ).checkoutId,
        'bill_test',
    );
    await assert.rejects(
        providerWith({ ...subscription, externalId: 'another' }).getSubscription(credentials, {
            externalId: 'charge-org-1',
        }),
        errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
    );
});

test('listas mantêm os endpoints separados de clientes, produtos e assinaturas', async () => {
    const paths: string[] = [];
    const provider = new AbacatePayProvider({
        fetcher: async (url) => {
            const path = new URL(url instanceof Request ? url.url : url).pathname;
            paths.push(path);
            const item =
                path === '/v2/customers/list'
                    ? customer
                    : path === '/v2/products/list'
                      ? product
                      : path === '/v2/subscriptions/list'
                        ? subscription
                        : checkout;
            return Response.json({ success: true, error: null, data: [item], pagination });
        },
    });
    assert.equal(
        (await provider.listCustomers(credentials, { email: customer.email })).data[0]?.id,
        'cust_test',
    );
    assert.equal(
        (await provider.listProducts(credentials, { externalId: product.externalId })).data[0]?.id,
        'prod_test',
    );
    assert.equal(
        (await provider.listSubscriptionCheckouts(credentials, { externalId: checkout.externalId }))
            .data[0]?.id,
        'bill_test',
    );
    assert.equal(
        (await provider.listSubscriptions(credentials, { checkoutId: 'bill_test' })).data[0]?.id,
        'subs_test',
    );
    assert.deepEqual(paths, [
        '/v2/customers/list',
        '/v2/products/list',
        '/v2/subscriptions/checkouts/list',
        '/v2/subscriptions/list',
    ]);
});

test('cancelamento só confirma status CANCELLED e IDs de assinatura', async () => {
    await assert.rejects(
        providerWith(subscription).cancelSubscription(credentials, { id: 'subs_test' }),
        errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
    );
    await assert.rejects(
        providerWith(subscription).cancelSubscription(credentials, { id: 'bill_test' }),
        errorCode('ABACATEPAY_REQUISICAO_INVALIDA'),
    );
});

test('consulta inválida ou chave de outro ambiente falha antes de chamar rede', async () => {
    let calls = 0;
    const provider = new AbacatePayProvider({
        fetcher: async () => {
            calls++;
            return Response.json({});
        },
    });
    await assert.rejects(
        provider.getCheckout(credentials, {}),
        errorCode('ABACATEPAY_REQUISICAO_INVALIDA'),
    );
    await assert.rejects(
        provider.getCheckout({ apiKey: 'abc_prod_unit-test', devMode: true }, { id: 'bill_test' }),
        errorCode('ABACATEPAY_CREDENCIAIS_INVALIDAS'),
    );
    await assert.rejects(
        provider.listCheckouts(credentials, { limit: 101 }),
        errorCode('ABACATEPAY_REQUISICAO_INVALIDA'),
    );
    assert.equal(calls, 0);
});

test('envelope com success falso, JSON inválido ou paginação inválida não é aceito', async () => {
    for (const payload of [
        { success: false, error: 'abc_dev_unit-test', data: checkout },
        { success: true, data: null },
        { success: true, data: checkout, error: 'error' },
    ]) {
        const provider = new AbacatePayProvider({ fetcher: async () => Response.json(payload) });
        await assert.rejects(
            provider.getCheckout(credentials, { id: 'bill_test' }),
            (error) => error instanceof AppError && !error.message.includes('unit-test'),
        );
    }
    const provider = new AbacatePayProvider({
        fetcher: async () =>
            Response.json({
                success: true,
                error: null,
                data: [checkout],
                pagination: { hasMore: false },
            }),
    });
    await assert.rejects(
        provider.listCheckouts(credentials),
        errorCode('ABACATEPAY_RESPOSTA_INVALIDA'),
    );
});

// Chave pública publicada pela AbacatePay; não é segredo da conta.
const publicHmacKey =
    't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
const webhookSecret = 'test-webhook-secret-32-characters-long';
test('webhook exige secret e HMAC público sobre os bytes originais', () => {
    const raw = Buffer.from('{ "event": "checkout.completed" }');
    const signature = createHmac('sha256', publicHmacKey).update(raw).digest('base64');
    assert.equal(verifyAbacatePayWebhook(raw, webhookSecret, signature, webhookSecret), true);
    assert.equal(
        verifyAbacatePayWebhook(
            Buffer.from('{"event":"checkout.completed"}'),
            webhookSecret,
            signature,
            webhookSecret,
        ),
        false,
    );
    assert.equal(verifyAbacatePayWebhook(raw, 'wrong', signature, webhookSecret), false);
    assert.equal(
        verifyAbacatePayWebhook(
            raw,
            webhookSecret,
            createHmac('sha256', webhookSecret).update(raw).digest('base64'),
            webhookSecret,
        ),
        false,
    );
    assert.equal(verifyAbacatePayWebhook(raw, webhookSecret, 'not-base64', webhookSecret), false);
    assert.equal(verifyAbacatePayWebhook(raw, '', signature, ''), false);
});
