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

const moduloHabilitadoId = crypto.randomUUID();
const moduloDesabilitadoId = crypto.randomUUID();
const moduloInativoId = crypto.randomUUID();
const moduloOutraOrganizacaoId = crypto.randomUUID();

function gerarToken(usuario: string) {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    return jwt.sign({}, jwtSecret, {
        subject: usuario,
        expiresIn: '1h',
    });
}

before(async () => {
    // Organização principal dos testes.
    await connection('organizacoes').insert({
        id: organizacaoId,
        nome: 'Organização Teste Módulos',
        ativo: true,
    });

    // Segunda organização para validar isolamento entre tenants.
    await connection('organizacoes').insert({
        id: outraOrganizacaoId,
        nome: 'Outra Organização Teste Módulos',
        ativo: true,
    });

    // Usuário utilizado nos testes autenticados.
    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Usuário Teste Módulos',
        email: `modulos-${usuarioId}@teste.com`,
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

    // Módulo ativo e habilitado.
    await connection('modulos').insert({
        id: moduloHabilitadoId,
        codigo: `AGENDA_${moduloHabilitadoId.slice(0, 8)}`,
        nome: 'Agenda',
        descricao: 'Módulo de agenda.',
        ativo: true,
    });

    // Módulo ativo, mas desabilitado para a organização.
    await connection('modulos').insert({
        id: moduloDesabilitadoId,
        codigo: `FINANCEIRO_${moduloDesabilitadoId.slice(0, 8)}`,
        nome: 'Financeiro',
        descricao: 'Módulo financeiro.',
        ativo: true,
    });

    // Módulo inativo, mesmo estando habilitado no vínculo.
    await connection('modulos').insert({
        id: moduloInativoId,
        codigo: `CLINICO_${moduloInativoId.slice(0, 8)}`,
        nome: 'Clínico',
        descricao: 'Módulo clínico.',
        ativo: false,
    });

    // Módulo habilitado somente para outra organização.
    await connection('modulos').insert({
        id: moduloOutraOrganizacaoId,
        codigo: `PILATES_${moduloOutraOrganizacaoId.slice(0, 8)}`,
        nome: 'Pilates',
        descricao: 'Módulo de outra organização.',
        ativo: true,
    });

    await connection('organizacoes_modulos').insert([
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloHabilitadoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDesabilitadoId,
            habilitado: false,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloInativoId,
            habilitado: true,
        },
        {
            organizacao_id: outraOrganizacaoId,
            modulo_id: moduloOutraOrganizacaoId,
            habilitado: true,
        },
    ]);
});

after(async () => {
    // Remove primeiro os vínculos que possuem FK.
    await connection('organizacoes_modulos')
        .whereIn('modulo_id', [
            moduloHabilitadoId,
            moduloDesabilitadoId,
            moduloInativoId,
            moduloOutraOrganizacaoId,
        ])
        .del();

    await connection('usuarios_organizacoes')
        .where({
            usuario_id: usuarioId,
        })
        .del();

    await connection('modulos')
        .whereIn('id', [
            moduloHabilitadoId,
            moduloDesabilitadoId,
            moduloInativoId,
            moduloOutraOrganizacaoId,
        ])
        .del();

    await connection('usuarios')
        .where({
            id: usuarioId,
        })
        .del();

    await connection('organizacoes').whereIn('id', [organizacaoId, outraOrganizacaoId]).del();

    await connection.destroy();
});

test('GET /api/v1/modulos deve exigir autenticação', async () => {
    const response = await request(app).get('/api/v1/modulos');

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Autenticação necessária.');
});

test('GET /api/v1/modulos deve rejeitar token inválido', async () => {
    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', 'token=token-invalido')
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Token de autenticação inválido.');
});

test('GET /api/v1/modulos deve rejeitar token expirado', async () => {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioId,
        expiresIn: '-1s',
    });

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Sessão expirada.');
});

test('GET /api/v1/modulos deve exigir organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app).get('/api/v1/modulos').set('Cookie', `token=${token}`);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização não informada.');
});

test('GET /api/v1/modulos deve rejeitar organização inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', 'id-invalido');

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização inválida.');
});

test('GET /api/v1/modulos deve impedir acesso a organização não vinculada ao usuário', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', outraOrganizacaoId);

    assert.equal(response.status, 403);

    assert.equal(response.body.mensagem, 'Usuário não autorizado nesta organização.');
});

test('GET /api/v1/modulos deve listar módulos habilitados da organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    assert.equal(response.body.status, 'success');

    assert.equal(response.body.message, 'Módulos listados com sucesso.');

    assert.ok(Array.isArray(response.body.data));

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloHabilitadoId,
    );

    assert.ok(modulo);

    assert.equal(modulo.nome, 'Agenda');
});

test('GET /api/v1/modulos não deve retornar módulo desabilitado para a organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloDesabilitadoId,
    );

    assert.equal(modulo, undefined);
});

test('GET /api/v1/modulos não deve retornar módulo inativo', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find((item: { id: string }) => item.id === moduloInativoId);

    assert.equal(modulo, undefined);
});

test('GET /api/v1/modulos não deve vazar módulos habilitados somente para outra organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloOutraOrganizacaoId,
    );

    assert.equal(modulo, undefined);
});
