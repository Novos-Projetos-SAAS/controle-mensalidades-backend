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

const moduloHabilitadoId = crypto.randomUUID();
const moduloDesabilitadoAreaId = crypto.randomUUID();
const moduloDesabilitadoOrganizacaoId = crypto.randomUUID();
const moduloInativoId = crypto.randomUUID();
const moduloOutraOrganizacaoId = crypto.randomUUID();

const organizacoesIds = [organizacaoId, outraOrganizacaoId];

const areasIds = [areaNegocioId, areaOutraOrganizacaoId];

const modulosIds = [
    moduloHabilitadoId,
    moduloDesabilitadoAreaId,
    moduloDesabilitadoOrganizacaoId,
    moduloInativoId,
    moduloOutraOrganizacaoId,
];

function gerarToken(usuario: string) {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    return jwt.sign({}, jwtSecret, {
        subject: usuario,
        expiresIn: '1h',
    });
}

async function limparDadosTeste() {
    // Remove vínculos entre áreas e módulos.
    await connection('areas_modulos').whereIn('modulo_id', modulosIds).del();

    // Remove vínculos entre organizações e módulos.
    await connection('organizacoes_modulos').whereIn('modulo_id', modulosIds).del();

    // Remove vínculo do usuário com a organização.
    await connection('usuarios_organizacoes')
        .where({
            usuario_id: usuarioId,
        })
        .del();

    // Remove os módulos criados pelo teste.
    await connection('modulos').whereIn('id', modulosIds).del();

    // Remove as áreas criadas pelo teste.
    await connection('areas_negocio').whereIn('id', areasIds).del();

    // Remove o usuário criado pelo teste.
    await connection('usuarios')
        .where({
            id: usuarioId,
        })
        .del();

    // Remove as organizações criadas pelo teste.
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

before(async () => {
    // Garante que não sobraram dados de uma execução anterior.
    await limparDadosTeste();

    // Organizações utilizadas para validar isolamento multi-tenant.
    await connection('organizacoes').insert([
        {
            id: organizacaoId,
            nome: 'Organização Teste Áreas Módulos',
            ativo: true,
        },
        {
            id: outraOrganizacaoId,
            nome: 'Outra Organização Áreas Módulos',
            ativo: true,
        },
    ]);

    // Áreas de negócio.
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
            nome: 'Pilates Outra Organização',
            codigo: `PILATES_${areaOutraOrganizacaoId.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    // Usuário utilizado nas requisições autenticadas.
    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Usuário Teste Áreas Módulos',
        email: `areas-modulos-${usuarioId}@teste.com`,
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

    // Catálogo de módulos.
    await connection('modulos').insert([
        {
            id: moduloHabilitadoId,
            codigo: `AGENDA_${moduloHabilitadoId.slice(0, 8)}`,
            nome: 'Agenda',
            descricao: 'Módulo habilitado.',
            ativo: true,
        },
        {
            id: moduloDesabilitadoAreaId,
            codigo: `FINANCEIRO_${moduloDesabilitadoAreaId.slice(0, 8)}`,
            nome: 'Financeiro',
            descricao: 'Módulo habilitado na organização e desabilitado na área.',
            ativo: true,
        },
        {
            id: moduloDesabilitadoOrganizacaoId,
            codigo: `CLINICO_${moduloDesabilitadoOrganizacaoId.slice(0, 8)}`,
            nome: 'Clínico',
            descricao: 'Módulo desabilitado na organização.',
            ativo: true,
        },
        {
            id: moduloInativoId,
            codigo: `INATIVO_${moduloInativoId.slice(0, 8)}`,
            nome: 'Módulo Inativo',
            descricao: 'Módulo globalmente inativo.',
            ativo: false,
        },
        {
            id: moduloOutraOrganizacaoId,
            codigo: `OUTRA_ORG_${moduloOutraOrganizacaoId.slice(0, 8)}`,
            nome: 'Módulo Outra Organização',
            descricao: 'Módulo relacionado a outra organização.',
            ativo: true,
        },
    ]);

    // Habilitação dos módulos pela organização.
    await connection('organizacoes_modulos').insert([
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloHabilitadoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDesabilitadoAreaId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDesabilitadoOrganizacaoId,
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

    // Habilitação dos módulos pelas áreas.
    await connection('areas_modulos').insert([
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloHabilitadoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloDesabilitadoAreaId,
            habilitado: false,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloDesabilitadoOrganizacaoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloInativoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaOutraOrganizacaoId,
            modulo_id: moduloOutraOrganizacaoId,
            habilitado: true,
        },
    ]);
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve exigir autenticação', async () => {
    const response = await request(app).get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Autenticação necessária.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve rejeitar token inválido', async () => {
    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', 'token=token-invalido')
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Token de autenticação inválido.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve rejeitar token expirado', async () => {
    const jwtSecret = process.env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioId,
        expiresIn: '-1s',
    });

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);

    assert.equal(response.body.mensagem, 'Sessão expirada.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve exigir organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização não informada.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve rejeitar organização inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', 'organizacao-invalida');

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Organização inválida.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve impedir organização não vinculada ao usuário', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaOutraOrganizacaoId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', outraOrganizacaoId);

    assert.equal(response.status, 403);

    assert.equal(response.body.mensagem, 'Usuário não autorizado nesta organização.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve rejeitar área inválida', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get('/api/v1/areas-negocio/area-invalida/modulos')
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 400);

    assert.equal(response.body.mensagem, 'Área de negócio inválida.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve retornar 404 para área inexistente', async () => {
    const token = gerarToken(usuarioId);

    const areaInexistenteId = crypto.randomUUID();

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaInexistenteId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 404);

    assert.equal(response.body.mensagem, 'Área de negócio não encontrada.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos não deve permitir acessar área de outra organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaOutraOrganizacaoId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 404);

    assert.equal(response.body.mensagem, 'Área de negócio não encontrada.');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos deve listar módulo habilitado na organização e na área', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    assert.equal(response.body.status, 'success');

    assert.equal(response.body.message, 'Módulos da área listados com sucesso.');

    assert.ok(Array.isArray(response.body.data));

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloHabilitadoId,
    );

    assert.ok(modulo);

    assert.equal(modulo.nome, 'Agenda');
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos não deve retornar módulo desabilitado na área', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloDesabilitadoAreaId,
    );

    assert.equal(modulo, undefined);
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos não deve retornar módulo desabilitado na organização', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find(
        (item: { id: string }) => item.id === moduloDesabilitadoOrganizacaoId,
    );

    assert.equal(modulo, undefined);
});

test('GET /api/v1/areas-negocio/:areaNegocioId/modulos não deve retornar módulo inativo', async () => {
    const token = gerarToken(usuarioId);

    const response = await request(app)
        .get(`/api/v1/areas-negocio/${areaNegocioId}/modulos`)
        .set('Cookie', `token=${token}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 200);

    const modulo = response.body.data.find((item: { id: string }) => item.id === moduloInativoId);

    assert.equal(modulo, undefined);
});
