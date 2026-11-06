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
import AppError from '../../../src/shared/errors/AppError.js';

// Este arquivo testa o CONTRATO HTTP do Controller com mocks do Service.
// NÃO substitui os testes reais de transação e PostgreSQL do Service.
// Não abre conexão nem grava informações clínicas no banco.

const usuarioId = crypto.randomUUID();
const organizacaoId = crypto.randomUUID();
const areaId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();
const pacienteId = crypto.randomUUID();
const sessaoId = crypto.randomUUID();
const textoAnterior = 'Evolucao inicial sigilosa de teste.';
const textoNovo = 'Evolucao corrigida sigilosa de teste.';

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

    // Contexto fictício apenas para exercitar o Controller.
    // Os middlewares reais de autenticação são cobertos em outros testes HTTP.
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

test('PATCH autorizado devolve 200 e a sessão corrigida', async (t) => {
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
    assert.equal(auditar.mock.callCount(), 1);
});

test('auditoria de PATCH contém nomes dos campos, mas não o conteúdo clínico', async (t) => {
    t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao: sessaoFicticia,
        camposAlterados: ['evolucao'],
    }));
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: textoNovo })
        .expect(200);

    const dadosAuditoria = auditar.mock.calls[0]?.arguments[0];
    assert.equal(dadosAuditoria?.acao, 'SESSAO_CLINICA.CORRIGIDA');
    assert.deepEqual(dadosAuditoria?.dadosContexto?.camposAlterados, ['evolucao']);
    assert.equal(JSON.stringify(dadosAuditoria).includes(textoNovo), false);
    assert.equal(JSON.stringify(dadosAuditoria).includes(textoAnterior), false);
});

test('PATCH inválido devolve 400 e não chama o Service', async (t) => {
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
        throw new AppError('Sessão não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    });
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .patch(`/sessoes-clinicas/${sessaoId}`)
        .send({ evolucao: textoNovo })
        .expect(404);

    assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    assert.equal(auditar.mock.callCount(), 0);
});

test('GET de histórico devolve as versões e não audita o conteúdo clínico', async (t) => {
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
    t.mock.method(sessoesClinicasAcessoService, 'listarHistoricoCorrecoes', async () => versoes);
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(200);

    assert.equal(resposta.body.data.length, 1);
    assert.equal(resposta.body.data[0].dados_anteriores.evolucao, textoAnterior);
    assert.equal(resposta.body.data[0].dados_novos.evolucao, textoNovo);

    const dadosAuditoria = auditar.mock.calls[0]?.arguments[0];
    assert.equal(dadosAuditoria?.acao, 'SESSAO_CLINICA.HISTORICO_CONSULTADO');
    assert.equal(JSON.stringify(dadosAuditoria).includes(textoNovo), false);
    assert.equal(JSON.stringify(dadosAuditoria).includes(textoAnterior), false);
});

test('GET de histórico negado não grava auditoria de sucesso', async (t) => {
    t.mock.method(sessoesClinicasAcessoService, 'listarHistoricoCorrecoes', async () => {
        throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
    });
    const auditar = t.mock.method(auditoriaService, 'registrar', async () => undefined);

    const resposta = await request(criarAppTeste())
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(403);

    assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
    assert.equal(auditar.mock.callCount(), 0);
});

test('Controller recusa requisição sem área de negócio', async (t) => {
    const buscar = t.mock.method(
        sessoesClinicasAcessoService,
        'listarHistoricoCorrecoes',
        async () => [],
    );

    const resposta = await request(criarAppTeste(false))
        .get(`/sessoes-clinicas/${sessaoId}/historico`)
        .expect(400);

    assert.equal(resposta.body.codigo, 'AREA_NEGOCIO_NAO_INFORMADA');
    assert.equal(buscar.mock.callCount(), 0);
});
