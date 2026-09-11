import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';
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
    await connection('registros_auditoria').whereIn('recurso_id', usuariosIds).del();
    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
    await connection('usuarios').whereIn('id', usuariosIds).del();
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

function obterJwtSecretTeste(): string {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwtSecret;
}

async function contarAuditoriasLogout(): Promise<number> {
    const resultado = await connection('registros_auditoria')
        .where('acao', 'AUTH.LOGOUT')
        .count('* as total');

    return Number(resultado[0]?.total ?? 0);
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

test('GET /api/v1/auth/me deve retornar usuário e organizações usando o cookie do login', async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: senhaValida,
    });

    assert.equal(loginResponse.status, 200);

    const response = await agent.get('/api/v1/auth/me');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Usuário autenticado obtido com sucesso.');

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
});

test('GET /api/v1/auth/me não deve exigir x-organizacao-id', async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: senhaValida,
    });

    assert.equal(loginResponse.status, 200);

    const response = await agent.get('/api/v1/auth/me');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
});

test('GET /api/v1/auth/me deve rejeitar requisição sem cookie', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'TOKEN_AUSENTE');
    assert.equal(response.body.mensagem, 'Autenticação necessária.');
    assert.equal(typeof response.body.request_id, 'string');
});

test('GET /api/v1/auth/me deve rejeitar token inválido', async () => {
    const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', ['token=token-invalido']);

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'TOKEN_INVALIDO');
    assert.equal(response.body.mensagem, 'Token de autenticação inválido.');
});

test('GET /api/v1/auth/me deve rejeitar token expirado', async () => {
    const jwtSecret = env.JWT_SECRET;

    assert.ok(jwtSecret);

    const tokenExpirado = jwt.sign({}, jwtSecret, {
        subject: usuarioAtivoId,
        expiresIn: -1,
    });

    const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`token=${tokenExpirado}`]);

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'TOKEN_EXPIRADO');
    assert.equal(response.body.mensagem, 'Sessão expirada.');
});

test('GET /api/v1/auth/me deve rejeitar usuário inativo mesmo com token válido', async () => {
    const jwtSecret = env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioInativoId,
        expiresIn: '1h',
    });

    const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`token=${token}`]);

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'AUTENTICACAO_INVALIDA');
    assert.equal(response.body.mensagem, 'Autenticação inválida.');
});

test('GET /api/v1/auth/me deve rejeitar usuário deletado mesmo com token válido', async () => {
    const jwtSecret = env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioDeletadoId,
        expiresIn: '1h',
    });

    const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`token=${token}`]);

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'AUTENTICACAO_INVALIDA');
    assert.equal(response.body.mensagem, 'Autenticação inválida.');
});

test('GET /api/v1/auth/me deve rejeitar usuário sem organização ativa', async () => {
    const jwtSecret = env.JWT_SECRET;

    assert.ok(jwtSecret);

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioSemOrganizacaoId,
        expiresIn: '1h',
    });

    const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`token=${token}`]);

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'USUARIO_SEM_ORGANIZACAO_ATIVA');
    assert.equal(response.body.mensagem, 'Usuário sem organização ativa.');
});

test('POST /api/v1/auth/logout deve limpar o cookie, encerrar /me e registrar auditoria', async () => {
    const agent = request.agent(app);

    const loginResponse = await agent.post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: senhaValida,
    });

    assert.equal(loginResponse.status, 200);

    const logoutResponse = await agent.post('/api/v1/auth/logout');

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutResponse.body.status, 'success');
    assert.equal(logoutResponse.body.message, 'Logout realizado com sucesso.');
    assert.equal(logoutResponse.body.data, null);
    assert.equal('token' in logoutResponse.body, false);
    assert.equal('jwt' in logoutResponse.body, false);

    const cookies = logoutResponse.headers['set-cookie'];

    assert.ok(Array.isArray(cookies));

    const tokenCookie = cookies.find((cookie) => cookie.startsWith('token='));

    assert.ok(tokenCookie);
    assert.match(tokenCookie, /; Path=\//);
    assert.match(tokenCookie, /; HttpOnly/);
    assert.match(tokenCookie, /; SameSite=Lax/);
    assert.match(tokenCookie, /; Expires=/);

    const meResponse = await agent.get('/api/v1/auth/me');

    assert.equal(meResponse.status, 401);
    assert.equal(meResponse.body.codigo, 'TOKEN_AUSENTE');

    const registro = await connection('registros_auditoria')
        .select(
            'usuario_id',
            'organizacao_id',
            'area_negocio_id',
            'acao',
            'recurso',
            'recurso_id',
            'dados_contexto',
        )
        .where('acao', 'AUTH.LOGOUT')
        .andWhere('recurso_id', usuarioAtivoId)
        .orderBy('criado_em', 'desc')
        .first();

    assert.ok(registro);
    assert.equal(registro.usuario_id, usuarioAtivoId);
    assert.equal(registro.organizacao_id, null);
    assert.equal(registro.area_negocio_id, null);
    assert.equal(registro.acao, 'AUTH.LOGOUT');
    assert.equal(registro.recurso, 'AUTENTICACAO');
    assert.equal(registro.recurso_id, usuarioAtivoId);
    assert.deepEqual(registro.dados_contexto, {
        requestId: logoutResponse.headers['x-request-id'],
    });
    assert.equal('token' in registro.dados_contexto, false);
    assert.equal('cookie' in registro.dados_contexto, false);
    assert.equal('senha' in registro.dados_contexto, false);
});

test('POST /api/v1/auth/logout deve ser idempotente sem cookie ou headers de contexto', async () => {
    const response = await request(app).post('/api/v1/auth/logout');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Logout realizado com sucesso.');
    assert.equal(response.body.data, null);
    assert.equal('token' in response.body, false);

    const cookies = response.headers['set-cookie'];

    assert.ok(Array.isArray(cookies));
    assert.ok(cookies.some((cookie) => cookie.startsWith('token=')));
});

test('POST /api/v1/auth/logout deve aceitar token inválido sem registrar identidade falsa', async () => {
    const totalAntes = await contarAuditoriasLogout();

    const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', ['token=token-invalido']);

    const totalDepois = await contarAuditoriasLogout();

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data, null);
    assert.equal(totalDepois, totalAntes);
});

test('POST /api/v1/auth/logout deve aceitar token expirado sem registrar identidade falsa', async () => {
    const jwtSecret = obterJwtSecretTeste();

    const tokenExpirado = jwt.sign({}, jwtSecret, {
        subject: usuarioAtivoId,
        expiresIn: -1,
    });

    const totalAntes = await contarAuditoriasLogout();

    const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`token=${tokenExpirado}`]);

    const totalDepois = await contarAuditoriasLogout();

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data, null);
    assert.equal(totalDepois, totalAntes);
});

test('POST /api/v1/auth/logout deve permanecer disponível quando a auditoria falhar', async () => {
    const jwtSecret = obterJwtSecretTeste();

    const token = jwt.sign({}, jwtSecret, {
        subject: usuarioAtivoId,
        expiresIn: '1h',
    });

    const registrarOriginal = auditoriaService.registrar;
    const consoleErrorOriginal = console.error;

    auditoriaService.registrar = async () => {
        throw new Error('Falha simulada de auditoria.');
    };

    console.error = () => undefined;

    try {
        const response = await request(app)
            .post('/api/v1/auth/logout')
            .set('Cookie', [`token=${token}`]);

        assert.equal(response.status, 200);
        assert.equal(response.body.status, 'success');
        assert.equal(response.body.message, 'Logout realizado com sucesso.');
        assert.equal(response.body.data, null);
    } finally {
        auditoriaService.registrar = registrarOriginal;
        console.error = consoleErrorOriginal;
    }
});

test('POST /api/v1/auth/login deve limitar tentativas inválidas repetidas', async () => {
    let response = await request(app).post('/api/v1/auth/login').send({
        email: emailUsuarioAtivo,
        senha: 'SenhaIncorreta123!',
    });

    for (let tentativa = 1; tentativa < 11 && response.status !== 429; tentativa += 1) {
        response = await request(app).post('/api/v1/auth/login').send({
            email: emailUsuarioAtivo,
            senha: 'SenhaIncorreta123!',
        });
    }

    assert.equal(response.status, 429);
    assert.equal(response.body.codigo, 'MUITAS_TENTATIVAS_LOGIN');
    assert.equal(
        response.body.mensagem,
        'Muitas tentativas de login. Por segurança, tente novamente em 1 hora.',
    );
    assert.equal(typeof response.body.request_id, 'string');
});
