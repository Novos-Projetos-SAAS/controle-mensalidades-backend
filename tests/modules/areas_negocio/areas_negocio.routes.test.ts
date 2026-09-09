import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import connection from '../../../src/database/connection.js';
import { env } from '../../../src/configuration/env.js';

const organizacaoId = crypto.randomUUID();
const outraOrganizacaoId = crypto.randomUUID();
const usuarioId = crypto.randomUUID();

const areaAtivaId = crypto.randomUUID();
const areaInativaId = crypto.randomUUID();
const areaOutraOrganizacaoId = crypto.randomUUID();

function gerarToken(usuario: string) {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    return jwt.sign({}, jwtSecret, {
        subject: usuario,
        expiresIn: env.JWT_EXPIRES_IN,
    });
}

before(async () => {
    // Organização principal dos testes.
    await connection('organizacoes').insert({
        id: organizacaoId,
        nome: 'Organização Teste Áreas',
        ativo: true,
    });

    // Segunda organização para validar isolamento entre tenants.
    await connection('organizacoes').insert({
        id: outraOrganizacaoId,
        nome: 'Outra Organização Teste',
        ativo: true,
    });

    // Usuário utilizado nos testes autenticados.
    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Usuário Teste Áreas',
        email: `areas-${usuarioId}@teste.com`,
        senha_hash: 'hash-teste',
        ativo: true,
    });

    // Usuário pertence somente à organização principal.
    await connection('usuarios_organizacoes').insert({
        usuario_id: usuarioId,
        organizacao_id: organizacaoId,
        perfil: 'ADMINISTRADOR',
        ativo: true,
    });

    // Área ativa da organização principal.
    await connection('areas_negocio').insert({
        id: areaAtivaId,
        organizacao_id: organizacaoId,
        nome: 'Fisioterapia',
        codigo: `FISIOTERAPIA_${areaAtivaId}`,
        ativo: true,
    });

    // Área inativa: não deve aparecer na listagem.
    await connection('areas_negocio').insert({
        id: areaInativaId,
        organizacao_id: organizacaoId,
        nome: 'Área Inativa',
        codigo: `INATIVA_${areaInativaId}`,
        ativo: false,
    });

    // Área pertencente a outro tenant.
    await connection('areas_negocio').insert({
        id: areaOutraOrganizacaoId,
        organizacao_id: outraOrganizacaoId,
        nome: 'Pilates Outra Organização',
        codigo: `PILATES_${areaOutraOrganizacaoId}`,
        ativo: true,
    });
});

after(async () => {
    // Remove primeiro os registros que possuem FK.
    await connection('areas_negocio')
        .whereIn('id', [areaAtivaId, areaInativaId, areaOutraOrganizacaoId])
        .del();

    await connection('usuarios_organizacoes')
        .where({
            usuario_id: usuarioId,
        })
        .del();

    await connection('usuarios')
        .where({
            id: usuarioId,
        })
        .del();

    await connection('organizacoes').whereIn('id', [organizacaoId, outraOrganizacaoId]).del();

    await connection.destroy();
});

test('GET /api/v1/areas-negocio deve exigir autenticação', async () => {
    const response = await request(app).get('/api/v1/areas-negocio');

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Autenticação necessária.');
});

test('GET /api/v1/areas-negocio deve rejeitar token inválido', async () => {
    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', 'token=token-invalido')
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Token de autenticação inválido.');
});

test('GET /api/v1/areas-negocio deve rejeitar token expirado', async () => {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioId,
        expiresIn: '-1s',
    });

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Sessão expirada.');
});

test('GET /api/v1/areas-negocio deve exigir organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização não informada.');
});

test('GET /api/v1/areas-negocio deve rejeitar organização inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', 'id-invalido');

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização inválida.');
});

test('GET /api/v1/areas-negocio deve impedir acesso a organização não vinculada ao usuário', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', outraOrganizacaoId);

    assert.equal(response.status, 403);

    assert.equal(response.body.mensagem, 'Usuário não autorizado nesta organização.');
});

test('GET /api/v1/areas-negocio deve listar áreas ativas da organização autenticada', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    assert.ok(Array.isArray(response.body));

    const fisioterapia = response.body.find((area: { id: string }) => area.id === areaAtivaId);

    assert.ok(fisioterapia);

    assert.equal(fisioterapia.nome, 'Fisioterapia');

    assert.equal(fisioterapia.organizacao_id, organizacaoId);
});

test('GET /api/v1/areas-negocio não deve retornar áreas inativas', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const areaInativa = response.body.find((area: { id: string }) => area.id === areaInativaId);

    assert.equal(areaInativa, undefined);
});

test('GET /api/v1/areas-negocio não deve vazar áreas de outra organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const areaDeOutroTenant = response.body.find(
        (area: { id: string }) => area.id === areaOutraOrganizacaoId,
    );

    assert.equal(areaDeOutroTenant, undefined);
});
