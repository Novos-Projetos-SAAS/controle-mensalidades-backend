import test from 'node:test';
import assert from 'node:assert/strict';

import express from 'express';
import request from 'supertest';

import errorHandler from '../../src/middlewares/errorHandler.middleware.js';
import { limitadorGeral } from '../../src/middlewares/rateLimit.middleware.js';
import requestId from '../../src/middlewares/requestId.middleware.js';

test('limitador geral deve limitar a API e ignorar health e OPTIONS', async () => {
    const appTeste = express();

    appTeste.use(requestId);
    appTeste.use('/api', limitadorGeral);
    appTeste.get('/api/recurso', (_req, res) => res.status(200).json({ status: 'success' }));
    appTeste.get('/api/v1/health', (_req, res) => res.status(200).json({ status: 'success' }));
    appTeste.options('/api/recurso', (_req, res) => res.status(204).end());
    appTeste.use(errorHandler);

    let response = await request(appTeste).get('/api/recurso');

    assert.equal(response.status, 200);
    assert.ok(response.headers.ratelimit);
    assert.equal(response.headers['x-ratelimit-limit'], undefined);

    for (let requisicao = 1; requisicao < 1501; requisicao += 1) {
        response = await request(appTeste).get('/api/recurso');
    }

    assert.equal(response.status, 429);
    assert.equal(response.body.situacao, 'falha');
    assert.equal(response.body.codigo, 'MUITAS_REQUISICOES');
    assert.equal(typeof response.body.request_id, 'string');

    const health = await request(appTeste).get('/api/v1/health');
    assert.equal(health.status, 200);

    const options = await request(appTeste).options('/api/recurso');
    assert.equal(options.status, 204);
});
