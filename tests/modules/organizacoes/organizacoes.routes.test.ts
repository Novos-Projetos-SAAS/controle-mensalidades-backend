import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();
const administradorAId = crypto.randomUUID();
const operadorAId = crypto.randomUUID();
const administradorBId = crypto.randomUUID();

const organizacoesIds = [organizacaoAId, organizacaoBId];
const usuariosIds = [administradorAId, operadorAId, administradorBId];

function obterJwtSecretTeste() {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwtSecret;
}

function cookieDoUsuario(usuarioId: string) {
    const token = jwt.sign({}, obterJwtSecretTeste(), {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return `token=${token}`;
}

async function limparDadosTeste() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', organizacoesIds)
        .orWhereIn('usuario_id', usuariosIds)
        .orWhereIn('recurso_id', organizacoesIds)
        .del();
    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
    await connection('usuarios').whereIn('id', usuariosIds).del();
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

async function restaurarOrganizacoes() {
    await connection('organizacoes')
        .where('id', organizacaoAId)
        .update({
            nome: 'Organização A',
            nome_fantasia: 'Fantasia A',
            razao_social: 'Razão Social A Ltda.',
            cpf_cnpj: `A-${organizacaoAId}`.slice(0, 20),
            email: 'contato-a@teste.com',
            telefone: '11999990001',
            ativo: true,
            deletado_em: null,
        });
    await connection('organizacoes')
        .where('id', organizacaoBId)
        .update({
            nome: 'Organização B',
            nome_fantasia: 'Fantasia B',
            razao_social: 'Razão Social B Ltda.',
            cpf_cnpj: `B-${organizacaoBId}`.slice(0, 20),
            email: 'contato-b@teste.com',
            telefone: '11999990002',
            ativo: true,
            deletado_em: null,
        });
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoAId,
            nome: 'Organização A',
            nome_fantasia: 'Fantasia A',
            razao_social: 'Razão Social A Ltda.',
            cpf_cnpj: `A-${organizacaoAId}`.slice(0, 20),
            email: 'contato-a@teste.com',
            telefone: '11999990001',
            cep: '01001-000',
            logradouro: 'Rua Interna A',
            logo_url: 'https://teste.local/logo-a.png',
            ativo: true,
        },
        {
            id: organizacaoBId,
            nome: 'Organização B',
            nome_fantasia: 'Fantasia B',
            razao_social: 'Razão Social B Ltda.',
            cpf_cnpj: `B-${organizacaoBId}`.slice(0, 20),
            email: 'contato-b@teste.com',
            telefone: '11999990002',
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: administradorAId,
            nome: 'Administrador A',
            email: `admin-a-${administradorAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador A',
            email: `operador-a-${operadorAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: administradorBId,
            nome: 'Administrador B',
            email: `admin-b-${administradorBId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: administradorAId,
            organizacao_id: organizacaoAId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: operadorAId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: administradorBId,
            organizacao_id: organizacaoBId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
    ]);
});

beforeEach(async () => {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', organizacoesIds)
        .orWhereIn('usuario_id', usuariosIds)
        .orWhereIn('recurso_id', organizacoesIds)
        .del();
    await restaurarOrganizacoes();
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

test('ADMINISTRADOR deve consultar a organização atual', async () => {
    const response = await request(app)
        .get('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Organização atual consultada com sucesso.');
    assert.equal(response.body.data.id, organizacaoAId);
    assert.equal(response.body.data.nome, 'Organização A');
});

test('OPERADOR deve consultar a organização atual', async () => {
    const response = await request(app)
        .get('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, organizacaoAId);
});

test('GET deve manter isolamento entre organizações', async () => {
    const responseA = await request(app)
        .get('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId);
    const responseB = await request(app)
        .get('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorBId))
        .set('x-organizacao-id', organizacaoBId);

    assert.equal(responseA.status, 200);
    assert.equal(responseB.status, 200);
    assert.equal(responseA.body.data.id, organizacaoAId);
    assert.equal(responseA.body.data.nome, 'Organização A');
    assert.equal(responseB.body.data.id, organizacaoBId);
    assert.equal(responseB.body.data.nome, 'Organização B');
});

test('GET deve retornar somente os campos básicos seguros', async () => {
    const response = await request(app)
        .get('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body.data).sort(), [
        'cpf_cnpj',
        'email',
        'id',
        'nome',
        'nome_fantasia',
        'razao_social',
        'telefone',
    ]);
    assert.equal('ativo' in response.body.data, false);
    assert.equal('deletado_em' in response.body.data, false);
    assert.equal('logradouro' in response.body.data, false);
    assert.equal('logo_url' in response.body.data, false);
});

test('ADMINISTRADOR deve atualizar campos normalizados sem alterar outra organização', async () => {
    const response = await request(app)
        .patch('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: '  Organização A Atualizada  ',
            nome_fantasia: '  Nova Fantasia A  ',
            email: '  NOVO-CONTATO-A@TESTE.COM  ',
            telefone: null,
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Organização atualizada com sucesso.');
    assert.equal(response.body.data.nome, 'Organização A Atualizada');
    assert.equal(response.body.data.nome_fantasia, 'Nova Fantasia A');
    assert.equal(response.body.data.email, 'novo-contato-a@teste.com');
    assert.equal(response.body.data.telefone, null);

    const organizacaoB = await connection('organizacoes')
        .select('nome', 'nome_fantasia', 'email', 'telefone')
        .where('id', organizacaoBId)
        .first();

    assert.deepEqual(organizacaoB, {
        nome: 'Organização B',
        nome_fantasia: 'Fantasia B',
        email: 'contato-b@teste.com',
        telefone: '11999990002',
    });
});

test('OPERADOR não deve atualizar a organização', async () => {
    const response = await request(app)
        .patch('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: 'Alteração não autorizada' });

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');

    const organizacaoA = await connection('organizacoes')
        .select('nome')
        .where('id', organizacaoAId)
        .first();

    assert.equal(organizacaoA.nome, 'Organização A');
});

test('PATCH deve rejeitar body vazio', async () => {
    const response = await request(app)
        .patch('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_ORGANIZACAO_INVALIDOS');
    assert.equal(response.body.mensagem, 'Dados da organização inválidos.');
});

test('PATCH deve rejeitar campos desconhecidos ou de autoridade', async () => {
    const response = await request(app)
        .patch('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Tentativa inválida',
            organizacao_id: organizacaoBId,
            ativo: false,
            deletado_em: new Date().toISOString(),
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_ORGANIZACAO_INVALIDOS');

    const organizacoes = await connection('organizacoes')
        .select('id', 'nome', 'ativo', 'deletado_em')
        .whereIn('id', organizacoesIds)
        .orderBy('id');

    assert.equal(
        organizacoes.every((organizacao) => organizacao.ativo),
        true,
    );
    assert.equal(
        organizacoes.every((organizacao) => organizacao.deletado_em === null),
        true,
    );
    assert.equal(
        organizacoes.some((organizacao) => organizacao.nome === 'Tentativa inválida'),
        false,
    );
});

test('PATCH deve registrar auditoria segura da alteração', async () => {
    const response = await request(app)
        .patch('/api/v1/organizacoes/atual')
        .set('Cookie', cookieDoUsuario(administradorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ email: '  AUDITORIA@TESTE.COM  ' });

    assert.equal(response.status, 200);

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'ORGANIZACAO.ATUALIZADA',
            recurso: 'ORGANIZACAO',
            recurso_id: organizacaoAId,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.usuario_id, administradorAId);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, null);
    assert.deepEqual(auditoria.dados_contexto.anterior, {
        email: 'contato-a@teste.com',
    });
    assert.deepEqual(auditoria.dados_contexto.novo, {
        email: 'auditoria@teste.com',
    });
    assert.equal(typeof auditoria.dados_contexto.requestId, 'string');
    assert.equal('token' in auditoria.dados_contexto, false);
    assert.equal('senha' in auditoria.dados_contexto, false);
    assert.equal('cpf_cnpj' in auditoria.dados_contexto, false);
});
