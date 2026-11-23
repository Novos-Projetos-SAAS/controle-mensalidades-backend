import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

import app from '../../../src/app.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import AppError from '../../../src/shared/errors/AppError.js';
import documentosClinicosRoutes, {
    exigirHomologacaoDocumental,
} from '../../../src/modules/documentos_clinicos/documentos_clinicos.routes.js';

after(async () => { await connection.destroy(); });

test('rotas de anamnese e laudo nao estao publicadas na API', async () => {
    const requisicoes = [
        request(app).post('/api/v1/documentos-clinicos').send({}),
        request(app).get('/api/v1/documentos-clinicos/paciente/00000000-0000-4000-8000-000000000001'),
        request(app).get('/api/v1/documentos-clinicos/00000000-0000-4000-8000-000000000001'),
        request(app).post('/api/v1/documentos-clinicos/00000000-0000-4000-8000-000000000001/revisoes').send({}),
        request(app).post('/api/v1/documentos-clinicos/00000000-0000-4000-8000-000000000001/finalizar').send({}),
    ];
    const respostas = await Promise.all(requisicoes);
    for (const resposta of respostas) {
        assert.equal(resposta.status, 404);
        assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
    }
});

test('middleware documental permanece fail-closed em 403', () => {
    let recebido: unknown;
    exigirHomologacaoDocumental({} as Request, {} as Response, (error: unknown) => {
        recebido = error;
    });
    assert.ok(recebido instanceof AppError);
    assert.equal(recebido.statusCode, 403);
    assert.equal(recebido.code, 'ACESSO_CLINICO_NAO_CONFIGURADO');
});

test('mesmo o roteador isolado exige usuario autenticado', async () => {
    const isolado = express();
    isolado.use('/documentos-clinicos', documentosClinicosRoutes);
    isolado.use(errorHandler);
    const resposta = await request(isolado).get('/documentos-clinicos').expect(401);
    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});
