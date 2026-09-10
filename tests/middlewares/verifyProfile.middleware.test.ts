import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express, { type Request } from 'express';

import request from 'supertest';

import errorHandler from '../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../src/middlewares/requestId.middleware.js';
import verifyProfile from '../../src/middlewares/verifyProfile.middleware.js';

const usuarioId = crypto.randomUUID();
const organizacaoId = crypto.randomUUID();

type RequestComAuth = Request & {
    auth?: {
        usuarioId: string;
        organizacaoId: string;
        areaNegocioId?: string;
        perfil: string;
    };
};

function criarAppTeste(perfil: string | undefined, ...perfisPermitidos: string[]) {
    const appTeste = express();

    appTeste.use(requestId);
    appTeste.get(
        '/teste',
        (req, _res, next) => {
            if (perfil) {
                Object.assign(req, {
                    auth: {
                        usuarioId,
                        organizacaoId,
                        perfil,
                    },
                });
            }

            next();
        },
        verifyProfile(...perfisPermitidos),
        (req, res) => {
            const reqComAuth = req as RequestComAuth;

            res.status(200).json({
                status: 'success',
                data: reqComAuth.auth,
            });
        },
    );
    appTeste.use(errorHandler);

    return appTeste;
}

test('verifyProfile deve permitir ADMINISTRADOR quando autorizado', async () => {
    const response = await request(criarAppTeste('ADMINISTRADOR', 'ADMINISTRADOR')).get('/teste');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
});

test('verifyProfile deve permitir OPERADOR quando estiver entre os perfis autorizados', async () => {
    const response = await request(criarAppTeste('OPERADOR', 'ADMINISTRADOR', 'OPERADOR')).get(
        '/teste',
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
});

test('verifyProfile deve bloquear OPERADOR em operação administrativa', async () => {
    const response = await request(criarAppTeste('OPERADOR', 'ADMINISTRADOR')).get('/teste');

    assert.equal(response.status, 403);
    assert.equal(response.body.situacao, 'falha');
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
    assert.equal(response.body.mensagem, 'Usuário não possui permissão para esta operação.');
    assert.equal(typeof response.body.request_id, 'string');
});

test('verifyProfile deve exigir contexto autenticado', async () => {
    const response = await request(criarAppTeste(undefined, 'ADMINISTRADOR')).get('/teste');

    assert.equal(response.status, 401);
    assert.equal(response.body.situacao, 'falha');
    assert.equal(response.body.codigo, 'AUTENTICACAO_NECESSARIA');
    assert.equal(response.body.mensagem, 'Autenticação necessária.');
    assert.equal(typeof response.body.request_id, 'string');
});

test('verifyProfile não deve alterar o contexto autenticado', async () => {
    const response = await request(criarAppTeste('ADMINISTRADOR', 'ADMINISTRADOR')).get('/teste');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, {
        usuarioId,
        organizacaoId,
        perfil: 'ADMINISTRADOR',
    });
});
