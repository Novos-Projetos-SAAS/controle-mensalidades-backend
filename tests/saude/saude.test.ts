// tests/saude/saude.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../../src/app.js';

test('GET /api/saude deve retornar status 200', async () => {
    const resposta = await request(app).get('/api/saude');

    assert.equal(resposta.status, 200);
});

test('GET /api/saude deve retornar situação OK', async () => {
    const resposta = await request(app).get('/api/saude');

    assert.equal(resposta.body.situacao, 'OK');
});

test('GET /api/saude deve retornar timestamp', async () => {
    const resposta = await request(app).get('/api/saude');

    assert.ok(resposta.body.timestamp);

    assert.equal(typeof resposta.body.timestamp, 'string');
});

test('GET /api/saude deve retornar X-Request-Id no header', async () => {
    const resposta = await request(app).get('/api/saude');

    assert.ok(resposta.headers['x-request-id']);

    assert.equal(typeof resposta.headers['x-request-id'], 'string');
});

test('rota inexistente deve retornar status 404', async () => {
    const resposta = await request(app).get('/api/rota-inexistente');

    assert.equal(resposta.status, 404);
});

test('rota inexistente deve retornar erro padronizado', async () => {
    const resposta = await request(app).get('/api/rota-inexistente');

    assert.equal(resposta.body.situacao, 'falha');

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');

    assert.equal(resposta.body.mensagem, 'Rota GET /api/rota-inexistente não encontrada.');

    assert.ok(resposta.body.request_id);
});

test('request_id do body do erro deve ser o mesmo X-Request-Id do header', async () => {
    const resposta = await request(app).get('/api/rota-inexistente');

    assert.equal(resposta.body.request_id, resposta.headers['x-request-id']);
});
