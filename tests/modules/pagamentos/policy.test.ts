import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    dataSaoPaulo,
    deveGerarAutomaticamente,
    expiraCobranca,
    resolverOrigemPlataforma,
    resolverOrigemCobranca,
} from '../../../src/modules/pagamentos/pagamento.policy.js';

test('data de São Paulo respeita a virada local em vez da data UTC', () => {
    assert.equal(dataSaoPaulo(new Date('2026-11-25T02:59:59Z')), '2026-11-24');
    assert.equal(dataSaoPaulo(new Date('2026-11-25T03:00:00Z')), '2026-11-25');
});

test('geração automática alcança dias perdidos dentro da janela e nunca gera atrasadas', () => {
    for (const [due, today, days, expected] of [
        ['2026-11-25', '2026-11-22', 2, false],
        ['2026-11-25', '2026-11-23', 2, true],
        ['2026-11-25', '2026-11-24', 2, true],
        ['2026-11-25', '2026-11-25', 2, true],
        ['2026-11-25', '2026-11-26', 2, false],
        ['2026-11-25', '2026-11-23', 1, false],
        ['2026-11-25', '2026-11-24', 1, true],
        ['2027-01-01', '2026-12-30', 2, true],
        ['2028-03-01', '2028-02-28', 2, true],
        ['2027-03-01', '2027-02-27', 2, true],
        ['2026-11-25', '2026-11-24', 0, false],
        ['2026-11-25', '2026-11-24', 3, false],
        ['2026-02-30', '2026-02-28', 2, false],
        ['2026-11-25', '2026-11-24T00:00:00Z', 2, false],
    ] as const) {
        assert.equal(
            deveGerarAutomaticamente(due, today, days),
            expected,
            `${due}/${today}/${days}`,
        );
    }
});

test('cobrança futura expira no fim do vencimento de São Paulo e atrasada ganha 24 horas', () => {
    assert.equal(
        expiraCobranca('2026-11-26', new Date('2026-11-25T12:00:00Z')).toISOString(),
        '2026-11-27T02:59:59.000Z',
    );
    assert.equal(
        expiraCobranca('2026-11-25', new Date('2026-11-26T02:59:58Z')).toISOString(),
        '2026-11-26T02:59:59.000Z',
    );
    assert.equal(
        expiraCobranca('2026-11-24', new Date('2026-11-25T12:00:00Z')).toISOString(),
        '2026-11-26T12:00:00.000Z',
    );
});

test('expiração permanece futura e limitada a menos de um ano', () => {
    const now = new Date('2026-11-25T12:00:00Z');
    const expiry = expiraCobranca('2030-11-25', now);
    assert.ok(expiry.getTime() > now.getTime());
    assert.ok(expiry.getTime() < new Date('2027-11-25T12:00:00Z').getTime());
    assert.throws(() => expiraCobranca('2026-02-30', now));
    assert.throws(() => expiraCobranca('2026-11-25', new Date('invalid')));
});

test('origem da plataforma precisa ser origem HTTPS exata da allowlist', () => {
    const origins = new Set(['https://app.example.com', 'https://other.example.com']);
    assert.equal(
        resolverOrigemPlataforma('https://app.example.com', origins, 'production'),
        'https://app.example.com',
    );
    for (const candidate of [
        'https://evil.example.com',
        'https://app.example.com/path',
        'https://app.example.com/',
        'https://app.example.com?x=1',
        'https://app.example.com#x',
        'https://user:password@app.example.com',
        'https://app.example.com.evil.example',
        'https://app.example.com\\@evil.example',
        'https://app.example.com\n',
        'http://app.example.com',
        '',
    ]) {
        assert.throws(() => resolverOrigemPlataforma(candidate, origins, 'production'));
    }
});

test('fallback exige única origem confiável e HTTP só funciona em loopback fora de produção', () => {
    assert.equal(
        resolverOrigemPlataforma(undefined, new Set(['https://app.example.com']), 'production'),
        'https://app.example.com',
    );
    for (const origins of [
        new Set<string>(),
        new Set(['https://one.example', 'https://two.example']),
        new Set(['https://app.example/path']),
    ]) {
        assert.throws(() => resolverOrigemPlataforma(undefined, origins, 'production'));
    }
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
        assert.equal(resolverOrigemPlataforma(origin, new Set([origin]), 'test'), origin);
        assert.throws(() => resolverOrigemPlataforma(origin, new Set([origin]), 'production'));
    }
    assert.throws(() =>
        resolverOrigemPlataforma(
            'http://app.example',
            new Set(['http://app.example']),
            'development',
        ),
    );
});

test('origem legada e dominio unico autorizado permitem novo checkout sem alterar regras de entrada', () => {
    const allowed = new Set(['https://controle-mensalidades-frontend.vercel.app']);
    assert.equal(
        resolverOrigemCobranca('http://localhost:3000', allowed, 'production'),
        'https://controle-mensalidades-frontend.vercel.app',
    );
    assert.equal(
        resolverOrigemCobranca('https://preview-antigo.vercel.app', allowed, 'production'),
        'https://controle-mensalidades-frontend.vercel.app',
    );
    // O cadastro continua exigindo origem exata, sem tolerar valores externos.
    assert.throws(() => resolverOrigemPlataforma('http://localhost:3000', allowed, 'production'));
});

test('origem antiga so e recuperada com unica origem valida para o ambiente', () => {
    const allowed = new Set([
        'http://localhost:3000',
        'https://controle-mensalidades-frontend.vercel.app',
    ]);
    assert.equal(
        resolverOrigemCobranca('http://localhost:3000', allowed, 'production'),
        'https://controle-mensalidades-frontend.vercel.app',
    );
    assert.equal(
        resolverOrigemCobranca('https://controle-mensalidades-frontend.vercel.app', allowed, 'production'),
        'https://controle-mensalidades-frontend.vercel.app',
    );
    assert.throws(() =>
        resolverOrigemCobranca('https://antigo.example', new Set([
            'https://app.example.com',
            'https://preview.example.com',
        ]), 'production'),
    );
    assert.throws(() => resolverOrigemCobranca(null, new Set(), 'production'));
    assert.throws(() =>
        resolverOrigemCobranca('http://localhost:3000', new Set(['http://localhost:3000']), 'production'),
    );
});

test('origem configurada continua prevalecendo entre varias autorizadas', () => {
    const allowed = new Set(['https://app.example.com', 'https://preview.example.com']);
    assert.equal(
        resolverOrigemCobranca('https://app.example.com', allowed, 'production'),
        'https://app.example.com',
    );
});
