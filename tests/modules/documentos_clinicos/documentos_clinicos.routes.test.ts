import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

import app from '../../../src/app.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import AppError from '../../../src/shared/errors/AppError.js';
import prontuarioTimelineRoutes, { exigirHomologacaoProntuario } from '../../../src/modules/prontuario/prontuario.timeline.routes.js';
import vinculosClinicosRoutes, { exigirHomologacaoVinculos } from '../../../src/modules/vinculos_clinicos/vinculos_clinicos.routes.js';
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

test('linha do tempo continua ausente de /api/v1 e bloqueada em roteador isolado', async () => {
    const uri = '/api/v1/prontuario/pacientes/00000000-0000-4000-8000-000000000001/historico';
    const publicada = await request(app).get(uri).expect(404);
    assert.equal(publicada.body.codigo, 'ROTA_NAO_ENCONTRADA');

    let bloqueio: unknown;
    exigirHomologacaoProntuario({} as Request, {} as Response, (erro: unknown) => {
        bloqueio = erro;
    });
    assert.ok(bloqueio instanceof AppError);
    assert.equal(bloqueio.code, 'ACESSO_CLINICO_NAO_CONFIGURADO');
    assert.equal(bloqueio.statusCode, 403);

    const isolado = express();
    isolado.use('/prontuario', prontuarioTimelineRoutes);
    isolado.use(errorHandler);
    const semToken = await request(isolado)
        .get('/prontuario/pacientes/00000000-0000-4000-8000-000000000001/historico')
        .expect(401);
    assert.equal(semToken.body.codigo, 'TOKEN_AUSENTE');
});

test('rotas de vinculo paciente-profissional permanecem ausentes e protegidas', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const urls = [
        ['/api/v1/vinculos-clinicos', 'post'],
        [`/api/v1/vinculos-clinicos/paciente/${id}`, 'get'],
        [`/api/v1/vinculos-clinicos/${id}/revogar`, 'post'],
    ] as const;
    for (const [url, metodo] of urls) {
        const resposta = await (metodo === 'post' ? request(app).post(url) : request(app).get(url))
            .expect(404);
        assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
    }

    let erro: unknown;
    exigirHomologacaoVinculos({} as Request, {} as Response, (e: unknown) => { erro = e; });
    assert.ok(erro instanceof AppError);
    assert.equal(erro.code, 'ACESSO_CLINICO_NAO_CONFIGURADO');

    const isolado = express();
    isolado.use('/vinculos-clinicos', vinculosClinicosRoutes);
    isolado.use(errorHandler);
    const semToken = await request(isolado).get(`/vinculos-clinicos/paciente/${id}`).expect(401);
    assert.equal(semToken.body.codigo, 'TOKEN_AUSENTE');
});

test('lista de pacientes vinculados nunca e publicada por engano', async () => {
    const identidade = await request(app).get('/api/v1/prontuario/identidade').expect(404);
    assert.equal(identidade.body.codigo, 'ROTA_NAO_ENCONTRADA');
    const resposta = await request(app).get('/api/v1/prontuario/pacientes').expect(404);
    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');

    const isolado = express();
    isolado.use('/prontuario', prontuarioTimelineRoutes);
    isolado.use(errorHandler);
    await request(isolado).get('/prontuario/pacientes').expect(401);
});
