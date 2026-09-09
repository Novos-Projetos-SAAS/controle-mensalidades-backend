import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import connection from '../../../src/database/connection.js';

const organizacaoId = crypto.randomUUID();
const outraOrganizacaoId = crypto.randomUUID();

const usuarioId = crypto.randomUUID();

const areaNegocioId = crypto.randomUUID();
const areaOutraOrganizacaoId = crypto.randomUUID();
const areaInativaId = crypto.randomUUID();

const organizacoesIds = [organizacaoId, outraOrganizacaoId];

const areasIds = [areaNegocioId, areaOutraOrganizacaoId, areaInativaId];

function gerarToken(usuario: string) {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    return jwt.sign({}, jwtSecret, {
        subject: usuario,
        expiresIn: '1h',
    });
}

async function limparDadosTeste() {
    await connection('usuarios_organizacoes')
        .where({
            usuario_id: usuarioId,
        })
        .del();

    await connection('areas_negocio').whereIn('id', areasIds).del();

    await connection('usuarios')
        .where({
            id: usuarioId,
        })
        .del();

    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoId,
            nome: 'Organização Teste Contexto',
            ativo: true,
        },
        {
            id: outraOrganizacaoId,
            nome: 'Outra Organização Contexto',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaNegocioId,
            organizacao_id: organizacaoId,
            nome: 'Fisioterapia',
            codigo: `FISIO_${areaNegocioId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaOutraOrganizacaoId,
            organizacao_id: outraOrganizacaoId,
            nome: 'Pilates',
            codigo: `PILATES_${areaOutraOrganizacaoId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaInativaId,
            organizacao_id: organizacaoId,
            nome: 'Área Inativa',
            codigo: `INATIVA_${areaInativaId.slice(0, 8)}`,
            ativo: false,
        },
    ]);

    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Usuário Teste Contexto',
        email: `contexto-${usuarioId}@teste.com`,
        senha_hash: 'hash-teste',
        ativo: true,
    });

    await connection('usuarios_organizacoes').insert({
        usuario_id: usuarioId,
        organizacao_id: organizacaoId,
        perfil: 'ADMINISTRADOR',
        ativo: true,
    });
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

test('GET /api/v1/contexto deve exigir autenticação', async () => {
    const response = await request(app)
        .get('/api/v1/contexto')
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 401);
});

test('GET /api/v1/contexto deve rejeitar token inválido', async () => {
    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', 'token=token-invalido')
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 401);
});

test('GET /api/v1/contexto deve rejeitar token expirado', async () => {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioId,
        expiresIn: '-1s',
    });

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 401);
});

test('GET /api/v1/contexto deve exigir organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização não informada.');
});

test('GET /api/v1/contexto deve rejeitar organização inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', 'organizacao-invalida')
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização inválida.');
});

test('GET /api/v1/contexto deve impedir organização não vinculada ao usuário', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', outraOrganizacaoId)
        .set('x-area-negocio-id', areaOutraOrganizacaoId);

    assert.equal(response.status, 403);
});

test('GET /api/v1/contexto deve exigir área de negócio', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Área de negócio não informada.');
});

test('GET /api/v1/contexto deve rejeitar área de negócio inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', 'area-invalida');

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Área de negócio inválida.');
});

test('GET /api/v1/contexto deve retornar 404 para área inexistente', async () => {
    const token = gerarToken(usuarioId);

    const areaInexistenteId = crypto.randomUUID();

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaInexistenteId);

    assert.equal(response.status, 404);

    assert.equal(response.body.mensagem, 'Área de negócio não encontrada.');
});

test('GET /api/v1/contexto não deve permitir área de outra organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaOutraOrganizacaoId);

    assert.equal(response.status, 404);

    assert.equal(response.body.mensagem, 'Área de negócio não encontrada.');
});

test('GET /api/v1/contexto não deve permitir área inativa', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaInativaId);

    assert.equal(response.status, 404);

    assert.equal(response.body.mensagem, 'Área de negócio não encontrada.');
});

test('GET /api/v1/contexto deve carregar o contexto autenticado com organização e área', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/contexto')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId)
        .set('x-area-negocio-id', areaNegocioId);

    assert.equal(response.status, 200);

    assert.equal(response.body.status, 'success');

    assert.equal(response.body.message, 'Contexto carregado com sucesso.');

    assert.equal(response.body.data.usuarioId, usuarioId);

    assert.equal(response.body.data.organizacaoId, organizacaoId);

    assert.equal(response.body.data.areaNegocioId, areaNegocioId);

    assert.equal(response.body.data.perfil, 'ADMINISTRADOR');
});
