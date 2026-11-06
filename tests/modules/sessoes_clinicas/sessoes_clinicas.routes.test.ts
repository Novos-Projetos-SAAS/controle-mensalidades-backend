import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';

import app from '../../../src/app.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import AppError from '../../../src/shared/errors/AppError.js';

import { exigirAutorizacaoClinica } from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.routes.js';

import sessoesClinicasRoutes from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.routes.js';

// ============================================================
// CONFIGURAÇÃO DOS TESTES
// ============================================================

const rota = '/api/v1/sessoes-clinicas';
const sessaoId = '00000000-0000-4000-8000-000000000001';

after(async () => {
    await connection.destroy();
});

// ============================================================
// TESTE 1 — CRIAÇÃO NÃO PUBLICADA
// ============================================================

test('POST de sessão clínica ainda não está publicado', async () => {
    const resposta = await request(app).post(rota).send({}).expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 2 — LISTAGEM NÃO PUBLICADA
// ============================================================

test('GET de sessões clínicas ainda não está publicado', async () => {
    const resposta = await request(app).get(rota).expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 3 — CONSULTA INDIVIDUAL NÃO PUBLICADA
// ============================================================

test('GET de sessão clínica por ID ainda não está publicado', async () => {
    const resposta = await request(app).get(`${rota}/${sessaoId}`).expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 4 — CORREÇÃO NÃO PUBLICADA
// ============================================================

test('PATCH de sessão clínica ainda não está publicado', async () => {
    const resposta = await request(app)
        .patch(`${rota}/${sessaoId}`)
        .send({
            evolucao: 'Tentativa de correção.',
        })
        .expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 5 — HISTÓRICO NÃO PUBLICADO
// ============================================================

test('GET do histórico clínico ainda não está publicado', async () => {
    const resposta = await request(app).get(`${rota}/${sessaoId}/historico`).expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 6 — BLOQUEIO TEMPORÁRIO
// ============================================================

test('middleware clínico permanece bloqueado com HTTP 403', () => {
    let erroRecebido: unknown;

    exigirAutorizacaoClinica({} as Request, {} as Response, (erro: unknown) => {
        erroRecebido = erro;
    });

    assert.ok(erroRecebido instanceof AppError);

    assert.equal(erroRecebido.statusCode, 403);

    assert.equal(erroRecebido.code, 'ACESSO_CLINICO_NAO_CONFIGURADO');
});

// ============================================================
// TESTE 7 — AUTENTICAÇÃO OBRIGATÓRIA
// ============================================================

test('roteador clínico exige autenticação', async () => {
    const aplicacaoIsolada = express();

    aplicacaoIsolada.use(express.json());

    aplicacaoIsolada.use('/sessoes-clinicas', sessoesClinicasRoutes);

    aplicacaoIsolada.use(errorHandler);

    const resposta = await request(aplicacaoIsolada).get('/sessoes-clinicas').expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});
