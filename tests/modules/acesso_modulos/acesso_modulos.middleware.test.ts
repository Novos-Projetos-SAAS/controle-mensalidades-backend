import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import express from 'express';
import request from 'supertest';

import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import verificarModulo from '../../../src/middlewares/verifyModule.middleware.js';

const organizacaoId = crypto.randomUUID();
const outraOrganizacaoId = crypto.randomUUID();

const areaNegocioId = crypto.randomUUID();
const outraAreaMesmaOrganizacaoId = crypto.randomUUID();
const areaOutraOrganizacaoId = crypto.randomUUID();

const usuarioId = crypto.randomUUID();

const moduloHabilitadoId = crypto.randomUUID();
const moduloDesabilitadoOrganizacaoId = crypto.randomUUID();
const moduloDesabilitadoAreaId = crypto.randomUUID();
const moduloInativoId = crypto.randomUUID();
const moduloOutraAreaId = crypto.randomUUID();
const moduloOutraOrganizacaoId = crypto.randomUUID();

const codigoModuloHabilitado = `AGENDA_${moduloHabilitadoId.slice(0, 8)}`;

const codigoModuloDesabilitadoOrganizacao = `CLINICO_${moduloDesabilitadoOrganizacaoId.slice(0, 8)}`;

const codigoModuloDesabilitadoArea = `FINANCEIRO_${moduloDesabilitadoAreaId.slice(0, 8)}`;

const codigoModuloInativo = `INATIVO_${moduloInativoId.slice(0, 8)}`;

const codigoModuloOutraArea = `OUTRA_AREA_${moduloOutraAreaId.slice(0, 8)}`;

const codigoModuloOutraOrganizacao = `OUTRA_ORG_${moduloOutraOrganizacaoId.slice(0, 8)}`;

const organizacoesIds = [organizacaoId, outraOrganizacaoId];

const areasIds = [areaNegocioId, outraAreaMesmaOrganizacaoId, areaOutraOrganizacaoId];

const modulosIds = [
    moduloHabilitadoId,
    moduloDesabilitadoOrganizacaoId,
    moduloDesabilitadoAreaId,
    moduloInativoId,
    moduloOutraAreaId,
    moduloOutraOrganizacaoId,
];

async function limparDadosTeste() {
    await connection('areas_modulos').whereIn('modulo_id', modulosIds).del();

    await connection('organizacoes_modulos').whereIn('modulo_id', modulosIds).del();

    await connection('modulos').whereIn('id', modulosIds).del();

    await connection('areas_negocio').whereIn('id', areasIds).del();

    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

function criarAppTeste(
    codigoModulo: string,
    organizacaoContextoId = organizacaoId,
    areaContextoId = areaNegocioId,
) {
    const appTeste = express();

    appTeste.use(requestId);

    /*
     * Simula o contexto já validado pelos middlewares:
     *
     * verificarToken
     * contextoArea
     */
    appTeste.get(
        '/teste',
        (req, _res, next) => {
            Object.assign(req, {
                auth: {
                    usuarioId,
                    organizacaoId: organizacaoContextoId,
                    areaNegocioId: areaContextoId,
                    perfil: 'ADMINISTRADOR',
                },
            });

            next();
        },
        verificarModulo(codigoModulo),
        (_req, res) => {
            return res.status(200).json({
                status: 'success',
                message: 'Acesso ao módulo permitido.',
            });
        },
    );

    appTeste.use(errorHandler);

    return appTeste;
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoId,
            nome: 'Organização Teste Acesso Módulos',
            ativo: true,
        },
        {
            id: outraOrganizacaoId,
            nome: 'Outra Organização Acesso Módulos',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaNegocioId,
            organizacao_id: organizacaoId,
            nome: 'Fisioterapia',
            codigo: `FISIO_${areaNegocioId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: outraAreaMesmaOrganizacaoId,
            organizacao_id: organizacaoId,
            nome: 'Pilates',
            codigo: `PILATES_${outraAreaMesmaOrganizacaoId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaOutraOrganizacaoId,
            organizacao_id: outraOrganizacaoId,
            nome: 'Área Outra Organização',
            codigo: `OUTRA_${areaOutraOrganizacaoId.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    await connection('modulos').insert([
        {
            id: moduloHabilitadoId,
            codigo: codigoModuloHabilitado,
            nome: 'Agenda',
            descricao: 'Módulo habilitado.',
            ativo: true,
        },
        {
            id: moduloDesabilitadoOrganizacaoId,
            codigo: codigoModuloDesabilitadoOrganizacao,
            nome: 'Clínico',
            descricao: 'Desabilitado na organização.',
            ativo: true,
        },
        {
            id: moduloDesabilitadoAreaId,
            codigo: codigoModuloDesabilitadoArea,
            nome: 'Financeiro',
            descricao: 'Desabilitado na área.',
            ativo: true,
        },
        {
            id: moduloInativoId,
            codigo: codigoModuloInativo,
            nome: 'Módulo Inativo',
            descricao: 'Módulo inativo.',
            ativo: false,
        },
        {
            id: moduloOutraAreaId,
            codigo: codigoModuloOutraArea,
            nome: 'Módulo Outra Área',
            descricao: 'Habilitado somente em outra área.',
            ativo: true,
        },
        {
            id: moduloOutraOrganizacaoId,
            codigo: codigoModuloOutraOrganizacao,
            nome: 'Módulo Outra Organização',
            descricao: 'Habilitado em outra organização.',
            ativo: true,
        },
    ]);

    await connection('organizacoes_modulos').insert([
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloHabilitadoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDesabilitadoOrganizacaoId,
            habilitado: false,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDesabilitadoAreaId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloInativoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloOutraAreaId,
            habilitado: true,
        },
        {
            organizacao_id: outraOrganizacaoId,
            modulo_id: moduloOutraOrganizacaoId,
            habilitado: true,
        },
    ]);

    await connection('areas_modulos').insert([
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloHabilitadoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloDesabilitadoOrganizacaoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloDesabilitadoAreaId,
            habilitado: false,
        },
        {
            area_negocio_id: areaNegocioId,
            modulo_id: moduloInativoId,
            habilitado: true,
        },
        {
            area_negocio_id: outraAreaMesmaOrganizacaoId,
            modulo_id: moduloOutraAreaId,
            habilitado: true,
        },
        {
            area_negocio_id: areaOutraOrganizacaoId,
            modulo_id: moduloOutraOrganizacaoId,
            habilitado: true,
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

test('verificarModulo deve permitir acesso quando módulo estiver habilitado na organização e na área', async () => {
    const appTeste = criarAppTeste(codigoModuloHabilitado);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 200);

    assert.equal(response.body.status, 'success');

    assert.equal(response.body.message, 'Acesso ao módulo permitido.');
});

test('verificarModulo deve negar acesso quando módulo estiver desabilitado na organização', async () => {
    const appTeste = criarAppTeste(codigoModuloDesabilitadoOrganizacao);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.mensagem, 'Módulo não habilitado para esta área.');

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo deve negar acesso quando módulo estiver desabilitado na área', async () => {
    const appTeste = criarAppTeste(codigoModuloDesabilitadoArea);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo deve negar acesso quando módulo estiver inativo', async () => {
    const appTeste = criarAppTeste(codigoModuloInativo);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo deve negar módulo habilitado somente em outra área da mesma organização', async () => {
    const appTeste = criarAppTeste(codigoModuloOutraArea);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo não deve permitir módulo habilitado em outra organização', async () => {
    const appTeste = criarAppTeste(codigoModuloOutraOrganizacao);

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo deve negar acesso quando código do módulo não existir', async () => {
    const appTeste = criarAppTeste('MODULO_INEXISTENTE');

    const response = await request(appTeste).get('/teste');

    assert.equal(response.status, 403);

    assert.equal(response.body.mensagem, 'Módulo não habilitado para esta área.');

    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});
