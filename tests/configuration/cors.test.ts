import assert from 'node:assert/strict';
import test from 'node:test';
import cors from 'cors';

import { criarOpcoesCors, resolverOrigensCors } from '../../src/configuration/cors.js';

test('CORS usa origem local explícita em desenvolvimento e nenhuma origem implícita em produção', () => {
    assert.deepEqual([...resolverOrigensCors(undefined, 'development')], ['http://localhost:3000']);
    assert.deepEqual([...resolverOrigensCors(undefined, 'production')], []);
});

test('CORS aceita somente origens exatas e rejeita wildcard e caminhos', () => {
    assert.deepEqual(
        [...resolverOrigensCors('http://localhost:3000,https://app.example.com', 'production')],
        ['http://localhost:3000', 'https://app.example.com'],
    );
    assert.throws(() => resolverOrigensCors('*', 'production'));
    assert.throws(() => resolverOrigensCors('https://app.example.com/path', 'production'));
});

test('CORS com credenciais reflete apenas origens permitidas e limita métodos e headers', () => {
    const options = criarOpcoesCors(new Set(['http://localhost:3000']));
    let permitido: unknown;
    const resolverOrigem = options.origin;
    assert.equal(typeof resolverOrigem, 'function');
    if (typeof resolverOrigem !== 'function') throw new Error('Resolver de origem CORS ausente.');

    resolverOrigem('http://localhost:3000', (_error, value) => {
        permitido = value;
    });
    assert.equal(permitido, true);

    resolverOrigem('https://evil.example', (_error, value) => {
        permitido = value;
    });
    assert.equal(permitido, false);
    assert.equal(options.credentials, true);
    assert.deepEqual(options.methods, ['GET', 'POST', 'PATCH', 'OPTIONS']);
    assert.ok(options.allowedHeaders?.includes('X-Organizacao-Id'));
    assert.ok(options.allowedHeaders?.includes('X-Area-Negocio-Id'));
    assert.ok(options.allowedHeaders?.includes('Idempotency-Key'));
});

test('CORS responde preflight OPTIONS para origem permitida e não autoriza a origem externa', async () => {
    async function simularPreflight(origin: string) {
        const headers: Record<string, string> = {};
        let statusCode = 200;
        let encerrada = false;
        let proximoMiddleware = false;
        const req = {
            method: 'OPTIONS',
            headers: {
                origin,
                'access-control-request-method': 'POST',
                'access-control-request-headers':
                    'content-type,x-organizacao-id,x-area-negocio-id,idempotency-key',
            },
        };
        const res = {
            get statusCode() {
                return statusCode;
            },
            set statusCode(value: number) {
                statusCode = value;
            },
            setHeader(nome: string, valor: string) {
                headers[nome.toLowerCase()] = valor;
            },
            getHeader(nome: string) {
                return headers[nome.toLowerCase()];
            },
            end() {
                encerrada = true;
                return this;
            },
        };

        await new Promise<void>((resolve, reject) => {
            cors(criarOpcoesCors(new Set(['http://localhost:3000'])))(
                req as never,
                res as never,
                (error?: unknown) => {
                    if (error) reject(error);
                    proximoMiddleware = true;
                    resolve();
                },
            );
            if (encerrada || proximoMiddleware) resolve();
        });

        return { headers, statusCode, encerrada, proximoMiddleware };
    }

    const permitida = await simularPreflight('http://localhost:3000');
    assert.equal(permitida.statusCode, 204);
    assert.equal(permitida.encerrada, true);
    assert.equal(permitida.headers['access-control-allow-origin'], 'http://localhost:3000');
    assert.equal(permitida.headers['access-control-allow-credentials'], 'true');
    assert.match(permitida.headers['access-control-allow-headers'] ?? '', /x-organizacao-id/i);
    assert.match(permitida.headers['access-control-allow-headers'] ?? '', /idempotency-key/i);

    const negada = await simularPreflight('https://origem-nao-autorizada.example');
    assert.equal(negada.proximoMiddleware, true);
    assert.equal(negada.headers['access-control-allow-origin'], undefined);
});
