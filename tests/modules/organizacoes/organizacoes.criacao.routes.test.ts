import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const usuarioId = randomUUID();
const organizacaoAntiga = randomUUID();
const novasOrganizacoes: string[] = [];
const novasAreas: string[] = [];

function cabecalho(organizacaoId?: string) {
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET_TEST deve estar configurada.');
    const token = jwt.sign({}, env.JWT_SECRET, { subject: usuarioId, expiresIn: '1h' });
    return {
        Cookie: `token=${token}`,
        ...(organizacaoId ? { 'x-organizacao-id': organizacaoId } : {}),
    };
}

before(async () => {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Teste requer banco exclusivo .env.test.');
    }
    await connection('organizacoes').insert({
        id: organizacaoAntiga,
        nome: 'Empresa antiga de teste',
        ativo: true,
    });
    await connection('usuarios').insert({
        id: usuarioId,
        nome: 'Profissional Multiorganização',
        email: `org-${usuarioId}@teste.local`,
        senha_hash: 'fixture',
        ativo: true,
    });
    await connection('usuarios_organizacoes').insert({
        usuario_id: usuarioId,
        organizacao_id: organizacaoAntiga,
        perfil: 'OPERADOR',
        ativo: true,
    });
});

after(async () => {
    try {
        const ids = [...novasOrganizacoes, organizacaoAntiga];
        await connection('registros_auditoria').whereIn('organizacao_id', ids).del();
        await connection('areas_modulos').whereIn('area_negocio_id', novasAreas).del();
        await connection('organizacoes_modulos').whereIn('organizacao_id', novasOrganizacoes).del();
        await connection('usuarios_organizacoes').whereIn('organizacao_id', ids).del();
        await connection('areas_negocio').whereIn('organizacao_id', novasOrganizacoes).del();
        await connection('usuarios').where({ id: usuarioId }).del();
        await connection('organizacoes').whereIn('id', ids).del();
    } finally {
        await connection.destroy();
    }
});

test('somente usuário autenticado pode criar organização e body tem esquema estrito', async () => {
    const anonimo = await request(app)
        .post('/api/v1/organizacoes')
        .send({ nome: 'Outra empresa', areaInicial: { nome: 'Pilates' } });
    assert.equal(anonimo.status, 401);

    const invalido = await request(app)
        .post('/api/v1/organizacoes')
        .set(cabecalho())
        .send({
            nome: 'Empresa inválida',
            areaInicial: { nome: 'Fisioterapia' },
            organizacao_id: organizacaoAntiga,
        });
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.codigo, 'DADOS_ORGANIZACAO_INVALIDOS');
});

test('operador pode abrir negócio próprio e passa a ser administrador apenas nele', async () => {
    const response = await request(app)
        .post('/api/v1/organizacoes')
        .set(cabecalho())
        .send({ nome: '  Novo Estúdio  ', areaInicial: { nome: '  Fisioterapia  ' } });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    const { organizacao, area } = response.body.data as {
        organizacao: { id: string; nome: string; perfil: string };
        area: { id: string; nome: string; codigo: string };
    };
    novasOrganizacoes.push(organizacao.id);
    novasAreas.push(area.id);
    assert.equal(organizacao.nome, 'Novo Estúdio');
    assert.equal(organizacao.perfil, 'ADMINISTRADOR');
    assert.equal(area.codigo, 'FISIOTERAPIA');

    const me = await request(app).get('/api/v1/auth/me').set(cabecalho());
    assert.equal(me.status, 200);
    const lista = me.body.data.organizacoes as { id: string; perfil: string }[];
    assert.equal(lista.find((org) => org.id === organizacaoAntiga)?.perfil, 'OPERADOR');
    assert.equal(lista.find((org) => org.id === organizacao.id)?.perfil, 'ADMINISTRADOR');

    const naoPodeNaAntiga = await request(app)
        .post('/api/v1/areas-negocio')
        .set(cabecalho(organizacaoAntiga))
        .send({ nome: 'Área proibida' });
    assert.equal(naoPodeNaAntiga.status, 403);

    const criada = await request(app)
        .post('/api/v1/areas-negocio')
        .set(cabecalho(organizacao.id))
        .send({ nome: '  Pilates  ' });
    assert.equal(criada.status, 201, JSON.stringify(criada.body));
    assert.equal(criada.body.data.codigo, 'PILATES');
    novasAreas.push(criada.body.data.id);

    const listaAreas = await request(app)
        .get('/api/v1/areas-negocio')
        .set(cabecalho(organizacao.id));
    assert.equal(listaAreas.status, 200);
    assert.deepEqual(
        listaAreas.body.map((item: { nome: string }) => item.nome).sort(),
        ['Fisioterapia', 'Pilates'],
    );

    const duplicada = await request(app)
        .post('/api/v1/areas-negocio')
        .set(cabecalho(organizacao.id))
        .send({ nome: 'PILATES' });
    assert.equal(duplicada.status, 409);
    assert.equal(duplicada.body.codigo, 'AREA_CODIGO_DUPLICADO');

    const estranho = await request(app)
        .post('/api/v1/areas-negocio')
        .set(cabecalho(randomUUID()))
        .send({ nome: 'Não autorizada' });
    assert.equal(estranho.status, 403);
    const auditoria = await connection('registros_auditoria')
        .where({ organizacao_id: organizacao.id, acao: 'ORGANIZACAO.CRIADA' })
        .first();
    assert.equal(auditoria.usuario_id, usuarioId);
});
