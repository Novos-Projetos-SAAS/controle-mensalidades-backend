import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';

import {
    homologacaoClinicaAtiva, exigirAcessoClinicoDeHomologacao,
} from '../../src/modules/prontuario/prontuario.homologacao.middleware.js';
import AppError from '../../src/shared/errors/AppError.js';

test('somente development de homologacao ou test isolado libera API', () => {
    const opts = {
        CLINICAL_HOMOLOGATION_ENABLED: 'true',
        CLINICAL_HOMOLOGATION_CONFIRMATION: 'SOMENTE_DADOS_FICTICIOS',
    };
    assert.equal(homologacaoClinicaAtiva({
        ...opts, NODE_ENV: 'development', AMBIENTE_BANCO: 'homologacao',
    }), true);
    assert.equal(homologacaoClinicaAtiva({
        ...opts, NODE_ENV: 'test', AMBIENTE_BANCO: 'teste',
    }), true);
    for (const o of [
        { ...opts, NODE_ENV: 'production', AMBIENTE_BANCO: 'homologacao' },
        { ...opts, NODE_ENV: 'development', AMBIENTE_BANCO: 'desenv' },
        { ...opts, NODE_ENV: 'development', AMBIENTE_BANCO: 'teste' },
        { ...opts, NODE_ENV: 'test', AMBIENTE_BANCO: 'homologacao' },
        { ...opts, NODE_ENV: 'development', AMBIENTE_BANCO: 'homologacao', CLINICAL_HOMOLOGATION_ENABLED: 'false' },
        { ...opts, NODE_ENV: 'development', AMBIENTE_BANCO: 'homologacao', CLINICAL_HOMOLOGATION_CONFIRMATION: 'SIM' },
    ]) assert.equal(homologacaoClinicaAtiva(o), false);
});

test('gate sem opt-in retorna 403 sem consultar banco nem publicar informações', async () => {
    const original = {
        NODE_ENV: process.env.NODE_ENV,
        AMBIENTE_BANCO: process.env.AMBIENTE_BANCO,
        CLINICAL_HOMOLOGATION_ENABLED: process.env.CLINICAL_HOMOLOGATION_ENABLED,
    };
    process.env.NODE_ENV = 'production';
    process.env.CLINICAL_HOMOLOGATION_ENABLED = 'true';
    let erro: unknown;
    try {
        await exigirAcessoClinicoDeHomologacao(
            {} as Request, {} as Response,
            ((e: unknown) => { erro = e; }) as NextFunction,
        );
        assert.ok(erro instanceof AppError);
        assert.equal(erro.code, 'ACESSO_CLINICO_NAO_CONFIGURADO');
        assert.equal(erro.statusCode, 403);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});
