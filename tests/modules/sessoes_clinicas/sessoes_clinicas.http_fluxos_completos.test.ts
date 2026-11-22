import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import verifyOrganization from '../../../src/middlewares/verifyOrganization.middleware.js';
import verifyUser from '../../../src/middlewares/verifyUser.middleware.js';
import contextoArea from '../../../src/modules/contexto/contextoArea.middleware.js';
import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';

// ATENÇÃO: este arquivo usa somente o PostgreSQL de TESTE.
// As rotas abaixo são montadas apenas neste app Express isolado.
// NÃO modifique src/routes/v1/index.ts ou o bloqueio das Routes oficiais.

const ids = {
    organizacaoA: crypto.randomUUID(),
    organizacaoB: crypto.randomUUID(),
    areaA: crypto.randomUUID(),
    areaAlternativa: crypto.randomUUID(),
    areaB: crypto.randomUUID(),
    titular: crypto.randomUUID(),
    segundoUsuario: crypto.randomUUID(),
    administrador: crypto.randomUUID(),
    profissionalTitular: crypto.randomUUID(),
    segundoProfissional: crypto.randomUUID(),
    paciente: crypto.randomUUID(),
    sessaoTitular: crypto.randomUUID(),
    sessaoOutro: crypto.randomUUID(),
};

const evolucaoOriginal = 'Registro ficticio do profissional titular.';
const dataInicial = '2026-10-01T00:00:00Z';
const dataFinal = '2026-11-01T00:00:00Z';

const appTeste = express();
appTeste.use(requestId);
appTeste.use(express.json());
appTeste.use(cookieParser());
appTeste.use(verifyUser, verifyOrganization, contextoArea);
appTeste.post('/sessoes-clinicas', sessoesClinicasController.criar);
appTeste.get('/sessoes-clinicas', sessoesClinicasController.listar);
appTeste.get(
    '/sessoes-clinicas/:sessaoClinicaId/historico',
    sessoesClinicasController.listarHistoricoCorrecoes,
);
appTeste.get('/sessoes-clinicas/:sessaoClinicaId', sessoesClinicasController.buscarPorId);
appTeste.patch('/sessoes-clinicas/:sessaoClinicaId', sessoesClinicasController.corrigir);
appTeste.use(errorHandler);

function cabecalhos(usuarioId: string, organizacaoId = ids.organizacaoA, areaId = ids.areaA) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não configurada no banco de teste.');
    }

    return {
        Cookie: `token=${jwt.sign({}, env.JWT_SECRET, {
            subject: usuarioId,
            expiresIn: '1h',
        })}`,
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

function corpoCriacao(profissionalId = ids.profissionalTitular) {
    return {
        cliente_id: ids.paciente,
        profissional_id: profissionalId,
        data_sessao: '2026-10-02T14:00:00Z',
        evolucao: 'Atendimento avulso ficticio para teste HTTP.',
        objetivo_sessao: 'Trabalho funcional com paciente fictício',
        procedimentos_realizados: 'Mobilização e exercícios terapêuticos fictícios',
        resposta_paciente: 'Resposta funcional fictícia',
    };
}

async function limparFixture() {
    // Só removemos os IDs desta suíte. Não apagamos dados de outras suítes.
    await connection('registros_auditoria').where('organizacao_id', ids.organizacaoA).del();
    await connection('sessoes_clinicas')
        .where('organizacao_id', ids.organizacaoA)
        .whereIn('cliente_id', [ids.paciente])
        .del();
    await connection('clientes_areas').where('cliente_id', ids.paciente).del();
    await connection('profissionais_areas')
        .whereIn('profissional_id', [ids.profissionalTitular, ids.segundoProfissional])
        .del();
    await connection('profissionais')
        .whereIn('id', [ids.profissionalTitular, ids.segundoProfissional])
        .del();
    await connection('clientes').where('id', ids.paciente).del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [ids.titular, ids.segundoUsuario, ids.administrador])
        .del();
    await connection('usuarios')
        .whereIn('id', [ids.titular, ids.segundoUsuario, ids.administrador])
        .del();
    await connection('areas_negocio')
        .whereIn('id', [ids.areaA, ids.areaAlternativa, ids.areaB])
        .del();
    await connection('organizacoes').whereIn('id', [ids.organizacaoA, ids.organizacaoB]).del();
}

before(async () => {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Execução proibida fora de NODE_ENV=test.');
    }

    await connection('organizacoes').insert([
        { id: ids.organizacaoA, nome: 'Clinica HTTP A - Testes', ativo: true },
        { id: ids.organizacaoB, nome: 'Clinica HTTP B - Testes', ativo: true },
    ]);
    await connection('areas_negocio').insert([
        {
            id: ids.areaA,
            organizacao_id: ids.organizacaoA,
            codigo: `CL-A-${ids.areaA.slice(0, 8)}`,
            nome: 'Fisioterapia A',
            ativo: true,
        },
        {
            id: ids.areaAlternativa,
            organizacao_id: ids.organizacaoA,
            codigo: `CL-X-${ids.areaAlternativa.slice(0, 8)}`,
            nome: 'Area nao autorizada',
            ativo: true,
        },
        {
            id: ids.areaB,
            organizacao_id: ids.organizacaoB,
            codigo: `CL-B-${ids.areaB.slice(0, 8)}`,
            nome: 'Fisioterapia B',
            ativo: true,
        },
    ]);
    await connection('usuarios').insert(
        [ids.titular, ids.segundoUsuario, ids.administrador].map((id) => ({
            id,
            nome: 'Usuario ficticio de teste HTTP',
            email: `http-clinica-${id}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        })),
    );
    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: ids.titular,
            organizacao_id: ids.organizacaoA,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: ids.segundoUsuario,
            organizacao_id: ids.organizacaoA,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: ids.administrador,
            organizacao_id: ids.organizacaoA,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
    ]);
    await connection('clientes').insert({
        id: ids.paciente,
        organizacao_id: ids.organizacaoA,
        nome: 'Paciente ficticio para testes',
        ativo: true,
    });
    await connection('clientes_areas').insert({
        cliente_id: ids.paciente,
        area_negocio_id: ids.areaA,
        ativo: true,
    });
    await connection('profissionais').insert([
        {
            id: ids.profissionalTitular,
            organizacao_id: ids.organizacaoA,
            usuario_id: ids.titular,
            nome: 'Fisioterapeuta titular',
            ativo: true,
        },
        {
            id: ids.segundoProfissional,
            organizacao_id: ids.organizacaoA,
            usuario_id: ids.segundoUsuario,
            nome: 'Outro fisioterapeuta',
            ativo: true,
        },
    ]);
    await connection('profissionais_areas').insert([
        {
            profissional_id: ids.profissionalTitular,
            area_negocio_id: ids.areaA,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: ids.segundoProfissional,
            area_negocio_id: ids.areaA,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);
    await connection('sessoes_clinicas').insert([
        {
            id: ids.sessaoTitular,
            organizacao_id: ids.organizacaoA,
            area_negocio_id: ids.areaA,
            cliente_id: ids.paciente,
            profissional_id: ids.profissionalTitular,
            data_sessao: new Date('2026-10-01T14:00:00Z'),
            evolucao: evolucaoOriginal,
        },
        {
            id: ids.sessaoOutro,
            organizacao_id: ids.organizacaoA,
            area_negocio_id: ids.areaA,
            cliente_id: ids.paciente,
            profissional_id: ids.segundoProfissional,
            data_sessao: new Date('2026-10-01T15:00:00Z'),
            evolucao: 'Registro de outro profissional.',
        },
    ]);
});

after(async () => {
    try {
        if (env.NODE_ENV === 'test') {
            await limparFixture();
        }
    } finally {
        await connection.destroy();
    }
});

// Esta suíte não produz correções reais: o trigger de histórico é imutável.
// Criação positiva é limpa porque não há correções para ela.

test('rejeita acesso sem cookie JWT', async () => {
    const resposta = await request(appTeste).get('/sessoes-clinicas').expect(401);
    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

test('titular consulta sua sessão completa', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.titular))
        .expect(200);
    assert.equal(resposta.body.data.id, ids.sessaoTitular);
    assert.equal(resposta.body.data.evolucao, evolucaoOriginal);
});

test('outro profissional consulta apenas sua própria sessão', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoOutro}`)
        .set(cabecalhos(ids.segundoUsuario))
        .expect(200);
    assert.equal(resposta.body.data.id, ids.sessaoOutro);
});

test('titular não consegue visualizar sessão de outro profissional', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoOutro}`)
        .set(cabecalhos(ids.titular))
        .expect(404);
    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
});

test('listagem não aceita forçar filtro do outro profissional', async () => {
    const resposta = await request(appTeste)
        .get('/sessoes-clinicas')
        .query({ inicio: dataInicial, fim: dataFinal, profissionalId: ids.segundoProfissional })
        .set(cabecalhos(ids.titular))
        .expect(200);
    assert.deepEqual(
        resposta.body.data.map((sessao: { id: string }) => sessao.id),
        [ids.sessaoTitular],
    );
});

test('histórico da própria sessão retorna array vazio quando não há correções', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}/historico`)
        .set(cabecalhos(ids.titular))
        .expect(200);
    assert.deepEqual(resposta.body.data, []);
});

test('histórico alheio não revela o prontuário', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}/historico`)
        .set(cabecalhos(ids.segundoUsuario))
        .expect(404);
    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
});

test('administrador sem vínculo clínico recebe 403 para consulta', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.administrador))
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

test('bloqueia usuário ao tentar usar organização diferente', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.titular, ids.organizacaoB, ids.areaB))
        .expect(403);
    assert.equal(resposta.body.codigo, 'ORGANIZACAO_NAO_AUTORIZADA');
});

test('bloqueia acesso a outra área sem vínculo clínico', async () => {
    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.titular, ids.organizacaoA, ids.areaAlternativa))
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

test('cria sessão avulsa do próprio profissional pelo HTTP', async () => {
    const resposta = await request(appTeste)
        .post('/sessoes-clinicas')
        .set(cabecalhos(ids.titular))
        .send(corpoCriacao())
        .expect(201);

    const sessaoIdCriada = resposta.body.data.id as string;
    assert.ok(sessaoIdCriada);
    assert.equal(resposta.body.data.profissional_id, ids.profissionalTitular);
    assert.equal(resposta.body.data.procedimentos_realizados, 'Mobilização e exercícios terapêuticos fictícios');

    const persistida = await connection('sessoes_clinicas')
        .select('id', 'cliente_id', 'profissional_id', 'procedimentos_realizados', 'resposta_paciente')
        .where('id', sessaoIdCriada)
        .first();
    assert.equal(persistida?.cliente_id, ids.paciente);
    assert.equal(persistida?.profissional_id, ids.profissionalTitular);
    assert.equal(persistida?.procedimentos_realizados, 'Mobilização e exercícios terapêuticos fictícios');
    assert.equal(persistida?.resposta_paciente, 'Resposta funcional fictícia');
});

test('não permite criar sessão em nome de outro fisioterapeuta', async () => {
    const resposta = await request(appTeste)
        .post('/sessoes-clinicas')
        .set(cabecalhos(ids.segundoUsuario))
        .send(corpoCriacao(ids.profissionalTitular))
        .expect(403);
    assert.equal(resposta.body.codigo, 'PROFISSIONAL_CLINICO_NAO_AUTORIZADO');
});

test('rejeita criação com payload clínico inválido', async () => {
    const resposta = await request(appTeste)
        .post('/sessoes-clinicas')
        .set(cabecalhos(ids.titular))
        .send({ ...corpoCriacao(), data_sessao: 'nao-e-data' })
        .expect(400);
    assert.equal(resposta.body.codigo, 'DADOS_SESSAO_CLINICA_INVALIDOS');
});

test('nega PATCH de sessão de outro profissional sem alterar a evolução', async () => {
    const resposta = await request(appTeste)
        .patch(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.segundoUsuario))
        .send({ evolucao: 'Tentativa indevida.' })
        .expect(404);
    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    const sessao = await connection('sessoes_clinicas')
        .select('evolucao')
        .where('id', ids.sessaoTitular)
        .first();
    assert.equal(sessao?.evolucao, evolucaoOriginal);
});

test('nega PATCH de administrador sem autorização clínica', async () => {
    const resposta = await request(appTeste)
        .patch(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.administrador))
        .send({ evolucao: 'Tentativa administrativa.' })
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

test('revogação de permissão bloqueia acesso imediatamente', async () => {
    await connection('profissionais_areas')
        .where({ profissional_id: ids.profissionalTitular, area_negocio_id: ids.areaA })
        .update({ acesso_clinico_autorizado: false });

    const resposta = await request(appTeste)
        .get(`/sessoes-clinicas/${ids.sessaoTitular}`)
        .set(cabecalhos(ids.titular))
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});
