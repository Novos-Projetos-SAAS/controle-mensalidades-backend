import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import { hashPassword } from '../../../src/utils/senha.utils.js';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();
const organizacaoInativaId = crypto.randomUUID();
const organizacaoVinculoInativoId = crypto.randomUUID();
const organizacaoDeletadaId = crypto.randomUUID();
const organizacaoVinculoDeletadoId = crypto.randomUUID();

const usuarioAtivoId = crypto.randomUUID();
const usuarioInativoId = crypto.randomUUID();
const usuarioDeletadoId = crypto.randomUUID();
const usuarioSemOrganizacaoId = crypto.randomUUID();

const organizacoesIds = [
    organizacaoAId,
    organizacaoBId,
    organizacaoInativaId,
    organizacaoVinculoInativoId,
    organizacaoDeletadaId,
    organizacaoVinculoDeletadoId,
];

const usuariosIds = [usuarioAtivoId, usuarioInativoId, usuarioDeletadoId, usuarioSemOrganizacaoId];

const emailUsuarioAtivo = `auth-${usuarioAtivoId}@exemplo.com`;
const emailUsuarioInativo = `auth-inativo-${usuarioInativoId}@exemplo.com`;
const emailUsuarioDeletado = `auth-deletado-${usuarioDeletadoId}@exemplo.com`;
const emailUsuarioSemOrganizacao = `auth-sem-org-${usuarioSemOrganizacaoId}@exemplo.com`;
const senhaValida = 'SenhaTeste123!';

const duracaoCookiePorJwt = {
    '1h': 1 * 60 * 60,
    '8h': 8 * 60 * 60,
    '12h': 12 * 60 * 60,
    '1d': 24 * 60 * 60,
    '7d': 7 * 24 * 60 * 60,
    '30d': 30 * 24 * 60 * 60,
} as const;

async function limparDadosTeste() {
    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
    await connection('usuarios').whereIn('id', usuariosIds).del();
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

before(async () => {
    await limparDadosTeste();

    const senhaHash = await hashPassword(senhaValida);

    await connection('organizacoes').insert([
        {
            id: organizacaoAId,
            nome: 'Academia A Auth',
            ativo: true,
        },
        {
            id: organizacaoBId,
            nome: 'Academia B Auth',
            ativo: true,
        },
        {
            id: organizacaoInativaId,
            nome: 'Academia Inativa Auth',
            ativo: false,
        },
        {
            id: organizacaoVinculoInativoId,
            nome: 'Academia Vínculo Inativo Auth',
            ativo: true,
        },
        {
            id: organizacaoDeletadaId,
            nome: 'Academia Deletada Auth',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: organizacaoVinculoDeletadoId,
            nome: 'Academia Vínculo Deletado Auth',
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: usuarioAtivoId,
            nome: 'Usuário Ativo Auth',
            email: emailUsuarioAtivo,
            senha_hash: senhaHash,
            ativo: true,
            atualizado_em: new Date('2000-01-01T00:00:00.000Z'),
        },
        {
            id: usuarioInativoId,
            nome: 'Usuário Inativo Auth',
            email: emailUsuarioInativo,
            senha_hash: senhaHash,
            ativo: false,
        },
        {
            id: usuarioDeletadoId,
            nome: 'Usuário Deletado Auth',
            email: emailUsuarioDeletado,
            senha_hash: senhaHash,
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: usuarioSemOrganizacaoId,
            nome: 'Usuário Sem Organização Auth',
            email: emailUsuarioSemOrganizacao,
            senha_hash: senhaHash,
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoAId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoBId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoInativaId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoVinculoInativoId,
            perfil: 'OPERADOR',
            ativo: false,
        },
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoDeletadaId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioAtivoId,
            organizacao_id: organizacaoVinculoDeletadoId,
            perfil: 'OPERADOR',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            usuario_id: usuarioSemOrganizacaoId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: false,
        },
        {
            usuario_id: usuarioSemOrganizacaoId,
            organizacao_id: organizacaoInativaId,
            perfil: 'OPERADOR',
            ativo: true,
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

test('POST /api/v1/auth/login deve autenticar e retornar dados seguros sem exigir organização', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: senhaValida,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Login realizado com sucesso.');

    assert.deepEqual(response.body.data.usuario, {
        id: usuarioAtivoId,
        nome: 'Usuário Ativo Auth',
        email: emailUsuarioAtivo,
    });

    assert.equal('senha_hash' in response.body.data.usuario, false);
    assert.equal('token' in response.body, false);
    assert.equal('token' in response.body.data, false);

    assert.equal(response.body.data.organizacoes.length, 2);

    const organizacaoA = response.body.data.organizacoes.find(
        (organizacao: { id: string }) => organizacao.id === organizacaoAId,
    );
    const organizacaoB = response.body.data.organizacoes.find(
        (organizacao: { id: string }) => organizacao.id === organizacaoBId,
    );

    assert.deepEqual(organizacaoA, {
        id: organizacaoAId,
        nome: 'Academia A Auth',
        perfil: 'ADMINISTRADOR',
    });
    assert.deepEqual(organizacaoB, {
        id: organizacaoBId,
        nome: 'Academia B Auth',
        perfil: 'OPERADOR',
    });

    assert.equal(
        response.body.data.organizacoes.some(
            (organizacao: { id: string }) => organizacao.id === organizacaoInativaId,
        ),
        false,
    );
    assert.equal(
        response.body.data.organizacoes.some(
            (organizacao: { id: string }) => organizacao.id === organizacaoVinculoInativoId,
        ),
        false,
    );
    assert.equal(
        response.body.data.organizacoes.some(
            (organizacao: { id: string }) => organizacao.id === organizacaoDeletadaId,
        ),
        false,
    );
    assert.equal(
        response.body.data.organizacoes.some(
            (organizacao: { id: string }) => organizacao.id === organizacaoVinculoDeletadoId,
        ),
        false,
    );

    const cookies = response.headers['set-cookie'];

    assert.ok(Array.isArray(cookies));

    const tokenCookie = cookies.find((cookie) => cookie.startsWith('token='));

    assert.ok(tokenCookie);
    assert.match(tokenCookie, /; Path=\//);
    assert.match(tokenCookie, /; HttpOnly/);
    assert.match(tokenCookie, /; SameSite=Lax/);
    assert.match(tokenCookie, new RegExp(`; Max-Age=${duracaoCookiePorJwt[env.JWT_EXPIRES_IN]}`));

    const token = /^token=([^;]+)/.exec(tokenCookie)?.[1];
    const jwtSecret = env.JWT_SECRET;

    assert.ok(token);
    assert.ok(jwtSecret);

    const payload = jwt.verify(token, jwtSecret);

    assert.notEqual(typeof payload, 'string');

    if (typeof payload === 'string') {
        assert.fail('JWT deveria possuir payload estruturado.');
    }

    assert.equal(payload.sub, usuarioAtivoId);
    assert.equal('organizacaoId' in payload, false);
    assert.equal('areaNegocioId' in payload, false);
    assert.equal('perfil' in payload, false);

    const usuarioAtualizado = await connection('usuarios')
        .select('ultimo_login_em', 'atualizado_em')
        .where('id', usuarioAtivoId)
        .first();

    assert.ok(usuarioAtualizado?.ultimo_login_em);
    assert.ok(usuarioAtualizado?.atualizado_em);
    assert.notEqual(new Date(usuarioAtualizado.atualizado_em).getUTCFullYear(), 2000);
});

test('POST /api/v1/auth/login deve normalizar espaços e caixa do email', async () => {
    const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
            email: `  ${emailUsuarioAtivo.toUpperCase()}  `,
            senha: senhaValida,
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.usuario.email, emailUsuarioAtivo);
});

test('POST /api/v1/auth/login deve rejeitar body vazio', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_LOGIN_INVALIDOS');
});

test('POST /api/v1/auth/login deve rejeitar email inválido', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: 'email-invalido',
        senha: senhaValida,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_LOGIN_INVALIDOS');
    assert.equal(response.body.mensagem, 'Email inválido.');
});

test('POST /api/v1/auth/login deve rejeitar senha ausente', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_LOGIN_INVALIDOS');
});

test('POST /api/v1/auth/login deve rejeitar senha com mais de 128 caracteres', async () => {
    const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
            email: emailUsuarioAtivo,
            senha: 'a'.repeat(129),
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_LOGIN_INVALIDOS');
    assert.equal(response.body.mensagem, 'Senha inválida.');
});

test('POST /api/v1/auth/login deve usar resposta genérica para email inexistente', async () => {
    const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
            email: `inexistente-${crypto.randomUUID()}@exemplo.com`,
            senha: senhaValida,
        });

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'CREDENCIAIS_INVALIDAS');
    assert.equal(response.body.mensagem, 'Email ou senha inválidos.');
});

test('POST /api/v1/auth/login deve usar resposta genérica para senha errada', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: 'SenhaIncorreta123!',
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'CREDENCIAIS_INVALIDAS');
    assert.equal(response.body.mensagem, 'Email ou senha inválidos.');
});

test('POST /api/v1/auth/login deve usar resposta genérica para usuário inativo', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioInativo,
        senha: senhaValida,
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'CREDENCIAIS_INVALIDAS');
    assert.equal(response.body.mensagem, 'Email ou senha inválidos.');
});

test('POST /api/v1/auth/login deve usar resposta genérica para usuário deletado', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioDeletado,
        senha: senhaValida,
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'CREDENCIAIS_INVALIDAS');
    assert.equal(response.body.mensagem, 'Email ou senha inválidos.');
});

test('POST /api/v1/auth/login deve rejeitar usuário sem organização ativa', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioSemOrganizacao,
        senha: senhaValida,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'USUARIO_SEM_ORGANIZACAO_ATIVA');
    assert.equal(response.body.mensagem, 'Usuário sem organização ativa.');
});

test('POST /api/v1/auth/login deve limitar tentativas inválidas repetidas', async () => {
    let response: Awaited<ReturnType<typeof request>> | undefined;

    for (let tentativa = 0; tentativa < 11; tentativa += 1) {
        response = await request(app).post('/api/v1/auth/login').send({
            email: emailUsuarioAtivo,
            senha: 'SenhaIncorreta123!',
        });

        if (response.status === 429) {
            break;
        }
    }

    assert.ok(response);
    assert.equal(response.status, 429);
    assert.equal(response.body.codigo, 'MUITAS_TENTATIVAS_LOGIN');
    assert.equal(
        response.body.mensagem,
        'Muitas tentativas de login. Por segurança, tente novamente em 1 hora.',
    );
    assert.equal(typeof response.body.request_id, 'string');
});
