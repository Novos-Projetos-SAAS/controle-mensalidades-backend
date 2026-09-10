import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import { comparePassword } from '../../../src/utils/senha.utils.js';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();

const adminA1Id = crypto.randomUUID();
const adminA2Id = crypto.randomUUID();
const operadorAId = crypto.randomUUID();
const usuarioInativoAId = crypto.randomUUID();
const usuarioBId = crypto.randomUUID();
const usuarioDeletadoId = crypto.randomUUID();
const vinculoDeletadoUsuarioId = crypto.randomUUID();

const organizacoesIds = [organizacaoAId, organizacaoBId];
const usuariosIds = [
    adminA1Id,
    adminA2Id,
    operadorAId,
    usuarioInativoAId,
    usuarioBId,
    usuarioDeletadoId,
    vinculoDeletadoUsuarioId,
];
const usuariosCriadosIds: string[] = [];
const senhaCriacao = 'SenhaNova123!';
const emailOperadorA = `operador-a-${operadorAId}@teste.com`;

function obterJwtSecretTeste() {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwtSecret;
}

function gerarToken(usuarioId: string) {
    return jwt.sign({}, obterJwtSecretTeste(), {
        subject: usuarioId,
        expiresIn: '1h',
    });
}

function cookieDoUsuario(usuarioId: string) {
    return `token=${gerarToken(usuarioId)}`;
}

async function limparAuditorias() {
    await connection('registros_auditoria')
        .whereIn('usuario_id', usuariosIds)
        .orWhereIn('recurso_id', usuariosIds)
        .orWhereIn('organizacao_id', organizacoesIds)
        .del();
}

async function limparUsuariosCriados() {
    if (usuariosCriadosIds.length === 0) {
        return;
    }

    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosCriadosIds).del();
    await connection('usuarios').whereIn('id', usuariosCriadosIds).del();
    usuariosCriadosIds.length = 0;
}

async function limparDadosTeste() {
    await limparAuditorias();
    await limparUsuariosCriados();
    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
    await connection('usuarios').whereIn('id', usuariosIds).del();
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoAId,
            nome: 'Organização A Usuários',
            ativo: true,
        },
        {
            id: organizacaoBId,
            nome: 'Organização B Usuários',
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: adminA1Id,
            nome: 'Admin A 1',
            email: `admin-a1-${adminA1Id}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: adminA2Id,
            nome: 'Admin A 2',
            email: `admin-a2-${adminA2Id}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador A',
            email: emailOperadorA,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: usuarioInativoAId,
            nome: 'Inativo A',
            email: `inativo-a-${usuarioInativoAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: usuarioBId,
            nome: 'Usuário B',
            email: `usuario-b-${usuarioBId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: usuarioDeletadoId,
            nome: 'Usuário Deletado A',
            email: `deletado-a-${usuarioDeletadoId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: vinculoDeletadoUsuarioId,
            nome: 'Vínculo Deletado A',
            email: `vinculo-deletado-a-${vinculoDeletadoUsuarioId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: adminA1Id,
            organizacao_id: organizacaoAId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: adminA2Id,
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
            usuario_id: usuarioInativoAId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: false,
        },
        {
            usuario_id: usuarioBId,
            organizacao_id: organizacaoBId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioDeletadoId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: vinculoDeletadoUsuarioId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: true,
            deletado_em: new Date(),
        },
    ]);
});

beforeEach(async () => {
    await limparAuditorias();
    await limparUsuariosCriados();

    await connection('usuarios_organizacoes')
        .where({ usuario_id: adminA1Id, organizacao_id: organizacaoAId })
        .update({ perfil: 'ADMINISTRADOR', ativo: true });
    await connection('usuarios_organizacoes')
        .where({ usuario_id: adminA2Id, organizacao_id: organizacaoAId })
        .update({ perfil: 'ADMINISTRADOR', ativo: true });
    await connection('usuarios_organizacoes')
        .where({ usuario_id: operadorAId, organizacao_id: organizacaoAId })
        .update({ perfil: 'OPERADOR', ativo: true });
    await connection('usuarios_organizacoes')
        .where({ usuario_id: usuarioInativoAId, organizacao_id: organizacaoAId })
        .update({ perfil: 'OPERADOR', ativo: false });
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

test('ADMINISTRADOR deve criar OPERADOR normalizado, seguro, vinculado e auditado', async () => {
    const email = `novo-operador-${crypto.randomUUID()}@teste.com`;
    const response = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: '  Novo Operador  ',
            email: `  ${email.toUpperCase()}  `,
            senha: senhaCriacao,
            perfil: 'OPERADOR',
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Usuário criado com sucesso.');
    assert.equal(response.body.data.nome, 'Novo Operador');
    assert.equal(response.body.data.email, email);
    assert.equal(response.body.data.perfil, 'OPERADOR');
    assert.equal(response.body.data.ativo, true);
    assert.equal('senha' in response.body.data, false);
    assert.equal('senha_hash' in response.body.data, false);

    usuariosCriadosIds.push(response.body.data.id);

    const usuario = await connection('usuarios')
        .select('nome', 'email', 'senha_hash', 'ativo')
        .where('id', response.body.data.id)
        .first();
    const vinculo = await connection('usuarios_organizacoes')
        .select('organizacao_id', 'perfil', 'ativo')
        .where('usuario_id', response.body.data.id)
        .first();

    assert.equal(usuario.nome, 'Novo Operador');
    assert.equal(usuario.email, email);
    assert.equal(usuario.ativo, true);
    assert.notEqual(usuario.senha_hash, senhaCriacao);
    assert.match(usuario.senha_hash, /^\$argon2id\$/);
    assert.equal(await comparePassword(senhaCriacao, usuario.senha_hash), true);
    assert.equal(vinculo.organizacao_id, organizacaoAId);
    assert.equal(vinculo.perfil, 'OPERADOR');
    assert.equal(vinculo.ativo, true);

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'USUARIO.CRIADO',
            recurso: 'USUARIO',
            recurso_id: response.body.data.id,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.usuario_id, adminA1Id);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, null);
    assert.equal(auditoria.dados_contexto.usuarioCriadoId, response.body.data.id);
    assert.equal(auditoria.dados_contexto.perfil, 'OPERADOR');
    assert.equal(auditoria.dados_contexto.ativo, true);
    assert.equal('senha' in auditoria.dados_contexto, false);
    assert.equal('senha_hash' in auditoria.dados_contexto, false);
    assert.equal('token' in auditoria.dados_contexto, false);
});

test('ADMINISTRADOR deve criar novo ADMINISTRADOR', async () => {
    const response = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Novo Administrador',
            email: `novo-admin-${crypto.randomUUID()}@teste.com`,
            senha: senhaCriacao,
            perfil: 'ADMINISTRADOR',
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.perfil, 'ADMINISTRADOR');
    assert.equal(response.body.data.ativo, true);

    usuariosCriadosIds.push(response.body.data.id);
});

test('POST deve rejeitar email já cadastrado sem revelar organizações', async () => {
    const response = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Email Existente',
            email: `  ${emailOperadorA.toUpperCase()}  `,
            senha: senhaCriacao,
            perfil: 'OPERADOR',
        });

    assert.equal(response.status, 409);
    assert.equal(response.body.codigo, 'EMAIL_JA_CADASTRADO');
    assert.equal(response.body.mensagem, 'Já existe um usuário cadastrado com este email.');
    assert.equal(JSON.stringify(response.body).includes(organizacaoAId), false);
});

test('OPERADOR não deve criar usuário', async () => {
    const response = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Usuário Bloqueado',
            email: `bloqueado-${crypto.randomUUID()}@teste.com`,
            senha: senhaCriacao,
            perfil: 'OPERADOR',
        });

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

test('POST deve rejeitar body ausente, senha fraca ou perfil inválido', async () => {
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminA1Id),
        'x-organizacao-id': organizacaoAId,
    };
    const bodyAusente = await request(app).post('/api/v1/usuarios').set(cabecalhos).send({});
    const senhaFraca = await request(app)
        .post('/api/v1/usuarios')
        .set(cabecalhos)
        .send({
            nome: 'Senha Fraca',
            email: `senha-fraca-${crypto.randomUUID()}@teste.com`,
            senha: 'fraca',
            perfil: 'OPERADOR',
        });
    const perfilInvalido = await request(app)
        .post('/api/v1/usuarios')
        .set(cabecalhos)
        .send({
            nome: 'Perfil Inválido',
            email: `perfil-invalido-${crypto.randomUUID()}@teste.com`,
            senha: senhaCriacao,
            perfil: 'SUPERADMIN',
        });

    for (const response of [bodyAusente, senhaFraca, perfilInvalido]) {
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_USUARIO_INVALIDOS');
        assert.equal(response.body.mensagem, 'Dados do usuário inválidos.');
    }
});

test('POST deve rejeitar campos de autoridade ou persistência enviados pelo cliente', async () => {
    const response = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Campo Proibido',
            email: `campo-proibido-${crypto.randomUUID()}@teste.com`,
            senha: senhaCriacao,
            perfil: 'OPERADOR',
            organizacao_id: organizacaoBId,
            ativo: false,
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_USUARIO_INVALIDOS');
});

test('requisições concorrentes não devem criar email duplicado nem usuário sem vínculo', async () => {
    const email = `concorrente-${crypto.randomUUID()}@teste.com`;
    const dados = {
        nome: 'Usuário Concorrente',
        email,
        senha: senhaCriacao,
        perfil: 'OPERADOR',
    };

    const respostas = await Promise.all([
        request(app)
            .post('/api/v1/usuarios')
            .set('Cookie', cookieDoUsuario(adminA1Id))
            .set('x-organizacao-id', organizacaoAId)
            .send(dados),
        request(app)
            .post('/api/v1/usuarios')
            .set('Cookie', cookieDoUsuario(adminA1Id))
            .set('x-organizacao-id', organizacaoAId)
            .send(dados),
    ]);

    assert.deepEqual(respostas.map((response) => response.status).sort(), [201, 409]);

    const respostaCriada = respostas.find((response) => response.status === 201);
    const respostaConflito = respostas.find((response) => response.status === 409);

    assert.ok(respostaCriada);
    assert.ok(respostaConflito);
    assert.equal(respostaConflito.body.codigo, 'EMAIL_JA_CADASTRADO');
    usuariosCriadosIds.push(respostaCriada.body.data.id);

    const usuarios = await connection('usuarios').select('id').where('email', email);
    const vinculos = await connection('usuarios_organizacoes')
        .select('usuario_id')
        .whereIn(
            'usuario_id',
            usuarios.map((usuario) => usuario.id),
        );

    assert.equal(usuarios.length, 1);
    assert.equal(vinculos.length, 1);
});

test('novo usuário deve conseguir autenticar com o perfil do vínculo criado', async () => {
    const email = `login-novo-${crypto.randomUUID()}@teste.com`;
    const criacao = await request(app)
        .post('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Usuário Novo Login',
            email,
            senha: senhaCriacao,
            perfil: 'OPERADOR',
        });

    assert.equal(criacao.status, 201);
    usuariosCriadosIds.push(criacao.body.data.id);

    const login = await request(app).post('/api/v1/auth/login').send({
        email,
        senha: senhaCriacao,
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.data.usuario.id, criacao.body.data.id);
    assert.equal(login.body.data.organizacoes.length, 1);
    assert.equal(login.body.data.organizacoes[0].id, organizacaoAId);
    assert.equal(login.body.data.organizacoes[0].perfil, 'OPERADOR');
});

test('ADMINISTRADOR deve listar apenas usuários da organização atual', async () => {
    const response = await request(app)
        .get('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Usuários da organização listados com sucesso.');
    assert.deepEqual(
        response.body.data.map((usuario: { id: string }) => usuario.id),
        [adminA1Id, adminA2Id, usuarioInativoAId, operadorAId],
    );
});

test('listagem deve incluir vínculo inativo', async () => {
    const response = await request(app)
        .get('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId);

    const usuarioInativo = response.body.data.find(
        (usuario: { id: string }) => usuario.id === usuarioInativoAId,
    );

    assert.equal(response.status, 200);
    assert.equal(usuarioInativo.ativo, false);
    assert.equal(usuarioInativo.perfil, 'OPERADOR');
});

test('listagem deve ignorar usuário e vínculo soft-deleted sem expor dados internos', async () => {
    const response = await request(app)
        .get('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId);

    const ids = response.body.data.map((usuario: { id: string }) => usuario.id);

    assert.equal(response.status, 200);
    assert.equal(ids.includes(usuarioDeletadoId), false);
    assert.equal(ids.includes(vinculoDeletadoUsuarioId), false);

    for (const usuario of response.body.data) {
        assert.equal('senha_hash' in usuario, false);
        assert.equal('deletado_em' in usuario, false);
        assert.equal('ultimo_login_em' in usuario, false);
    }
});

test('OPERADOR deve receber PERFIL_NAO_AUTORIZADO', async () => {
    const response = await request(app)
        .get('/api/v1/usuarios')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

test('PATCH deve promover OPERADOR e registrar auditoria segura', async () => {
    const response = await request(app)
        .patch(`/api/v1/usuarios/${operadorAId}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ perfil: 'ADMINISTRADOR' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.perfil, 'ADMINISTRADOR');
    assert.equal(response.body.data.ativo, true);

    const vinculo = await connection('usuarios_organizacoes')
        .select('perfil', 'ativo')
        .where({ usuario_id: operadorAId, organizacao_id: organizacaoAId })
        .first();

    assert.equal(vinculo.perfil, 'ADMINISTRADOR');
    assert.equal(vinculo.ativo, true);

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'USUARIO.VINCULO_ATUALIZADO',
            recurso: 'USUARIO_ORGANIZACAO',
            recurso_id: operadorAId,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.usuario_id, adminA1Id);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, null);
    assert.deepEqual(auditoria.dados_contexto.anterior, {
        perfil: 'OPERADOR',
        ativo: true,
    });
    assert.deepEqual(auditoria.dados_contexto.novo, {
        perfil: 'ADMINISTRADOR',
        ativo: true,
    });
    assert.equal('senha' in auditoria.dados_contexto, false);
    assert.equal('token' in auditoria.dados_contexto, false);
});

test('PATCH deve alterar ativo do vínculo', async () => {
    const response = await request(app)
        .patch(`/api/v1/usuarios/${usuarioInativoAId}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ ativo: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.perfil, 'OPERADOR');
    assert.equal(response.body.data.ativo, true);

    const vinculo = await connection('usuarios_organizacoes')
        .select('ativo')
        .where({ usuario_id: usuarioInativoAId, organizacao_id: organizacaoAId })
        .first();

    assert.equal(vinculo.ativo, true);
});

test('PATCH em usuário de outra organização deve retornar 404 sem vazar tenant', async () => {
    const response = await request(app)
        .patch(`/api/v1/usuarios/${usuarioBId}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ perfil: 'OPERADOR' });

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'USUARIO_NAO_ENCONTRADO');
    assert.equal(response.body.mensagem, 'Usuário não encontrado na organização.');
});

test('PATCH deve rejeitar usuarioId inválido', async () => {
    const response = await request(app)
        .patch('/api/v1/usuarios/id-invalido')
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ ativo: true });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'USUARIO_ID_INVALIDO');
    assert.equal(response.body.mensagem, 'Usuário inválido.');
});

test('PATCH deve rejeitar body vazio ou com campo não permitido', async () => {
    const bodyVazio = await request(app)
        .patch(`/api/v1/usuarios/${operadorAId}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({});
    const campoInvalido = await request(app)
        .patch(`/api/v1/usuarios/${operadorAId}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: 'Nome não permitido' });

    assert.equal(bodyVazio.status, 400);
    assert.equal(bodyVazio.body.codigo, 'DADOS_USUARIO_INVALIDOS');
    assert.equal(campoInvalido.status, 400);
    assert.equal(campoInvalido.body.codigo, 'DADOS_USUARIO_INVALIDOS');
});

test('PATCH não deve rebaixar o último administrador ativo', async () => {
    await connection('usuarios_organizacoes')
        .where({ usuario_id: adminA2Id, organizacao_id: organizacaoAId })
        .update({ ativo: false });

    const response = await request(app)
        .patch(`/api/v1/usuarios/${adminA1Id}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ perfil: 'OPERADOR' });

    assert.equal(response.status, 409);
    assert.equal(response.body.codigo, 'ULTIMO_ADMINISTRADOR');
    assert.equal(
        response.body.mensagem,
        'A organização deve possuir pelo menos um administrador ativo.',
    );
});

test('PATCH não deve inativar o último administrador ativo', async () => {
    await connection('usuarios_organizacoes')
        .where({ usuario_id: adminA2Id, organizacao_id: organizacaoAId })
        .update({ ativo: false });

    const response = await request(app)
        .patch(`/api/v1/usuarios/${adminA1Id}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ ativo: false });

    assert.equal(response.status, 409);
    assert.equal(response.body.codigo, 'ULTIMO_ADMINISTRADOR');
});

test('PATCH deve permitir rebaixar ou inativar admin quando existe outro ativo', async () => {
    const rebaixamento = await request(app)
        .patch(`/api/v1/usuarios/${adminA2Id}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ perfil: 'OPERADOR' });

    assert.equal(rebaixamento.status, 200);
    assert.equal(rebaixamento.body.data.perfil, 'OPERADOR');

    await connection('usuarios_organizacoes')
        .where({ usuario_id: adminA2Id, organizacao_id: organizacaoAId })
        .update({ perfil: 'ADMINISTRADOR', ativo: true });

    const inativacao = await request(app)
        .patch(`/api/v1/usuarios/${adminA2Id}`)
        .set('Cookie', cookieDoUsuario(adminA1Id))
        .set('x-organizacao-id', organizacaoAId)
        .send({ ativo: false });

    assert.equal(inativacao.status, 200);
    assert.equal(inativacao.body.data.ativo, false);
});
