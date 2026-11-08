import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import type { NextFunction, Request, Response } from 'express';

import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';
import sessoesClinicasLeiturasTransacionaisService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.leituras_transacionais.service.js';
import AppError from '../../../src/shared/errors/AppError.js';

const ids = {
    usuarioId: crypto.randomUUID(),
    organizacaoId: crypto.randomUUID(),
    areaNegocioId: crypto.randomUUID(),
    profissionalId: crypto.randomUUID(),
    clienteId: crypto.randomUUID(),
    sessaoId: crypto.randomUUID(),
};

function criarRequest(): Request {
    return {
        auth: {
            usuarioId: ids.usuarioId,
            organizacaoId: ids.organizacaoId,
            areaNegocioId: ids.areaNegocioId,
            perfil: 'OPERADOR',
        },
        params: {
            sessaoClinicaId: ids.sessaoId,
        },
        query: {
            inicio: '2026-10-01T00:00:00Z',
            fim: '2026-10-02T00:00:00Z',
        },
        body: {},
        requestId: crypto.randomUUID(),
        ip: '127.0.0.1',
        get: () => undefined,
    } as unknown as Request;
}

function criarResposta() {
    const estado: {
        statusCode?: number;
        corpo?: unknown;
        erro?: unknown;
    } = {};

    const resposta = {
        status(codigo: number) {
            estado.statusCode = codigo;
            return resposta;
        },
        json(corpo: unknown) {
            estado.corpo = corpo;
            return resposta;
        },
    } as Response;

    const next = ((erro?: unknown) => {
        estado.erro = erro;
    }) as NextFunction;

    return {
        resposta,
        next,
        estado,
    };
}

function verificarBloqueio(estado: { statusCode?: number; corpo?: unknown; erro?: unknown }) {
    assert.equal(estado.statusCode, undefined);
    assert.equal(estado.corpo, undefined);

    assert.ok(estado.erro instanceof AppError);

    assert.equal(estado.erro.statusCode, 503);

    assert.equal(estado.erro.code, 'AUDITORIA_CLINICA_INDISPONIVEL');
}

function simularFalhaAuditoria() {
    throw new AppError(
        'Auditoria clínica temporariamente indisponível.',
        503,
        'AUDITORIA_CLINICA_INDISPONIVEL',
    );
}

// ============================================================
// TESTE 1 — LISTAGEM
// ============================================================

test('não entrega listagem clínica se auditoria falhar', async (t) => {
    const listar = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listar',
        simularFalhaAuditoria,
    );

    const { resposta, next, estado } = criarResposta();

    await sessoesClinicasController.listar(criarRequest(), resposta, next);

    assert.equal(listar.mock.callCount(), 1);

    verificarBloqueio(estado);
});

// ============================================================
// TESTE 2 — CONSULTA INDIVIDUAL
// ============================================================

test('não entrega prontuário por ID se auditoria falhar', async (t) => {
    const buscar = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'buscarPorId',
        simularFalhaAuditoria,
    );

    const { resposta, next, estado } = criarResposta();

    await sessoesClinicasController.buscarPorId(criarRequest(), resposta, next);

    assert.equal(buscar.mock.callCount(), 1);

    verificarBloqueio(estado);
});

// ============================================================
// TESTE 3 — HISTÓRICO
// ============================================================

test('não entrega histórico de correções se auditoria falhar', async (t) => {
    const listarHistorico = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listarHistoricoCorrecoes',
        simularFalhaAuditoria,
    );

    const { resposta, next, estado } = criarResposta();

    await sessoesClinicasController.listarHistoricoCorrecoes(criarRequest(), resposta, next);

    assert.equal(listarHistorico.mock.callCount(), 1);

    verificarBloqueio(estado);
});
