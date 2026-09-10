import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import verificarModulo from '../../../src/middlewares/verifyModule.middleware.js';
import verifyOrganization from '../../../src/middlewares/verifyOrganization.middleware.js';
import verifyUser from '../../../src/middlewares/verifyUser.middleware.js';
import areasModulosRepository from '../../../src/modules/areas_modulos/areas_modulos.repository.js';
import areasNegocioRepository from '../../../src/modules/areas_negocio/areas_negocio.repository.js';
import contextoRepository from '../../../src/modules/contexto/contexto.repository.js';
import modulosRepository from '../../../src/modules/modulos/modulos.repository.js';

const organizacaoId = crypto.randomUUID();
const organizacaoDeletadaId = crypto.randomUUID();

const usuarioId = crypto.randomUUID();
const usuarioDeletadoId = crypto.randomUUID();
const usuarioVinculoDeletadoId = crypto.randomUUID();

const areaId = crypto.randomUUID();
const areaDeletadaId = crypto.randomUUID();

const moduloAtivoId = crypto.randomUUID();
const moduloDeletadoId = crypto.randomUUID();
const moduloVinculoOrganizacaoDeletadoId = crypto.randomUUID();
const moduloVinculoAreaDeletadoId = crypto.randomUUID();

const codigoModuloAtivo = `ATIVO_${moduloAtivoId.slice(0, 8)}`;
const codigoModuloDeletado = `DELETADO_${moduloDeletadoId.slice(0, 8)}`;
const codigoModuloVinculoOrganizacaoDeletado = `OM_DELETADO_${moduloVinculoOrganizacaoDeletadoId.slice(0, 8)}`;
const codigoModuloVinculoAreaDeletado = `AM_DELETADO_${moduloVinculoAreaDeletadoId.slice(0, 8)}`;

const usuariosIds = [usuarioId, usuarioDeletadoId, usuarioVinculoDeletadoId];

const organizacoesIds = [organizacaoId, organizacaoDeletadaId];

const areasIds = [areaId, areaDeletadaId];

const modulosIds = [
    moduloAtivoId,
    moduloDeletadoId,
    moduloVinculoOrganizacaoDeletadoId,
    moduloVinculoAreaDeletadoId,
];

function gerarToken(id: string) {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwt.sign({}, jwtSecret, {
        subject: id,
        expiresIn: env.JWT_EXPIRES_IN,
    });
}

function criarAppProtegida() {
    const appTeste = express();

    appTeste.use(requestId);
    appTeste.use(cookieParser());

    appTeste.get('/protegida', verifyUser, verifyOrganization, (_req, res) => {
        res.status(200).json({
            status: 'success',
        });
    });

    appTeste.use(errorHandler);

    return appTeste;
}

function criarAppModulo(codigoModulo: string, areaNegocioId = areaId) {
    const appTeste = express();

    appTeste.use(requestId);

    appTeste.get(
        '/modulo',
        (req, _res, next) => {
            Object.assign(req, {
                auth: {
                    usuarioId,
                    organizacaoId,
                    areaNegocioId,
                    perfil: 'ADMINISTRADOR',
                },
            });

            next();
        },
        verificarModulo(codigoModulo),
        (_req, res) => {
            res.status(200).json({
                status: 'success',
            });
        },
    );

    appTeste.use(errorHandler);

    return appTeste;
}

async function limparDadosTeste() {
    await connection('areas_modulos').whereIn('modulo_id', modulosIds).del();

    await connection('organizacoes_modulos').whereIn('modulo_id', modulosIds).del();

    await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();

    await connection('modulos').whereIn('id', modulosIds).del();

    await connection('areas_negocio').whereIn('id', areasIds).del();

    await connection('usuarios').whereIn('id', usuariosIds).del();

    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoId,
            nome: 'Organização Soft Delete',
            ativo: true,
        },
        {
            id: organizacaoDeletadaId,
            nome: 'Organização Soft Deleted',
            ativo: true,
            deletado_em: new Date(),
        },
    ]);

    await connection('usuarios').insert([
        {
            id: usuarioId,
            nome: 'Usuário Soft Delete',
            email: `soft-delete-${usuarioId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: usuarioDeletadoId,
            nome: 'Usuário Soft Deleted',
            email: `soft-deleted-${usuarioDeletadoId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: usuarioVinculoDeletadoId,
            nome: 'Usuário Vínculo Soft Deleted',
            email: `soft-link-${usuarioVinculoDeletadoId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: usuarioId,
            organizacao_id: organizacaoId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioId,
            organizacao_id: organizacaoDeletadaId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioDeletadoId,
            organizacao_id: organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: usuarioVinculoDeletadoId,
            organizacao_id: organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
            deletado_em: new Date(),
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaId,
            organizacao_id: organizacaoId,
            nome: 'Área Ativa Soft Delete',
            codigo: `ATIVA_${areaId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaDeletadaId,
            organizacao_id: organizacaoId,
            nome: 'Área Soft Deleted',
            codigo: `DELETADA_${areaDeletadaId.slice(0, 8)}`,
            ativo: true,
            deletado_em: new Date(),
        },
    ]);

    await connection('modulos').insert([
        {
            id: moduloAtivoId,
            codigo: codigoModuloAtivo,
            nome: 'Módulo Ativo Soft Delete',
            ativo: true,
        },
        {
            id: moduloDeletadoId,
            codigo: codigoModuloDeletado,
            nome: 'Módulo Soft Deleted',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: moduloVinculoOrganizacaoDeletadoId,
            codigo: codigoModuloVinculoOrganizacaoDeletado,
            nome: 'Módulo Vínculo Organização Soft Deleted',
            ativo: true,
        },
        {
            id: moduloVinculoAreaDeletadoId,
            codigo: codigoModuloVinculoAreaDeletado,
            nome: 'Módulo Vínculo Área Soft Deleted',
            ativo: true,
        },
    ]);

    await connection('organizacoes_modulos').insert([
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloAtivoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloDeletadoId,
            habilitado: true,
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloVinculoOrganizacaoDeletadoId,
            habilitado: true,
            deletado_em: new Date(),
        },
        {
            organizacao_id: organizacaoId,
            modulo_id: moduloVinculoAreaDeletadoId,
            habilitado: true,
        },
    ]);

    await connection('areas_modulos').insert([
        {
            area_negocio_id: areaId,
            modulo_id: moduloAtivoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaDeletadaId,
            modulo_id: moduloAtivoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaId,
            modulo_id: moduloDeletadoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaId,
            modulo_id: moduloVinculoOrganizacaoDeletadoId,
            habilitado: true,
        },
        {
            area_negocio_id: areaId,
            modulo_id: moduloVinculoAreaDeletadoId,
            habilitado: true,
            deletado_em: new Date(),
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

test('área soft-deleted não deve aparecer na listagem', async () => {
    const areas = await areasNegocioRepository.listarPorOrganizacao(organizacaoId);

    assert.equal(
        areas.some((area) => area.id === areaDeletadaId),
        false,
    );

    assert.equal(
        areas.some((area) => area.id === areaId),
        true,
    );
});

test('módulo soft-deleted não deve aparecer na listagem da organização', async () => {
    const modulos = await modulosRepository.listarHabilitadosPorOrganizacao(organizacaoId);

    assert.equal(
        modulos.some((modulo) => modulo.id === moduloDeletadoId),
        false,
    );
});

test('vínculo organizacoes_modulos soft-deleted não deve habilitar módulo', async () => {
    const modulos = await modulosRepository.listarHabilitadosPorOrganizacao(organizacaoId);

    assert.equal(
        modulos.some((modulo) => modulo.id === moduloVinculoOrganizacaoDeletadoId),
        false,
    );
});

test('vínculo areas_modulos soft-deleted não deve habilitar módulo na área', async () => {
    const modulos = await areasModulosRepository.listarHabilitadosPorArea(organizacaoId, areaId);

    assert.equal(
        modulos.some((modulo) => modulo.id === moduloVinculoAreaDeletadoId),
        false,
    );
});

test('contextoArea não deve resolver área soft-deleted', async () => {
    const area = await contextoRepository.buscarAreaPorOrganizacao(organizacaoId, areaDeletadaId);

    assert.equal(area, undefined);
});

test('organização soft-deleted não deve autorizar rota protegida', async () => {
    const response = await request(criarAppProtegida())
        .get('/protegida')
        .set('Cookie', `token=${gerarToken(usuarioId)}`)
        .set('x-organizacao-id', organizacaoDeletadaId);

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'ORGANIZACAO_NAO_AUTORIZADA');
});

test('usuário soft-deleted não deve autenticar em rota protegida', async () => {
    const response = await request(criarAppProtegida())
        .get('/protegida')
        .set('Cookie', `token=${gerarToken(usuarioDeletadoId)}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 401);
    assert.equal(response.body.codigo, 'AUTENTICACAO_INVALIDA');
});

test('vínculo usuarios_organizacoes soft-deleted não deve autorizar rota protegida', async () => {
    const response = await request(criarAppProtegida())
        .get('/protegida')
        .set('Cookie', `token=${gerarToken(usuarioVinculoDeletadoId)}`)
        .set('x-organizacao-id', organizacaoId);

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'ORGANIZACAO_NAO_AUTORIZADA');
});

test('verificarModulo não deve aceitar módulo soft-deleted', async () => {
    const response = await request(criarAppModulo(codigoModuloDeletado)).get('/modulo');

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo não deve aceitar organizacoes_modulos soft-deleted', async () => {
    const response = await request(criarAppModulo(codigoModuloVinculoOrganizacaoDeletado)).get(
        '/modulo',
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo não deve aceitar areas_modulos soft-deleted', async () => {
    const response = await request(criarAppModulo(codigoModuloVinculoAreaDeletado)).get('/modulo');

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('verificarModulo não deve aceitar área soft-deleted', async () => {
    const response = await request(criarAppModulo(codigoModuloAtivo, areaDeletadaId)).get(
        '/modulo',
    );

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'MODULO_NAO_HABILITADO');
});
