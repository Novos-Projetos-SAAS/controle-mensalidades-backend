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
import controller from '../../../src/modules/documentos_clinicos/documentos_clinicos.controller.js';
import timelineController from '../../../src/modules/prontuario/prontuario.timeline.controller.js';

// Este teste é exclusivo de uma instancia LOCAL DESCARTAVEL.
// NUNCA executar contra Neon, bancos compartilhados ou producao.
// Os endpoints sao montados apenas neste app Express privado de teste.

const ids = {
    orgA: crypto.randomUUID(),
    orgB: crypto.randomUUID(),
    areaA: crypto.randomUUID(),
    areaB: crypto.randomUUID(),
    userA: crypto.randomUUID(),
    userB: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    profA: crypto.randomUUID(),
    profB: crypto.randomUUID(),
    clienteA: crypto.randomUUID(),
    sessaoA: crypto.randomUUID(),
    sessaoB: crypto.randomUUID(),
};

const anamnese = {
    queixa_principal: 'Queixa ficticia criada pela fisioterapeuta',
    historia_condicao_atual: 'Historia estritamente sintetica',
    antecedentes: 'Antecedentes simulados',
    medicamentos_alergias: 'Nenhuma informacao real',
    limitacoes_funcionais: 'Limitacoes simuladas',
    objetivos_paciente: 'Objetivos de teste',
    avaliacao_inicial: 'Avaliacao profissional ficticia',
};

const laudo = {
    finalidade: 'Teste de emissao de rascunho',
    fundamentacao_avaliacao: 'Fundamentacao inteiramente ficticia',
    achados_funcionais: 'Achados ficticios',
    diagnostico_fisioterapeutico: 'Diagnostico ficticio',
    conclusao: 'Conclusao ficticia sem validade profissional',
    recomendacoes: 'Recomendacoes ficticias',
};

const appTeste = express();
appTeste.use(requestId, express.json(), cookieParser(), verifyUser, verifyOrganization, contextoArea);
appTeste.post('/documentos-clinicos', controller.criar);
appTeste.get('/documentos-clinicos/paciente/:clienteId', controller.listar);
appTeste.get('/documentos-clinicos/:documentoId', controller.consultar);
appTeste.post('/documentos-clinicos/:documentoId/revisoes', controller.revisar);
appTeste.post('/documentos-clinicos/:documentoId/finalizar', controller.finalizar);
appTeste.get('/prontuario/pacientes/:pacienteId/historico', timelineController.listar);
appTeste.use(errorHandler);

let documentoId = '';
let laudoId = '';

function exigirIsolamentoLocal() {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Banco exclusivo de testes obrigatorio.');
    }
    const url = process.env.DATABASE_URL_TEST;
    if (!url) throw new Error('DATABASE_URL_TEST obrigatoria.');
    const parsed = new URL(url);
    if (
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.pathname !== '/prontuario_ficticio'
    ) {
        throw new Error('Testes HTTP documentais exigem PostgreSQL local descartavel prontuario_ficticio.');
    }
}

function headers(usuario: string, organizacao = ids.orgA, area = ids.areaA) {
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET de teste necessario.');
    return {
        Cookie: `token=${jwt.sign({}, env.JWT_SECRET, { subject: usuario, expiresIn: '1h' })}`,
        'x-organizacao-id': organizacao,
        'x-area-negocio-id': area,
    };
}

before(async () => {
    exigirIsolamentoLocal();
    await connection('organizacoes').insert([
        { id: ids.orgA, nome: 'Organizacao fisioterapia ficticia A', ativo: true },
        { id: ids.orgB, nome: 'Organizacao fisioterapia ficticia B', ativo: true },
    ]);
    await connection('areas_negocio').insert([
        { id: ids.areaA, organizacao_id: ids.orgA, nome: 'Fisio A', codigo: 'FA' + ids.areaA.slice(0, 10), ativo: true },
        { id: ids.areaB, organizacao_id: ids.orgB, nome: 'Fisio B', codigo: 'FB' + ids.areaB.slice(0, 10), ativo: true },
    ]);
    await connection('usuarios').insert(
        [ids.userA, ids.userB, ids.admin].map((id) => ({
            id, nome: 'Profissional sintetico', email: `clinico-${id}@teste.local`,
            senha_hash: 'senha-ficticia', ativo: true,
        })),
    );
    await connection('usuarios_organizacoes').insert(
        [ids.userA, ids.userB, ids.admin].map((id) => ({
            usuario_id: id, organizacao_id: ids.orgA,
            perfil: id === ids.admin ? 'ADMINISTRADOR' : 'OPERADOR', ativo: true,
        })),
    );
    await connection('profissionais').insert([
        { id: ids.profA, organizacao_id: ids.orgA, usuario_id: ids.userA, nome: 'Fisioterapeuta A', ativo: true },
        { id: ids.profB, organizacao_id: ids.orgA, usuario_id: ids.userB, nome: 'Fisioterapeuta B', ativo: true },
    ]);
    await connection('profissionais_areas').insert([
        { profissional_id: ids.profA, area_negocio_id: ids.areaA, ativo: true, acesso_clinico_autorizado: true },
        { profissional_id: ids.profB, area_negocio_id: ids.areaA, ativo: true, acesso_clinico_autorizado: true },
    ]);
    await connection('clientes').insert({
        id: ids.clienteA, organizacao_id: ids.orgA, nome: 'Paciente totalmente ficticio', ativo: true,
    });
    await connection('clientes_areas').insert({
        cliente_id: ids.clienteA, area_negocio_id: ids.areaA, ativo: true,
    });
    await connection('sessoes_clinicas').insert([
        {
            id: ids.sessaoA, organizacao_id: ids.orgA, area_negocio_id: ids.areaA,
            cliente_id: ids.clienteA, profissional_id: ids.profA,
            data_sessao: new Date('2026-11-18T14:00:00Z'),
            evolucao: 'Evolucao ficticia sigilosa do titular',
            procedimentos_realizados: 'Procedimentos ficticios',
        },
        {
            id: ids.sessaoB, organizacao_id: ids.orgA, area_negocio_id: ids.areaA,
            cliente_id: ids.clienteA, profissional_id: ids.profB,
            data_sessao: new Date('2026-11-19T14:00:00Z'),
            evolucao: 'Evolucao ficticia de outro profissional',
            procedimentos_realizados: 'Procedimentos alheios ficticios',
        },
    ]);
});

after(async () => {
    // O historico e append-only e nao pode ser deletado nem pelo teste.
    // A instancia PostgreSQL efemera deste job e descartada integralmente.
    await connection.destroy();
});

test('nao expõe documentos a requisicao anonima', async () => {
    const resposta = await request(appTeste).get(`/documentos-clinicos/paciente/${ids.clienteA}`).expect(401);
    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

test('administrador sem vinculo clinico recebe 403', async () => {
    const resposta = await request(appTeste)
        .post('/documentos-clinicos')
        .set(headers(ids.admin))
        .send({ tipo: 'ANAMNESE', cliente_id: ids.clienteA, conteudo: anamnese })
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});

test('fisioterapeuta cria anamnese e auditoria atomica', async () => {
    const resposta = await request(appTeste)
        .post('/documentos-clinicos')
        .set(headers(ids.userA))
        .send({ tipo: 'ANAMNESE', cliente_id: ids.clienteA, conteudo: anamnese })
        .expect(201);
    documentoId = resposta.body.data.id as string;
    assert.ok(documentoId);
    assert.equal(resposta.body.data.versao, 1);
    const auditoria = await connection('registros_auditoria')
        .where({ recurso: 'DOCUMENTO_CLINICO', recurso_id: documentoId, acao: 'DOCUMENTO_CLINICO.CRIADO' })
        .first('id');
    assert.ok(auditoria);
});

test('o proprio profissional lista, consulta e preserva a anamnese', async () => {
    const lista = await request(appTeste)
        .get(`/documentos-clinicos/paciente/${ids.clienteA}`)
        .set(headers(ids.userA)).expect(200);
    assert.equal(lista.body.data.length, 1);
    assert.equal(lista.body.data[0].id, documentoId);
    assert.equal(lista.body.data[0].conteudo, undefined);
    const leitura = await request(appTeste)
        .get(`/documentos-clinicos/${documentoId}`)
        .set(headers(ids.userA)).expect(200);
    assert.equal(leitura.body.data.versoes[0].conteudo.queixa_principal, anamnese.queixa_principal);
});

test('outro fisioterapeuta nao acessa prontuario ou adendo do titular', async () => {
    const leitura = await request(appTeste)
        .get(`/documentos-clinicos/${documentoId}`)
        .set(headers(ids.userB)).expect(404);
    assert.equal(leitura.body.codigo, 'REGISTRO_CLINICO_NAO_ENCONTRADO');
    await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/revisoes`)
        .set(headers(ids.userB))
        .send({
            conteudo: anamnese, natureza: 'CORRECAO',
            justificativa: 'Tentativa de alteracao alheia',
            ultima_versao_esperada: 1,
        })
        .expect(404);
});

test('nao revela documento fora da organizacao autorizada', async () => {
    const resposta = await request(appTeste)
        .get(`/documentos-clinicos/${documentoId}`)
        .set(headers(ids.userA, ids.orgB, ids.areaB)).expect(403);
    assert.equal(resposta.body.codigo, 'ORGANIZACAO_NAO_AUTORIZADA');
});

test('corrige a anamnese com versao nova, preservando historico', async () => {
    const resposta = await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/revisoes`)
        .set(headers(ids.userA))
        .send({
            conteudo: { ...anamnese, queixa_principal: 'Queixa sintetica revisada' },
            natureza: 'CORRECAO',
            justificativa: 'Revisao do texto ficticio',
            ultima_versao_esperada: 1,
        })
        .expect(200);
    assert.equal(resposta.body.data.versao, 2);
    const leitura = await request(appTeste)
        .get(`/documentos-clinicos/${documentoId}`)
        .set(headers(ids.userA)).expect(200);
    assert.equal(leitura.body.data.versoes.length, 2);
    assert.equal(leitura.body.data.versoes[0].conteudo.queixa_principal, anamnese.queixa_principal);
});

test('versao desatualizada recebe conflito e nao altera dado', async () => {
    const resposta = await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/revisoes`)
        .set(headers(ids.userA))
        .send({
            conteudo: anamnese, natureza: 'CORRECAO',
            justificativa: 'Teste de conflito de versoes',
            ultima_versao_esperada: 1,
        })
        .expect(409);
    assert.equal(resposta.body.codigo, 'VERSAO_CLINICA_DESATUALIZADA');
});

test('finaliza e aceita apenas adendos depois da finalizacao', async () => {
    const final = await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/finalizar`)
        .set(headers(ids.userA))
        .send({ ultima_versao_esperada: 2 }).expect(200);
    assert.equal(final.body.data.versao, 3);
    assert.equal(final.body.data.estado, 'FINALIZADO');
    await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/revisoes`)
        .set(headers(ids.userA))
        .send({
            conteudo: anamnese, natureza: 'CORRECAO',
            justificativa: 'Revisao sem adendo indevida',
            ultima_versao_esperada: 3,
        }).expect(409);
    const adendo = await request(appTeste)
        .post(`/documentos-clinicos/${documentoId}/revisoes`)
        .set(headers(ids.userA))
        .send({
            conteudo: anamnese, natureza: 'ADENDO',
            justificativa: 'Adendo ficticio complementar',
            ultima_versao_esperada: 3,
        }).expect(200);
    assert.equal(adendo.body.data.versao, 4);
});

test('laudo eh guardado separadamente, sem assinatura automatica', async () => {
    const resposta = await request(appTeste)
        .post('/documentos-clinicos')
        .set(headers(ids.userA))
        .send({ tipo: 'LAUDO', cliente_id: ids.clienteA, conteudo: laudo })
        .expect(201);
    laudoId = resposta.body.data.id as string;
    const leitura = await request(appTeste)
        .get(`/documentos-clinicos/${laudoId}`)
        .set(headers(ids.userA)).expect(200);
    assert.equal(leitura.body.data.registro.tipo, 'LAUDO');
    assert.equal(leitura.body.data.versoes[0].conteudo.conclusao, laudo.conclusao);
});

test('linha do tempo agrega anamnese, laudo e evolucao sem textos sensiveis', async () => {
    const resposta = await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .set(headers(ids.userA))
        .expect(200);

    const entradas = resposta.body.data as Array<{
        id: string; tipo: string; versao: number | null; estado: string | null;
        data: string; profissional_id: string;
    }>;

    assert.equal(entradas.length, 3);
    assert.deepEqual(
        entradas.map((item) => item.tipo).sort(),
        ['ANAMNESE', 'EVOLUCAO', 'LAUDO'],
    );
    assert.ok(entradas.every((item) => item.profissional_id === ids.profA));
    assert.ok(entradas.some((item) => item.id === ids.sessaoA));
    assert.ok(!entradas.some((item) => item.id === ids.sessaoB));
    assert.deepEqual(
        entradas.map((item) => item.data),
        [...entradas.map((item) => item.data)].sort((a, b) => b.localeCompare(a)),
    );

    const atualAnamnese = entradas.find((item) => item.id === documentoId);
    assert.equal(atualAnamnese?.versao, 4);
    assert.equal(atualAnamnese?.estado, 'FINALIZADO');

    const corpo = JSON.stringify(resposta.body);
    assert.ok(!corpo.includes(anamnese.queixa_principal));
    assert.ok(!corpo.includes(laudo.conclusao));
    assert.ok(!corpo.includes('Evolucao ficticia sigilosa'));

    const auditoria = await connection('registros_auditoria')
        .where({
            organizacao_id: ids.orgA,
            usuario_id: ids.userA,
            recurso: 'PRONTUARIO',
            recurso_id: ids.clienteA,
            acao: 'PRONTUARIO.LINHA_TEMPO_CONSULTADA',
        })
        .first('id');
    assert.ok(auditoria);
});

test('linha do tempo nega administrativo e outro tenant, e nao cruza profissionais', async () => {
    const outroProfissional = await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .set(headers(ids.userB))
        .expect(200);
    assert.deepEqual(
        outroProfissional.body.data.map((e: { id: string }) => e.id),
        [ids.sessaoB],
    );

    await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .set(headers(ids.admin))
        .expect(403);

    await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .set(headers(ids.userA, ids.orgB, ids.areaB))
        .expect(403);

    await request(appTeste)
        .get(`/prontuario/pacientes/${crypto.randomUUID()}/historico`)
        .set(headers(ids.userA))
        .expect(404);
});

test('linha do tempo valida o limite e nao permite enumeracao sem autenticacao', async () => {
    await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .expect(401);

    const limite = await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico?limite=1`)
        .set(headers(ids.userA))
        .expect(200);
    assert.equal(limite.body.data.length, 1);

    await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico?limite=1000`)
        .set(headers(ids.userA))
        .expect(400);

    await request(appTeste)
        .get('/prontuario/pacientes/nao-e-uuid/historico')
        .set(headers(ids.userA))
        .expect(400);
});

test('historico documental rejeita DELETE e TRUNCATE fisico', async () => {
    await assert.rejects(
        connection.transaction(async (trx) => {
            await trx.transaction((savepoint) =>
                savepoint('versoes_registros_clinicos').where('registro_id', documentoId).delete(),
            );
        }),
        (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === 'P0001',
    );
});

test('revogacao bloqueia leitura imediatamente', async () => {
    await connection('profissionais_areas')
        .where({ profissional_id: ids.profA, area_negocio_id: ids.areaA })
        .update({ acesso_clinico_autorizado: false });
    const resposta = await request(appTeste)
        .get(`/documentos-clinicos/${documentoId}`)
        .set(headers(ids.userA)).expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});


test('revogacao bloqueia a linha do tempo imediatamente', async () => {
    const resposta = await request(appTeste)
        .get(`/prontuario/pacientes/${ids.clienteA}/historico`)
        .set(headers(ids.userA))
        .expect(403);
    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
});
