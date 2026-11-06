import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import sessoesClinicasRoutes from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.routes.js';

// ============================================================
// DADOS FICTÍCIOS
// ============================================================

const organizacaoId = crypto.randomUUID();
const areaId = crypto.randomUUID();
const usuarioId = crypto.randomUUID();

// ============================================================
// PREPARAÇÃO DO BANCO DE TESTES
// ============================================================

before(async () => {
    await connection('organizacoes').insert({
        id: organizacaoId,
        nome: 'Clínica HTTP de Teste',
        ativo: true,
    });

    await connection('areas_negocio').insert({
        id: areaId,
        organizacao_id: organizacaoId,
        codigo: `HTTP-${areaId.slice(0, 8)}`,
        nome: 'Fisioterapia',
        ativo: true,
    });

    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Usuário clínico fictício',
        email: `clinico-${usuarioId}@teste.local`,
        senha_hash: 'hash-ficticio',
        ativo: true,
    });

    await connection('usuarios_organizacoes').insert({
        usuario_id: usuarioId,
        organizacao_id: organizacaoId,
        perfil: 'OPERADOR',
        ativo: true,
    });
});

// ============================================================
// LIMPEZA DOS DADOS FICTÍCIOS
// ============================================================

after(async () => {
    try {
        await connection('usuarios_organizacoes')
            .where({
                usuario_id: usuarioId,
                organizacao_id: organizacaoId,
            })
            .del();

        await connection('areas_negocio').where('id', areaId).del();

        await connection('usuarios').where('id', usuarioId).del();

        await connection('organizacoes').where('id', organizacaoId).del();
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// TESTE — USUÁRIO AUTENTICADO CONTINUA BLOQUEADO
// ============================================================

test('usuário autenticado não acessa rotas clínicas bloqueadas', async () => {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não configurada.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    // Montamos o roteador apenas na aplicação de teste.
    // Isso NÃO publica o endpoint na API principal.
    const appTeste = express();

    appTeste.use(express.json());
    appTeste.use(cookieParser());

    appTeste.use('/sessoes-clinicas', sessoesClinicasRoutes);

    appTeste.use(errorHandler);

    const resposta = await request(appTeste)
        .get('/sessoes-clinicas')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaId)
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NAO_CONFIGURADO');
});
