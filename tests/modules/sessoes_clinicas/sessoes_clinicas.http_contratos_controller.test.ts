import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import express from 'express';
import request from 'supertest';

import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';
import sessoesClinicasAcessoService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.acesso.service.js';
import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';
import sessoesClinicasLeiturasTransacionaisService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.leituras_transacionais.service.js';
import AppError from '../../../src/shared/errors/AppError.js';

// Testa o contrato HTTP do Controller com mocks do Service.
// A auditoria de escrita ocorre dentro da transacao PostgreSQL do Service.
// Sua persistencia e rollback sao verificados nos testes transacionais.
// Este arquivo nao abre conexao nem grava informacoes clinicas no banco.

const usuarioId = crypto.randomUUID();
const organizacaoId = crypto.randomUUID();
const areaId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();
const pacienteId = crypto.randomUUID();
const sessaoId = crypto.randomUUID();
const textoAnterior = 'Evolucao inicial sigilosa de teste.';
const textoNovo = 'Evolucao corrigida sigilosa de teste.';

const contexto = {
    usuarioId,
    organizacaoId,
    areaNegocioId: areaId,
};

const sessaoFicticia = {
    id: sessaoId,
    cliente_id: pacienteId,
    profissional_id: profissionalId,
    agendamento_id: null,
    data_sessao: new Date('2026-10-01T14:00:00Z'),
    corrigido_em: new Date('2026-10-02T14:00:00Z'),
    cliente_nome: 'Paciente ficticio',
    profissional_nome: 'Fisioterapeuta ficticio',
    evolucao: textoNovo,
    diagnostico_fisioterapeutico: null,
    prognostico: null,
    plano_terapeutico: null,
    observacoes: null,
    corrigido_por_usuario_id: usuarioId,
};

function criarAppTeste(incluirArea = true) {
    const app = express();
    app.use(requestId);
    app.use(express.json());

    // Contexto ficticio: JWT e headers reais sao cobertos em outros testes.
    app.use((req, _res, next) => {
        req.auth = {
            usuarioId,
            organizacaoId,
            perfil: 'OPERADOR',
            ...(incluirArea && { areaNegocioId: areaId }),
        };
        next();
    });

    app.post('/sessoes-clinicas', sessoesClinicasController.criar);
    app.patch('/sessoes-clinicas/:sessaoClinicaId', sessoesClinicasController.corrigir);
    app.get(
        '/sessoes-clinicas/:sessaoClinicaId/historico',
        sessoesClinicasController.listarHistoricoCorrecoes,
    );
    app.use(errorHandler);
    return app;
}

test('PATCH autorizado devolve 200 e a sessao corrigida', async (t) => {
    const corrigir = t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao: sessaoFicticia,
        camposAlterados: ['evolucao'],
    }));
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: textoNovo })
        .expect(200);

    assert.equal(resposta.body.data.id, sessaoId);
    assert.equal(resposta.body.data.evolucao, textoNovo);
    assert.equal(corrigir.mock.callCount(), 1);

    const argumentos = corrigir.mock.calls[0]?.arguments;
    assert.ok(argumentos);
    assert.deepEqual(argumentos[0], contexto);
    assert.equal(argumentos[1], sessaoId);
    assert.deepEqual(argumentos[2], { evolucao: textoNovo });

    // A escrita e a auditoria sao feitas juntas no Service transacional.
    // O Controller nao deve registrar uma segunda auditoria.
    assert.equal(auditar.mock.callCount(), 0);
});

test('PATCH encaminha metadados de auditoria sem incluir conteudo clinico neles', async (t) => {
    const corrigir = t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao: sessaoFicticia,
        camposAlterados: ['evolucao'],
    }));
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: textoNovo })
        .expect(200);

    const metadados = corrigir.mock.calls[0]?.arguments[3];
    assert.ok(metadados, 'Metadados nao foram encaminhados ao Service.');
    assert.equal(metadados.requestId, resposta.headers['x-request-id']);
    assert.match(metadados.requestId ?? '', /^[0-9a-f-]{36}$/i);
    assert.ok(metadados.ip, 'IP deve constar nos metadados.');

    // O texto clinico fica no argumento dos dados de correcao,
    // nunca nos metadados usados para compor a auditoria.
    const jsonMetadados = JSON.stringify(metadados);
    assert.equal(jsonMetadados.includes(textoNovo), false);
    assert.equal(jsonMetadados.includes(textoAnterior), false);
    assert.equal(auditar.mock.callCount(), 0);
});

test('PATCH invalido devolve 400 e nao chama o Service', async (t) => {
    const corrigir = t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao: sessaoFicticia,
        camposAlterados: ['evolucao'],
    }));

    const resposta = await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: '' })
        .expect(400);

    assert.equal(resposta.body.codigo, 'DADOS_SESSAO_CLINICA_INVALIDOS');
    assert.equal(corrigir.mock.callCount(), 0);
});

test('PATCH rejeitado pelo Service preserva 404 no HTTP', async (t) => {
    t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => {
        throw new AppError('Sessao nao encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    });
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: textoNovo })
        .expect(404);

    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    assert.equal(auditar.mock.callCount(), 0);
});

test('GET de historico devolve as versoes e nao audita o conteudo clinico', async (t) => {
    const versoes = [
        {
            id: crypto.randomUUID(),
            sessao_clinica_id: sessaoId,
            corrigido_por_usuario_id: usuarioId,
            campos_alterados: ['evolucao'],
            dados_anteriores: { evolucao: textoAnterior },
            dados_novos: { evolucao: textoNovo },
            criado_em: new Date('2026-10-02T14:00:00Z'),
        },
    ];
    const listarHistorico = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listarHistoricoCorrecoes',
        async () => versoes,
    );
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(200);

    assert.equal(resposta.body.data.length, 1);
    assert.equal(resposta.body.data[0].dados_anteriores.evolucao, textoAnterior);
    assert.equal(resposta.body.data[0].dados_novos.evolucao, textoNovo);

    const metadados = listarHistorico.mock.calls[0]?.arguments[2];
    assert.ok(metadados);
    assert.equal(metadados.requestId, resposta.headers['x-request-id']);
    assert.ok(metadados.ip);
    assert.equal(JSON.stringify(metadados).includes(textoNovo), false);
    assert.equal(JSON.stringify(metadados).includes(textoAnterior), false);
    assert.equal(auditar.mock.callCount(), 0);
});

test('GET de historico negado nao grava auditoria de sucesso', async (t) => {
    t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listarHistoricoCorrecoes',
        async () => {
            throw new AppError('Acesso clinico negado.', 403, 'ACESSO_CLINICO_NEGADO');
        },
    );
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
    assert.equal(auditar.mock.callCount(), 0);
});

test('Controller recusa requisicao sem area de negocio', async (t) => {
    const buscar = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listarHistoricoCorrecoes',
        async () => [],
    );

    const resposta = await request(criarAppTeste(false))
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(400);

    assert.equal(resposta.body.codigo, 'AREA_NEGOCIO_NAO_INFORMADA');
    assert.equal(buscar.mock.callCount(), 0);
});
