import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

import verifyUser from '../../../src/middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../../src/middlewares/verifyOrganization.middleware.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';

import contextoArea from '../../../src/modules/contexto/contextoArea.middleware.js';
import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';

// ============================================================
// IDENTIFICADORES FICTÍCIOS
// ============================================================

const organizacaoId = crypto.randomUUID();
const areaId = crypto.randomUUID();

const usuarioTitularId = crypto.randomUUID();
const usuarioOutroId = crypto.randomUUID();
const administradorId = crypto.randomUUID();

const profissionalTitularId = crypto.randomUUID();
const profissionalOutroId = crypto.randomUUID();

const clienteId = crypto.randomUUID();
const sessaoId = crypto.randomUUID();

// ============================================================
// APLICAÇÃO ISOLADA PARA TESTES HTTP
// ============================================================

// Não modifica a API principal.
// Apenas simula a publicação da rota durante os testes.

const appTeste = express();

appTeste.use(requestId);
appTeste.use(express.json());
appTeste.use(cookieParser());

appTeste.get(
    '/sessoes-clinicas/:sessaoClinicaId/historico',
    verifyUser,
    verifyOrganization,
    contextoArea,
    sessoesClinicasController.listarHistoricoCorrecoes,
);

appTeste.get(
    '/sessoes-clinicas/:sessaoClinicaId',
    verifyUser,
    verifyOrganization,
    contextoArea,
    sessoesClinicasController.buscarPorId,
);

appTeste.post(
    '/sessoes-clinicas',
    verifyUser,
    verifyOrganization,
    contextoArea,
    sessoesClinicasController.criar,
);

appTeste.patch(
    '/sessoes-clinicas/:sessaoClinicaId',
    verifyUser,
    verifyOrganization,
    contextoArea,
    sessoesClinicasController.corrigir,
);

appTeste.use(errorHandler);

// ============================================================
// AUTENTICAÇÃO FICTÍCIA
// ============================================================

function cabecalhos(usuarioId: string) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não configurada.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return {
        Cookie: `token=${token}`,
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

// ============================================================
// PREPARAÇÃO DOS DADOS
// ============================================================

before(async () => {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Este teste só pode ser executado em NODE_ENV=test.');
    }

    await connection('organizacoes').insert({
        id: organizacaoId,
        nome: 'Clínica de Autorização HTTP',
        ativo: true,
    });

    await connection('areas_negocio').insert({
        id: areaId,
        organizacao_id: organizacaoId,
        codigo: `HTTP-${areaId.slice(0, 8)}`,
        nome: 'Fisioterapia',
        ativo: true,
    });

    await connection('usuarios').insert(
        [usuarioTitularId, usuarioOutroId, administradorId].map((id) => ({
            id,
            nome: 'Usuário de teste clínico',
            email: `http-clinico-${id}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        })),
    );

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: usuarioTitularId,
            organizacao_id: organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioOutroId,
            organizacao_id: organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: administradorId,
            organizacao_id: organizacaoId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
    ]);

    await connection('clientes').insert({
        id: clienteId,
        organizacao_id: organizacaoId,
        nome: 'Paciente fictício',
        ativo: true,
    });

    await connection('profissionais').insert([
        {
            id: profissionalTitularId,
            organizacao_id: organizacaoId,
            usuario_id: usuarioTitularId,
            nome: 'Fisioterapeuta titular',
            ativo: true,
        },
        {
            id: profissionalOutroId,
            organizacao_id: organizacaoId,
            usuario_id: usuarioOutroId,
            nome: 'Outro fisioterapeuta',
            ativo: true,
        },
    ]);

    await connection('profissionais_areas').insert([
        {
            profissional_id: profissionalTitularId,
            area_negocio_id: areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: profissionalOutroId,
            area_negocio_id: areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);

    await connection('sessoes_clinicas').insert({
        id: sessaoId,
        organizacao_id: organizacaoId,
        area_negocio_id: areaId,
        cliente_id: clienteId,
        profissional_id: profissionalTitularId,
        data_sessao: new Date('2026-10-01T14:00:00Z'),
        evolucao: 'Paciente apresentou melhora do equilíbrio.',
    });
});

// ============================================================
// LIMPEZA DOS DADOS DE TESTE
// ============================================================

after(async () => {
    try {
        if (env.NODE_ENV === 'test') {
            await connection('registros_auditoria').where('organizacao_id', organizacaoId).del();

            await connection('sessoes_clinicas').where('id', sessaoId).del();

            await connection('profissionais_areas')
                .whereIn('profissional_id', [profissionalTitularId, profissionalOutroId])
                .del();

            await connection('profissionais')
                .whereIn('id', [profissionalTitularId, profissionalOutroId])
                .del();

            await connection('clientes').where('id', clienteId).del();

            await connection('usuarios_organizacoes').where('organizacao_id', organizacaoId).del();

            await connection('usuarios')
                .whereIn('id', [usuarioTitularId, usuarioOutroId, administradorId])
                .del();

            await connection('areas_negocio').where('id', areaId).del();

            await connection('organizacoes').where('id', organizacaoId).del();
        }
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// TESTE 1 — PROFISSIONAL TITULAR
// ============================================================

test('fisioterapeuta acessa a própria sessão', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(usuarioTitularId))
        .expect(200);

    assert.equal(resposta.body.status, 'success');
    assert.equal(resposta.body.data.id, sessaoId);

    assert.equal(resposta.body.data.profissional_id, profissionalTitularId);
});

// ============================================================
// TESTE 2 — OUTRO PROFISSIONAL
// ============================================================

test('outro fisioterapeuta não acessa sessão alheia', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(usuarioOutroId))
        .expect(404);

    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
});

// ============================================================
// TESTE 3 — ADMINISTRADOR SEM PERMISSÃO CLÍNICA
// ============================================================

test('administrador não recebe acesso clínico automaticamente', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(administradorId))
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

// ============================================================
// HISTÓRICO 1 — PROFISSIONAL TITULAR
// ============================================================

test('fisioterapeuta acessa o histórico da própria sessão', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .set(cabecalhos(usuarioTitularId))
        .expect(200);

    assert.equal(resposta.body.status, 'success');

    // A sessão ainda não possui correções.
    // Portanto, o histórico deve estar vazio.
    assert.deepEqual(resposta.body.data, []);
});

// ============================================================
// HISTÓRICO 2 — OUTRO PROFISSIONAL
// ============================================================

test('outro fisioterapeuta não acessa histórico alheio', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .set(cabecalhos(usuarioOutroId))
        .expect(404);

    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
});

// ============================================================
// HISTÓRICO 3 — ADMINISTRADOR SEM PERMISSÃO
// ============================================================

test('administrador não acessa histórico clínico sem autorização', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .set(cabecalhos(administradorId))
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

// ============================================================
// TESTE — CORREÇÃO POR OUTRO PROFISSIONAL
// ============================================================

test('outro fisioterapeuta não pode corrigir sessão alheia', async () => {
    const resposta = await request(appTeste)
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(usuarioOutroId))
        .send({
            evolucao: 'Tentativa de alteração indevida.',
        })
        .expect(404);

    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');

    // Confirma que o prontuário permaneceu intacto.
    const sessao = await connection('sessoes_clinicas')
        .select('evolucao')
        .where('id', sessaoId)
        .first();

    assert.equal(sessao?.evolucao, 'Paciente apresentou melhora do equilíbrio.');
});

// ============================================================
// TESTE — CORREÇÃO POR ADMINISTRADOR
// ============================================================

test('administrador sem permissão clínica não pode corrigir sessão', async () => {
    const resposta = await request(appTeste)
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(administradorId))
        .send({
            evolucao: 'Alteração não autorizada.',
        })
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

// ============================================================
// TESTE — CRIAÇÃO EM NOME DE OUTRO PROFISSIONAL
// ============================================================

test('fisioterapeuta não pode criar sessão em nome de outro', async () => {
    const resposta = await request(appTeste)
        .post('/sessoes-clinicas')
        .set(cabecalhos(usuarioOutroId))
        .send({
            cliente_id: clienteId,
            profissional_id: profissionalTitularId,
            data_sessao: '2026-10-01T16:00:00Z',
            evolucao: 'Tentativa de registro em nome de outro profissional.',
        })
        .expect(403);

    assert.equal(resposta.body.codigo, 'PROFISSIONAL_CLINICO_NAO_AUTORIZADO');

    // A tentativa não pode criar uma nova sessão.
    const sessoes = await connection('sessoes_clinicas')
        .select('id')
        .where('organizacao_id', organizacaoId);

    assert.equal(sessoes.length, 1);
    assert.equal(sessoes[0]?.id, sessaoId);
});

// ============================================================
// TESTE 4 — REVOGAÇÃO DE PERMISSÃO
// ============================================================

test('revogação de permissão impede acesso ao prontuário', async () => {
    await connection('profissionais_areas')
        .where({
            profissional_id: profissionalTitularId,
            area_negocio_id: areaId,
        })
        .update({
            acesso_clinico_autorizado: false,
        });

    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${sessaoId}`)
        .set(cabecalhos(usuarioTitularId))
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});
