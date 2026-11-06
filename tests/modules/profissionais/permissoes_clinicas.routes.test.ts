import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';

import permissoesClinicasRoutes from '../../../src/modules/profissionais/permissoes_clinicas.routes.js';
import permissoesClinicasService from '../../../src/modules/profissionais/permissoes_clinicas.service.js';

// ============================================================
// DADOS FICTÍCIOS
// ============================================================

const orgA = crypto.randomUUID();
const orgB = crypto.randomUUID();

const areaA = crypto.randomUUID();
const areaB = crypto.randomUUID();

const adminA = crypto.randomUUID();
const adminB = crypto.randomUUID();

const operadorA = crypto.randomUUID();
const operadorB = crypto.randomUUID();

const profA = crypto.randomUUID();
const profB = crypto.randomUUID();
const profSemUsuario = crypto.randomUUID();

// ============================================================
// APLICAÇÃO HTTP ISOLADA
// ============================================================

const appTeste = express();

appTeste.use(requestId);
appTeste.use(express.json());
appTeste.use(cookieParser());

appTeste.use('/profissionais', permissoesClinicasRoutes);
appTeste.use(errorHandler);

function cabecalhos(usuarioId: string, organizacaoId = orgA, areaId = areaA) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não definida.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return {
        Cookie: `token=${token}`,
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

function rota(profissionalId = profA) {
    return `/profissionais/${profissionalId}/acesso-clinico`;
}

// ============================================================
// PREPARAÇÃO
// ============================================================

before(async () => {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Execute somente com .env.test e NODE_ENV=test.');
    }

    await connection('organizacoes').insert([
        {
            id: orgA,
            nome: 'Clinica permissoes A',
            ativo: true,
        },
        {
            id: orgB,
            nome: 'Clinica permissoes B',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaA,
            organizacao_id: orgA,
            nome: 'Fisioterapia A',
            codigo: `PA-${areaA.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaB,
            organizacao_id: orgB,
            nome: 'Fisioterapia B',
            codigo: `PB-${areaB.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    await connection('usuarios').insert(
        [adminA, adminB, operadorA, operadorB].map((id) => ({
            id,
            nome: 'Usuario permissao clinica',
            email: `permissao-clinica-${id}@teste.local`,
            senha_hash: 'hash-teste',
            ativo: true,
        })),
    );

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: adminA,
            organizacao_id: orgA,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: adminB,
            organizacao_id: orgB,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: operadorA,
            organizacao_id: orgA,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: operadorB,
            organizacao_id: orgB,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await connection('profissionais').insert([
        {
            id: profA,
            organizacao_id: orgA,
            usuario_id: operadorA,
            nome: 'Profissional A',
            ativo: true,
        },
        {
            id: profB,
            organizacao_id: orgB,
            usuario_id: operadorB,
            nome: 'Profissional B',
            ativo: true,
        },
        {
            id: profSemUsuario,
            organizacao_id: orgA,
            usuario_id: null,
            nome: 'Profissional sem usuario',
            ativo: true,
        },
    ]);

    await connection('profissionais_areas').insert([
        {
            profissional_id: profA,
            area_negocio_id: areaA,
            ativo: true,
            acesso_clinico_autorizado: false,
        },
        {
            profissional_id: profB,
            area_negocio_id: areaB,
            ativo: true,
            acesso_clinico_autorizado: false,
        },
        {
            profissional_id: profSemUsuario,
            area_negocio_id: areaA,
            ativo: true,
            acesso_clinico_autorizado: false,
        },
    ]);
});

// ============================================================
// RESTAURAR ESTADO ENTRE TESTES
// ============================================================

beforeEach(async () => {
    await connection('profissionais_areas')
        .where({
            profissional_id: profA,
            area_negocio_id: areaA,
        })
        .update({
            acesso_clinico_autorizado: false,
        });

    await connection('registros_auditoria')
        .where({
            organizacao_id: orgA,
            recurso: 'PROFISSIONAL',
            recurso_id: profA,
        })
        .whereIn('acao', ['PERMISSAO_CLINICA.CONCEDIDA', 'PERMISSAO_CLINICA.REVOGADA'])
        .del();
});

// ============================================================
// LIMPEZA
// ============================================================

after(async () => {
    try {
        if (env.NODE_ENV === 'test') {
            await connection('registros_auditoria').whereIn('organizacao_id', [orgA, orgB]).del();

            await connection('profissionais_areas')
                .whereIn('profissional_id', [profA, profB, profSemUsuario])
                .del();

            await connection('profissionais').whereIn('id', [profA, profB, profSemUsuario]).del();

            await connection('usuarios_organizacoes')
                .whereIn('usuario_id', [adminA, adminB, operadorA, operadorB])
                .del();

            await connection('usuarios')
                .whereIn('id', [adminA, adminB, operadorA, operadorB])
                .del();

            await connection('areas_negocio').whereIn('id', [areaA, areaB]).del();

            await connection('organizacoes').whereIn('id', [orgA, orgB]).del();
        }
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// TESTE 1 — SEM AUTENTICAÇÃO
// ============================================================

test('recusa usuário sem autenticação (401)', async () => {
    const resposta = await request(appTeste).patch(rota()).send({ autorizado: true }).expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

// ============================================================
// TESTE 2 — OPERADOR NÃO É ADMINISTRADOR
// ============================================================

test('recusa operador sem perfil administrador (403)', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(operadorA))
        .send({ autorizado: true })
        .expect(403);

    assert.equal(resposta.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

// ============================================================
// TESTE 3 — CORPO INVÁLIDO
// ============================================================

test('recusa corpo inválido (400)', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(adminA))
        .send({ autorizado: 'true' })
        .expect(400);

    assert.equal(resposta.body.codigo, 'DADOS_PERMISSAO_CLINICA_INVALIDOS');
});

// ============================================================
// TESTE 4 — ISOLAMENTO ENTRE ORGANIZAÇÕES
// ============================================================

test('não altera profissional de outra organização (404)', async () => {
    const resposta = await request(appTeste)
        .patch(rota(profB))
        .set(cabecalhos(adminA))
        .send({ autorizado: true })
        .expect(404);

    assert.equal(resposta.body.codigo, 'PROFISSIONAL_NAO_ENCONTRADO');
});

// ============================================================
// TESTE 5 — PROFISSIONAL SEM USUÁRIO
// ============================================================

test('não concede acesso a profissional sem usuário vinculado (409)', async () => {
    const resposta = await request(appTeste)
        .patch(rota(profSemUsuario))
        .set(cabecalhos(adminA))
        .send({ autorizado: true })
        .expect(409);

    assert.equal(resposta.body.codigo, 'PROFISSIONAL_SEM_USUARIO_ATIVO');
});

// ============================================================
// TESTE 6 — CONCESSÃO COM AUDITORIA
// ============================================================

test('concede acesso e registra auditoria', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(adminA))
        .send({ autorizado: true })
        .expect(200);

    assert.equal(resposta.body.data.autorizado, true);

    const vinculo = await connection('profissionais_areas')
        .where({
            profissional_id: profA,
            area_negocio_id: areaA,
        })
        .first();

    assert.equal(vinculo?.acesso_clinico_autorizado, true);

    const auditoria = await connection('registros_auditoria')
        .where({
            organizacao_id: orgA,
            recurso_id: profA,
            acao: 'PERMISSAO_CLINICA.CONCEDIDA',
        })
        .first();

    assert.equal(auditoria?.usuario_id, adminA);
    assert.equal(auditoria?.area_negocio_id, areaA);

    assert.equal(auditoria?.dados_contexto.anterior, false);

    assert.equal(auditoria?.dados_contexto.novo, true);

    assert.equal(JSON.stringify(auditoria?.dados_contexto).includes('evolucao'), false);
});

// ============================================================
// TESTE 7 — REVOGAÇÃO COM AUDITORIA
// ============================================================

test('revoga acesso e registra estado anterior e novo', async () => {
    await request(appTeste)
        .patch(rota())
        .set(cabecalhos(adminA))
        .send({ autorizado: true })
        .expect(200);

    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(adminA))
        .send({ autorizado: false })
        .expect(200);

    assert.equal(resposta.body.data.autorizado, false);

    const vinculo = await connection('profissionais_areas')
        .where({
            profissional_id: profA,
            area_negocio_id: areaA,
        })
        .first();

    assert.equal(vinculo?.acesso_clinico_autorizado, false);

    const auditoria = await connection('registros_auditoria')
        .where({
            organizacao_id: orgA,
            recurso_id: profA,
            acao: 'PERMISSAO_CLINICA.REVOGADA',
        })
        .first();

    assert.equal(auditoria?.dados_contexto.anterior, true);

    assert.equal(auditoria?.dados_contexto.novo, false);
});

// ============================================================
// TESTE 8 — SEM MUDANÇA DE ESTADO
// ============================================================

test('recusa alteração repetida e não cria auditoria', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(adminA))
        .send({ autorizado: false })
        .expect(409);

    assert.equal(resposta.body.codigo, 'PERMISSAO_CLINICA_SEM_ALTERACAO');

    const registros = await connection('registros_auditoria')
        .where({
            organizacao_id: orgA,
            recurso_id: profA,
        })
        .whereIn('acao', ['PERMISSAO_CLINICA.CONCEDIDA', 'PERMISSAO_CLINICA.REVOGADA']);

    assert.equal(registros.length, 0);
});

// ============================================================
// TESTE 9 — USUÁRIO PROFISSIONAL INATIVO
// ============================================================

test('recusa concessão quando usuário profissional está inativo', async () => {
    await connection('usuarios').where('id', operadorA).update({ ativo: false });

    try {
        const resposta = await request(appTeste)
            .patch(rota())
            .set(cabecalhos(adminA))
            .send({ autorizado: true })
            .expect(409);

        assert.equal(resposta.body.codigo, 'PROFISSIONAL_SEM_USUARIO_ATIVO');
    } finally {
        await connection('usuarios').where('id', operadorA).update({ ativo: true });
    }
});

// ============================================================
// TESTE 10 — VALIDAÇÃO DENTRO DO SERVICE
// ============================================================

test('Service revalida perfil sem depender do middleware', async () => {
    await assert.rejects(
        permissoesClinicasService.alterar({
            organizacaoId: orgA,
            areaNegocioId: areaA,
            administradorId: operadorA,
            profissionalId: profA,
            autorizado: true,
            requestId: crypto.randomUUID(),
        }),
        (erro: unknown) =>
            typeof erro === 'object' &&
            erro !== null &&
            'statusCode' in erro &&
            erro.statusCode === 403 &&
            'code' in erro &&
            erro.code === 'PERMISSAO_CLINICA_GESTOR_NEGADO',
    );
});
