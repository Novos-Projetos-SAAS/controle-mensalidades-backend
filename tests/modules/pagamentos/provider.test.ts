import assert from 'node:assert/strict';
import { test } from 'node:test';
import AppError from '../../../src/shared/errors/AppError.js';
import {
    InfinitepayProvider,
    providerUrl,
    validatePaymentCheck,
} from '../../../src/modules/pagamentos/infinitepay.provider.js';
import {
    cifrarSegredo,
    decifrarSegredo,
    validarChaveEncriptacao,
} from '../../../src/modules/pagamentos/credenciais.js';

const identifiers = {
    order_nsu: 'charge-123',
    transaction_nsu: 'transaction-456',
    slug: 'invoice-789',
};
const confirmed = {
    success: true,
    paid: true,
    amount: 1500,
    paid_amount: 1510,
    capture_method: 'pix',
    installments: 1,
};
const key = Buffer.alloc(32, 7).toString('base64');

function appError(error: unknown): boolean {
    return error instanceof AppError && !error.message.includes('secret-api-key');
}

test('URLs de checkout exigem HTTPS e host exato sem credenciais', () => {
    for (const url of [
        'https://buy.infinitepay.io/checkout/abc',
        'https://checkout.infinitepay.io/abc?mode=pix',
    ]) {
        assert.equal(providerUrl(url), url);
    }
    for (const url of [
        null,
        {},
        'http://buy.infinitepay.io/abc',
        'https://buy.infinitepay.io.evil.example/abc',
        'https://evil.example/?next=https://buy.infinitepay.io/abc',
        'https://buy.infinitepay.io@evil.example/abc',
        'https://user:password@buy.infinitepay.io/abc',
        'https://buy.infinitepay.io:444/abc',
        'https://buy.infinitepay.io\\@evil.example/abc',
        ' https://buy.infinitepay.io/abc',
        'https://buy.infinitepay.io/abc\n',
        'javascript:alert(1)',
    ]) {
        assert.equal(providerUrl(url), null, String(url));
    }
});

test('cliente usa endpoints fixos, POST autenticado, timeout e bloqueio de redirects', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const provider = new InfinitepayProvider(async (input, init) => {
        requests.push({ url: String(input), init: init ?? {} });
        return Response.json(
            String(input).endsWith('/links')
                ? { url: 'https://buy.infinitepay.io/abc' }
                : confirmed,
        );
    });

    assert.deepEqual(await provider.createLink('secret-api-key', { order_nsu: 'charge-123' }), {
        url: 'https://buy.infinitepay.io/abc',
    });
    assert.deepEqual(await provider.checkPayment('secret-api-key', identifiers), confirmed);
    assert.deepEqual(
        requests.map(({ url }) => url),
        [
            'https://api.checkout.infinitepay.io/links',
            'https://api.checkout.infinitepay.io/payment_check',
        ],
    );
    for (const { init } of requests) {
        assert.equal(init.method, 'POST');
        assert.equal(init.redirect, 'error');
        assert.equal(new Headers(init.headers).get('X-Api-Key'), 'secret-api-key');
        assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
        assert.ok(init.signal instanceof AbortSignal);
    }
    assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), { order_nsu: 'charge-123' });
    assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), identifiers);
});

test('cliente não repete criação incerta nem expõe resposta externa nos erros', async () => {
    let calls = 0;
    const provider = new InfinitepayProvider(async () => {
        calls++;
        throw new Error('secret-api-key: timed out');
    });
    await assert.rejects(provider.createLink('secret-api-key', {}), appError);
    assert.equal(calls, 1);

    for (const response of [
        new Response('secret-api-key', { status: 401 }),
        new Response('not json'),
        Response.json({ url: 'https://evil.example/checkout' }),
        Response.json({ url: null }),
    ]) {
        const failing = new InfinitepayProvider(async () => response);
        await assert.rejects(failing.createLink('secret-api-key', {}), appError);
    }
});

test('confirmação oficial preserva centavos inteiros e aceita Pix/cartão e taxas', () => {
    assert.deepEqual(validatePaymentCheck(confirmed, 1500n, identifiers), {
        amount: 1500,
        paid_amount: 1510,
        capture_method: 'pix',
        installments: 1,
    });
    assert.equal(
        validatePaymentCheck(
            { ...confirmed, capture_method: 'credit_card', installments: 12 },
            1500n,
            identifiers,
        ).installments,
        12,
    );
});

test('confirmação rejeita booleanos frouxos, valores inválidos e método desconhecido', () => {
    const invalid: unknown[] = [
        null,
        [],
        { ...confirmed, success: 'true' },
        { ...confirmed, paid: 1 },
        { ...confirmed, success: false },
        { ...confirmed, paid: false },
        { ...confirmed, amount: '1500' },
        { ...confirmed, amount: 1500.5 },
        { ...confirmed, amount: 0 },
        { ...confirmed, amount: -1500 },
        { ...confirmed, amount: Number.MAX_SAFE_INTEGER + 1 },
        { ...confirmed, paid_amount: '1510' },
        { ...confirmed, paid_amount: 1499 },
        { ...confirmed, paid_amount: Number.MAX_SAFE_INTEGER + 1 },
        { ...confirmed, paid_amount: Number.NaN },
        { ...confirmed, amount: 1501 },
        { ...confirmed, capture_method: 'debit_card' },
        { ...confirmed, installments: 0 },
        { ...confirmed, installments: 1.5 },
        { ...confirmed, installments: 13 },
    ];
    for (const result of invalid) {
        assert.throws(() => validatePaymentCheck(result, 1500n, identifiers), appError);
    }
    assert.throws(() => validatePaymentCheck(confirmed, 0n, identifiers), appError);
    assert.throws(() => validatePaymentCheck(confirmed, 9007199254740993n, identifiers), appError);
});

test('identificadores devolvidos precisam coincidir exatamente com a cobrança consultada', () => {
    assert.equal(
        validatePaymentCheck({ ...confirmed, ...identifiers }, 1500n, identifiers).amount,
        1500,
    );
    assert.equal(
        validatePaymentCheck({ ...confirmed, invoice_slug: identifiers.slug }, 1500n, identifiers)
            .amount,
        1500,
    );
    for (const field of ['order_nsu', 'transaction_nsu', 'slug', 'invoice_slug']) {
        for (const value of ['other-charge', 123, null, undefined]) {
            assert.throws(
                () => validatePaymentCheck({ ...confirmed, [field]: value }, 1500n, identifiers),
                appError,
            );
        }
    }
});

test('chave de criptografia exige 32 bytes em Base64 canônico', () => {
    assert.deepEqual(validarChaveEncriptacao(key), Buffer.alloc(32, 7));
    for (const value of [
        undefined,
        '',
        'invalid',
        key.trimEnd() + '\n',
        key.slice(0, -1),
        Buffer.alloc(31).toString('base64'),
    ]) {
        assert.throws(() => validarChaveEncriptacao(value), appError);
    }
});

test('segredo é versionado, usa IV aleatório e vincula organização/conta/finalidade', () => {
    const encrypted = cifrarSegredo('secret-api-key', key, 'api:org-1:handle-1');
    assert.ok(encrypted.startsWith('v1.'));
    assert.ok(!encrypted.includes('secret-api-key'));
    assert.notEqual(encrypted, cifrarSegredo('secret-api-key', key, 'api:org-1:handle-1'));
    assert.equal(decifrarSegredo(encrypted, key, 'api:org-1:handle-1'), 'secret-api-key');
    for (const scope of ['api:org-2:handle-1', 'api:org-1:handle-2', 'token:org-1:handle-1']) {
        assert.throws(() => decifrarSegredo(encrypted, key, scope), appError);
    }
    assert.throws(
        () =>
            decifrarSegredo(
                encrypted,
                Buffer.alloc(32, 8).toString('base64'),
                'api:org-1:handle-1',
            ),
        appError,
    );
    assert.throws(() => cifrarSegredo('secret-api-key', key, ''), appError);
});

test('segredo adulterado, truncado ou com versão desconhecida falha fechado', () => {
    const encrypted = cifrarSegredo('secret-api-key', key, 'api:org-1:handle-1');
    const parts = encrypted.split('.');
    const ciphertext = parts.at(-1) ?? '';
    const altered = [
        ...parts.slice(0, -1),
        (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1),
    ].join('.');
    for (const value of [
        'plain-secret',
        encrypted.replace('v1.', 'v2.'),
        encrypted + '.extra',
        encrypted.slice(0, -4),
        altered,
    ]) {
        assert.throws(() => decifrarSegredo(value, key, 'api:org-1:handle-1'), appError);
    }
});
