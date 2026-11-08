import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import test from 'node:test';

import errorHandler from '../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../src/middlewares/requestId.middleware.js';

test('erro PostgreSQL retorna resposta segura e loga apenas categoria e requestId', async (t) => {
    const app = express();
    const saidasLog: string[] = [];

    t.mock.method(console, 'error', (...argumentos: unknown[]) => {
        saidasLog.push(argumentos.join(' '));
    });

    app.use(requestId);
    app.get('/erro-banco', (_req, _res, next) => {
        next(
            Object.assign(
                new Error(
                    'canceling statement; SQL SELECT evolucao FROM prontuarios; evolucao=texto-clinico-secreto',
                ),
                { code: '57014' },
            ),
        );
    });
    app.use(errorHandler);

    const response = await request(app).get('/erro-banco?token=token-secreto');
    const saida = `${response.text}\n${saidasLog.join('\n')}`;

    assert.equal(response.status, 503);
    assert.equal(response.body.codigo, 'CONSULTA_BANCO_INTERROMPIDA');
    assert.equal(typeof response.body.request_id, 'string');
    assert.match(saida, new RegExp(response.body.request_id));
    assert.match(saida, /consulta_cancelada/);
    assert.doesNotMatch(saida, /texto-clinico-secreto|SELECT evolucao|token-secreto/);
});
