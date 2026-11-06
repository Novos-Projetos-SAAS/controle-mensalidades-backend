import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const organizacaoId = crypto.randomUUID();
const areaId = crypto.randomUUID();
const administradorId = crypto.randomUUID();
const operadorId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();

let moduloAgendaId: string;

const rota = `/api/v1/profissionais/${profissionalId}/acesso-clinico`;

function cabecalhos(usuarioId: string) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não configurada.');
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

// ============================================================
// PREPARAÇÃO
// ============================================================

before(async () => {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Execute exclusivamente no ambiente de testes.');
    }

    await connection('organizacoes').insert({
        id: organizacaoId,
        nome: 'Clinica API Permissoes',
        ativo: true,
    });

    await connection('areas_negocio').insert({
        id: areaId,
        organizacao_id: organizacaoId,
        codigo: `PERM-${areaId.slice(0, 8)}`,
        nome: 'Fisioterapia',
        ativo: true,
    });

    await connection('usuarios').insert([
        {
            id: administradorId,
            nome: 'Administrador API',
            email: `admin-${administradorId}@teste.local`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorId,
            nome: 'Profissional API',
            email: `operador-${operadorId}@teste.local`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: administradorId,
            organizacao_id: organizacaoId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: operadorId,
            organizacao_id: organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await connection('profissionais').insert({
        id: profissionalId,
        organizacao_id: organizacaoId,
        usuario_id: operadorId,
        nome: 'Fisioterapeuta de teste',
        ativo: true,
    });

    await connection('profissionais_areas').insert({
        profissional_id: profissionalId,
        area_negocio_id: areaId,
        ativo: true,
        acesso_clinico_autorizado: false,
    });

    const modulo = await connection('modulos')
        .select('id', 'ativo', 'deletado_em')
        .where('codigo', 'AGENDA')
        .first();

    if (modulo) {
        if (!modulo.ativo || modulo.deletado_em) {
            throw new Error('Módulo AGENDA indisponível.');
        }

        moduloAgendaId = modulo.id as string;
    } else {
        moduloAgendaId = crypto.randomUUID();

        await connection('modulos').insert({
            id: moduloAgendaId,
            codigo: 'AGENDA',
            nome: 'Agenda',
            ativo: true,
        });
    }

    await connection('organizacoes_modulos').insert({
        organizacao_id: organizacaoId,
        modulo_id: moduloAgendaId,
        habilitado: true,
    });

    await connection('areas_modulos').insert({
        area_negocio_id: areaId,
        modulo_id: moduloAgendaId,
        habilitado: true,
    });
});

// ============================================================
// LIMPEZA
// ============================================================

after(async () => {
    try {
        if (env.NODE_ENV === 'test') {
            await connection('registros_auditoria').where('organizacao_id', organizacaoId).del();

            await connection('profissionais_areas').where('profissional_id', profissionalId).del();

            await connection('profissionais').where('id', profissionalId).del();

            await connection('areas_modulos').where('area_negocio_id', areaId).del();

            await connection('organizacoes_modulos').where('organizacao_id', organizacaoId).del();

            await connection('usuarios_organizacoes')
                .whereIn('usuario_id', [administradorId, operadorId])
                .del();

            await connection('usuarios').whereIn('id', [administradorId, operadorId]).del();

            await connection('areas_negocio').where('id', areaId).del();

            await connection('organizacoes').where('id', organizacaoId).del();
        }
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// TESTE 1 — AUTENTICAÇÃO
// ============================================================

test('API principal bloqueia alteração sem login', async () => {
    const resposta = await request(app).patch(rota).send({ autorizado: true }).expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

// ============================================================
// TESTE 2 — PERFIL NÃO AUTORIZADO
// ============================================================

test('API principal impede operador de conceder acesso', async () => {
    const resposta = await request(app)
        .patch(rota)
        .set(cabecalhos(operadorId))
        .send({ autorizado: true })
        .expect(403);

    assert.equal(resposta.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

// ============================================================
// TESTE 3 — MÓDULO DESABILITADO
// ============================================================

test('API principal respeita módulo AGENDA desabilitado', async () => {
    await connection('areas_modulos')
        .where({
            area_negocio_id: areaId,
            modulo_id: moduloAgendaId,
        })
        .update({ habilitado: false });

    try {
        const resposta = await request(app)
            .patch(rota)
            .set(cabecalhos(administradorId))
            .send({ autorizado: true })
            .expect(403);

        assert.equal(resposta.body.codigo, 'MODULO_NAO_HABILITADO');
    } finally {
        await connection('areas_modulos')
            .where({
                area_negocio_id: areaId,
                modulo_id: moduloAgendaId,
            })
            .update({ habilitado: true });
    }
});

// ============================================================
// TESTE 4 — CONCESSÃO E REVOGAÇÃO NA API REAL
// ============================================================

test('API principal concede e revoga acesso com auditoria', async () => {
    const concessao = await request(app)
        .patch(rota)
        .set(cabecalhos(administradorId))
        .send({ autorizado: true })
        .expect(200);

    assert.equal(concessao.body.data.autorizado, true);

    const vinculoAutorizado = await connection('profissionais_areas')
        .where({
            profissional_id: profissionalId,
            area_negocio_id: areaId,
        })
        .first();

    assert.equal(vinculoAutorizado?.acesso_clinico_autorizado, true);

    const revogacao = await request(app)
        .patch(rota)
        .set(cabecalhos(administradorId))
        .send({ autorizado: false })
        .expect(200);

    assert.equal(revogacao.body.data.autorizado, false);

    const vinculoRevogado = await connection('profissionais_areas')
        .where({
            profissional_id: profissionalId,
            area_negocio_id: areaId,
        })
        .first();

    assert.equal(vinculoRevogado?.acesso_clinico_autorizado, false);

    const auditorias = await connection('registros_auditoria')
        .select('acao', 'usuario_id', 'dados_contexto')
        .where({
            organizacao_id: organizacaoId,
            recurso_id: profissionalId,
        })
        .whereIn('acao', ['PERMISSAO_CLINICA.CONCEDIDA', 'PERMISSAO_CLINICA.REVOGADA']);

    assert.equal(auditorias.length, 2);

    assert.deepEqual(
        auditorias.map((registro) => registro.acao).sort(),
        ['PERMISSAO_CLINICA.CONCEDIDA', 'PERMISSAO_CLINICA.REVOGADA'].sort(),
    );

    for (const registro of auditorias) {
        assert.equal(registro.usuario_id, administradorId);
    }
});
