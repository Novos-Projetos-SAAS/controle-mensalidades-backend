import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import type { NextFunction, Request, Response } from 'express';

import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';
import sessoesClinicasAcessoService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.acesso.service.js';
import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';
import AppError from '../../../src/shared/errors/AppError.js';

const usuarioId = crypto.randomUUID();
const organizacaoId = crypto.randomUUID();
const areaNegocioId = crypto.randomUUID();
const sessaoClinicaId = crypto.randomUUID();
const clienteId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();

const contexto = {
    usuarioId,
    organizacaoId,
    areaNegocioId,
};

const sessao = {
    id: sessaoClinicaId,
    cliente_id: clienteId,
    profissional_id: profissionalId,
    agendamento_id: null,
    data_sessao: new Date('2026-10-01T14:00:00Z'),
    corrigido_em: new Date('2026-10-02T14:00:00Z'),
    cliente_nome: 'Paciente fictício',
    profissional_nome: 'Profissional fictício',
    evolucao: 'Evolução clínica corrigida.',
    diagnostico_fisioterapeutico: null,
    prognostico: null,
    plano_terapeutico: null,
    observacoes: null,
    corrigido_por_usuario_id: usuarioId,
};

type EstadoResposta = {
    statusCode?: number;
    corpo?: unknown;
};

type EstadoNext = {
    erro?: unknown;
};

function criarRequest(body: unknown = {}, id = sessaoClinicaId): Request {
    return {
        auth: {
            ...contexto,
            perfil: 'OPERADOR',
        },
        body,
        params: { sessaoClinicaId: id },
        query: {},
        requestId: crypto.randomUUID(),
        ip: '127.0.0.1',
        get: () => undefined,
    } as unknown as Request;
}

function criarResponse() {
    const estado: EstadoResposta = {};
    const response = {
        status(statusCode: number) {
            estado.statusCode = statusCode;
            return response;
        },
        json(corpo: unknown) {
            estado.corpo = corpo;
            return response;
        },
    } as unknown as Response;

    return { response, estado };
}

function criarNext() {
    const estado: EstadoNext = {};
    const next = ((erro?: unknown) => {
        estado.erro = erro;
    }) as NextFunction;

    return { next, estado };
}

test('correção utiliza o serviço de acesso protegido', async (t) => {
    const dadosCorrecao = { evolucao: 'Evolução clínica corrigida.' };
    const corrigir = t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao,
        camposAlterados: ['evolucao'],
    }));
    const registrarAuditoria = t.mock.method(auditoriaService, 'registrar', async () => undefined);
    const req = criarRequest(dadosCorrecao);
    const { response, estado: estadoResposta } = criarResponse();
    const { next, estado: estadoNext } = criarNext();

    await sessoesClinicasController.corrigir(req, response, next);

    assert.equal(estadoNext.erro, undefined);
    assert.equal(corrigir.mock.callCount(), 1);
    assert.deepEqual(corrigir.mock.calls[0]?.arguments, [contexto, sessaoClinicaId, dadosCorrecao]);
    assert.equal(estadoResposta.statusCode, 200);
    assert.deepEqual(estadoResposta.corpo, {
        status: 'success',
        message: 'Sessão clínica corrigida com sucesso.',
        data: sessao,
    });

    const registro = registrarAuditoria.mock.calls[0]?.arguments[0];
    assert.equal(registro?.acao, 'SESSAO_CLINICA.CORRIGIDA');
    assert.equal(registro?.recursoId, sessaoClinicaId);
    assert.deepEqual(registro?.dadosContexto?.camposAlterados, ['evolucao']);
    assert.equal(JSON.stringify(registro).includes(dadosCorrecao.evolucao), false);
});

test('payload inválido é rejeitado antes de corrigir', async (t) => {
    const corrigir = t.mock.method(sessoesClinicasAcessoService, 'corrigir', async () => ({
        sessao,
        camposAlterados: ['evolucao'],
    }));
    const registrarAuditoria = t.mock.method(auditoriaService, 'registrar', async () => undefined);
    const req = criarRequest({});
    const { response, estado: estadoResposta } = criarResponse();
    const { next, estado: estadoNext } = criarNext();

    await sessoesClinicasController.corrigir(req, response, next);

    assert.equal(corrigir.mock.callCount(), 0);
    assert.equal(registrarAuditoria.mock.callCount(), 0);
    assert.equal(estadoResposta.statusCode, undefined);
    assert.ok(estadoNext.erro instanceof AppError);
    assert.equal(estadoNext.erro.code, 'DADOS_SESSAO_CLINICA_INVALIDOS');
    assert.equal(estadoNext.erro.statusCode, 400);
});

test('histórico utiliza o serviço de acesso protegido', async (t) => {
    const historico = [
        {
            id: crypto.randomUUID(),
            sessao_clinica_id: sessaoClinicaId,
            corrigido_por_usuario_id: usuarioId,
            campos_alterados: ['evolucao'],
            dados_anteriores: { evolucao: 'Evolução anterior.' },
            dados_novos: { evolucao: 'Evolução clínica corrigida.' },
            criado_em: new Date('2026-10-02T14:00:00Z'),
        },
    ];
    const listarHistorico = t.mock.method(
        sessoesClinicasAcessoService,
        'listarHistoricoCorrecoes',
        async () => historico,
    );
    const registrarAuditoria = t.mock.method(auditoriaService, 'registrar', async () => undefined);
    const req = criarRequest();
    const { response, estado: estadoResposta } = criarResponse();
    const { next, estado: estadoNext } = criarNext();

    await sessoesClinicasController.listarHistoricoCorrecoes(req, response, next);

    assert.equal(estadoNext.erro, undefined);
    assert.equal(listarHistorico.mock.callCount(), 1);
    assert.deepEqual(listarHistorico.mock.calls[0]?.arguments, [contexto, sessaoClinicaId]);
    assert.equal(estadoResposta.statusCode, 200);
    assert.deepEqual(estadoResposta.corpo, {
        status: 'success',
        message: 'Histórico de correções consultado com sucesso.',
        data: historico,
    });

    const registro = registrarAuditoria.mock.calls[0]?.arguments[0];
    assert.equal(registro?.acao, 'SESSAO_CLINICA.HISTORICO_CONSULTADO');
    assert.equal(registro?.recursoId, sessaoClinicaId);
    assert.equal(JSON.stringify(registro).includes('Evolução clínica corrigida.'), false);
});

test('acesso negado não retorna histórico clínico', async (t) => {
    const listarHistorico = t.mock.method(
        sessoesClinicasAcessoService,
        'listarHistoricoCorrecoes',
        async () => {
            throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
        },
    );
    const registrarAuditoria = t.mock.method(auditoriaService, 'registrar', async () => undefined);
    const req = criarRequest();
    const { response, estado: estadoResposta } = criarResponse();
    const { next, estado: estadoNext } = criarNext();

    await sessoesClinicasController.listarHistoricoCorrecoes(req, response, next);

    assert.equal(listarHistorico.mock.callCount(), 1);
    assert.equal(registrarAuditoria.mock.callCount(), 0);
    assert.equal(estadoResposta.statusCode, undefined);
    assert.equal(estadoResposta.corpo, undefined);
    assert.ok(estadoNext.erro instanceof AppError);
    assert.equal(estadoNext.erro.code, 'ACESSO_CLINICO_NEGADO');
    assert.equal(JSON.stringify(estadoNext.erro).includes('Evolução'), false);
});
