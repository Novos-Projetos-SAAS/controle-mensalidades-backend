// tests/saude/saude.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../src/app.js';

test('GET /api/v1/saude deve retornar status 200', async () => {
    const resposta = await request(app).get('/api/v1/saude');

    assert.equal(resposta.status, 200);
});

test('GET /api/v1/saude deve retornar situação OK', async () => {
    const resposta = await request(app).get('/api/v1/saude');

    assert.equal(resposta.body.situacao, 'OK');
});

test('GET /api/v1/saude deve retornar timestamp', async () => {
    const resposta = await request(app).get('/api/v1/saude');

    assert.ok(resposta.body.timestamp);

    assert.equal(typeof resposta.body.timestamp, 'string');
});

test('GET /api/v1/saude deve retornar X-Request-Id no header', async () => {
    const resposta = await request(app).get('/api/v1/saude');

    assert.ok(resposta.headers['x-request-id']);

    assert.equal(typeof resposta.headers['x-request-id'], 'string');
});

test('GET /docs deve publicar a interface Swagger', async () => {
    const resposta = await request(app).get('/docs');

    assert.equal(resposta.status, 200);
    assert.match(resposta.headers['content-type'], /text\/html/);
    assert.match(resposta.text, /SwaggerUIBundle/);
});

test('GET /docs/openapi.json deve publicar OpenAPI 3.1', async () => {
    const resposta = await request(app).get('/docs/openapi.json');

    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.openapi, '3.1.0');
    assert.equal(resposta.body.info.version, '1.0.0');
    assert.ok(resposta.body.paths['/saude']);
});

test('rota inexistente da v1 deve retornar status 404', async () => {
    const resposta = await request(app).get('/api/v1/rota-inexistente');

    assert.equal(resposta.status, 404);
});

test('rota inexistente da v1 deve retornar erro padronizado', async () => {
    const resposta = await request(app).get('/api/v1/rota-inexistente');

    assert.equal(resposta.body.situacao, 'falha');

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');

    assert.equal(
        resposta.body.mensagem,
        'Rota GET /api/v1/rota-inexistente não encontrada.',
    );

    assert.ok(resposta.body.request_id);
});

test('request_id do body do erro deve ser o mesmo X-Request-Id do header', async () => {
    const resposta = await request(app).get('/api/v1/rota-inexistente');

    assert.equal(resposta.body.request_id, resposta.headers['x-request-id']);
});

test('rota antiga /api/saude não deve continuar ativa após versionamento', async () => {
    const resposta = await request(app).get('/api/saude');

    assert.equal(resposta.status, 404);
});
