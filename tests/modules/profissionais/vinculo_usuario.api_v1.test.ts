import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

// ============================================================
// IDENTIFICADORES DOS REGISTROS FICTÍCIOS
// ============================================================

const f = {
    organizacaoAId: crypto.randomUUID(),
    organizacaoBId: crypto.randomUUID(),
    areaAId: crypto.randomUUID(),
    administradorId: crypto.randomUUID(),
    operadorId: crypto.randomUUID(),
    profissionalAId: crypto.randomUUID(),
    profissionalBId: crypto.randomUUID(),
};

let moduloAgendaId: string;
let moduloCriadoPeloTeste = false;

const rota = `/api/v1/profissionais/${f.profissionalAId}/usuario`;

function cabecalhos(usuarioId = f.administradorId) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET de teste não definida.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return {
        Cookie: `token=${token}`,
        'x-organizacao-id': f.organizacaoAId,
        'x-area-negocio-id': f.areaAId,
    };
}

async function profissionalAtual() {
    return connection('profissionais').select('usuario_id').where('id', f.profissionalAId).first();
}

async function permissaoAtual() {
    return connection('profissionais_areas')
        .select('acesso_clinico_autorizado')
        .where('profissional_id', f.profissionalAId)
        .first();
}

async function buscarAuditorias() {
    return connection('registros_auditoria')
        .where({
            organizacao_id: f.organizacaoAId,
            recurso: 'PROFISSIONAL',
            recurso_id: f.profissionalAId,
        })
        .whereIn('acao', ['PROFISSIONAL.USUARIO_VINCULADO', 'PROFISSIONAL.USUARIO_DESVINCULADO']);
}

// ============================================================
// PREPARAÇÃO
// ============================================================

before(async () => {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('É obrigatório utilizar o banco exclusivo de testes.');
    }

    await connection('organizacoes').insert([
        {
            id: f.organizacaoAId,
            nome: 'Organização API Vínculo A',
            ativo: true,
        },
        {
            id: f.organizacaoBId,
            nome: 'Organização API Vínculo B',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert({
        id: f.areaAId,
        organizacao_id: f.organizacaoAId,
        codigo: `VAPI-${f.areaAId.slice(0, 8)}`,
        nome: 'Fisioterapia',
        ativo: true,
    });

    await connection('usuarios').insert([
        {
            id: f.administradorId,
            nome: 'Administrador fictício',
            email: `vapi-admin-${f.administradorId}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        },
        {
            id: f.operadorId,
            nome: 'Operador fictício',
            email: `vapi-operador-${f.operadorId}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: f.administradorId,
            organizacao_id: f.organizacaoAId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: f.operadorId,
            organizacao_id: f.organizacaoAId,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await connection('profissionais').insert([
        {
            id: f.profissionalAId,
            organizacao_id: f.organizacaoAId,
            usuario_id: null,
            nome: 'Profissional A',
            ativo: true,
        },
        {
            id: f.profissionalBId,
            organizacao_id: f.organizacaoBId,
            usuario_id: null,
            nome: 'Profissional B',
            ativo: true,
        },
    ]);

    await connection('profissionais_areas').insert({
        profissional_id: f.profissionalAId,
        area_negocio_id: f.areaAId,
        ativo: true,
        acesso_clinico_autorizado: true,
    });

    const modulo = await connection('modulos')
        .select('id', 'ativo', 'deletado_em')
        .where('codigo', 'AGENDA')
        .first();

    if (modulo) {
        if (!modulo.ativo || modulo.deletado_em) {
            throw new Error('O módulo AGENDA deve estar ativo.');
        }

        moduloAgendaId = modulo.id as string;
    } else {
        moduloAgendaId = crypto.randomUUID();
        moduloCriadoPeloTeste = true;

        await connection('modulos').insert({
            id: moduloAgendaId,
            codigo: 'AGENDA',
            nome: 'Agenda',
            ativo: true,
        });
    }

    await connection('organizacoes_modulos').insert({
        organizacao_id: f.organizacaoAId,
        modulo_id: moduloAgendaId,
        habilitado: true,
    });

    await connection('areas_modulos').insert({
        area_negocio_id: f.areaAId,
        modulo_id: moduloAgendaId,
        habilitado: true,
    });
});

// ============================================================
// RESTAURAR FIXTURE ENTRE TESTES
// ============================================================

beforeEach(async () => {
    await connection('profissionais').where('id', f.profissionalAId).update({
        usuario_id: null,
        ativo: true,
    });

    await connection('profissionais_areas')
        .where({
            profissional_id: f.profissionalAId,
            area_negocio_id: f.areaAId,
        })
        .update({
            acesso_clinico_autorizado: true,
        });

    await connection('areas_modulos')
        .where({
            area_negocio_id: f.areaAId,
            modulo_id: moduloAgendaId,
        })
        .update({
            habilitado: true,
        });

    await connection('registros_auditoria')
        .where({
            organizacao_id: f.organizacaoAId,
            recurso_id: f.profissionalAId,
        })
        .whereIn('acao', ['PROFISSIONAL.USUARIO_VINCULADO', 'PROFISSIONAL.USUARIO_DESVINCULADO'])
        .del();
});

// ============================================================
// LIMPEZA
// ============================================================

after(async () => {
    try {
        if (env.NODE_ENV === 'test' && process.env.AMBIENTE_BANCO === 'teste') {
            await connection('registros_auditoria')
                .whereIn('organizacao_id', [f.organizacaoAId, f.organizacaoBId])
                .del();

            await connection('profissionais_areas')
                .where('profissional_id', f.profissionalAId)
                .del();

            await connection('profissionais')
                .whereIn('id', [f.profissionalAId, f.profissionalBId])
                .del();

            await connection('areas_modulos').where('area_negocio_id', f.areaAId).del();

            await connection('organizacoes_modulos')
                .where('organizacao_id', f.organizacaoAId)
                .del();

            await connection('usuarios_organizacoes')
                .whereIn('usuario_id', [f.administradorId, f.operadorId])
                .del();

            await connection('usuarios').whereIn('id', [f.administradorId, f.operadorId]).del();

            await connection('areas_negocio').where('id', f.areaAId).del();

            await connection('organizacoes')
                .whereIn('id', [f.organizacaoAId, f.organizacaoBId])
                .del();

            if (moduloCriadoPeloTeste) {
                await connection('modulos').where('id', moduloAgendaId).del();
            }
        }
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// 1. SEM AUTENTICAÇÃO
// ============================================================

test('API v1 exige autenticação no vínculo', async () => {
    const resposta = await request(app).patch(rota).send({ usuarioId: f.operadorId }).expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

// ============================================================
// 2. OPERADOR BLOQUEADO
// ============================================================

test('API v1 bloqueia operador', async () => {
    const resposta = await request(app)
        .patch(rota)
        .set(cabecalhos(f.operadorId))
        .send({ usuarioId: f.operadorId })
        .expect(403);

    assert.equal(resposta.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

// ============================================================
// 3. MÓDULO AGENDA DESABILITADO
// ============================================================

test('API v1 respeita módulo AGENDA desabilitado', async () => {
    await connection('areas_modulos')
        .where({
            area_negocio_id: f.areaAId,
            modulo_id: moduloAgendaId,
        })
        .update({
            habilitado: false,
        });

    try {
        const resposta = await request(app)
            .patch(rota)
            .set(cabecalhos())
            .send({ usuarioId: f.operadorId })
            .expect(403);

        assert.equal(resposta.body.codigo, 'MODULO_NAO_HABILITADO');
    } finally {
        await connection('areas_modulos')
            .where({
                area_negocio_id: f.areaAId,
                modulo_id: moduloAgendaId,
            })
            .update({
                habilitado: true,
            });
    }
});

// ============================================================
// 4. ISOLAMENTO ORGANIZACIONAL
// ============================================================

test('API v1 não altera profissional de outra organização', async () => {
    const resposta = await request(app)
        .patch(`/api/v1/profissionais/${f.profissionalBId}/usuario`)
        .set(cabecalhos())
        .send({ usuarioId: f.operadorId })
        .expect(404);

    assert.equal(resposta.body.codigo, 'PROFISSIONAL_NAO_ENCONTRADO');
});

// ============================================================
// 5. BODY INVÁLIDO
// ============================================================

test('API v1 rejeita body inválido', async () => {
    const resposta = await request(app)
        .patch(rota)
        .set(cabecalhos())
        .send({ usuarioId: 123 })
        .expect(400);

    assert.equal(resposta.body.codigo, 'DADOS_VINCULO_USUARIO_INVALIDOS');
});

// ============================================================
// 6. VINCULAÇÃO, REVOGAÇÃO E AUDITORIA
// ============================================================

test('API v1 vincula usuário sem herdar acesso clínico', async () => {
    const resposta = await request(app)
        .patch(rota)
        .set(cabecalhos())
        .send({ usuarioId: f.operadorId })
        .expect(200);

    assert.deepEqual(resposta.body.data, {
        profissionalId: f.profissionalAId,
        usuarioId: f.operadorId,
    });

    const profissional = await profissionalAtual();

    assert.equal(profissional?.usuario_id, f.operadorId);

    const permissao = await permissaoAtual();

    assert.equal(permissao?.acesso_clinico_autorizado, false);

    const registros = await buscarAuditorias();

    assert.equal(registros.length, 1);

    assert.equal(registros[0]?.acao, 'PROFISSIONAL.USUARIO_VINCULADO');

    assert.equal(registros[0]?.usuario_id, f.administradorId);

    assert.equal(registros[0]?.dados_contexto.usuarioNovoId, f.operadorId);

    const contexto = JSON.stringify(registros[0]?.dados_contexto);

    for (const campo of ['senha_hash', 'evolucao', 'diagnostico_fisioterapeutico']) {
        assert.equal(contexto.includes(campo), false);
    }
});

// ============================================================
// 7. DESVINCULAÇÃO E AUDITORIA
// ============================================================

test('API v1 desvincula usuário e revoga a permissão', async () => {
    await connection('profissionais').where('id', f.profissionalAId).update({
        usuario_id: f.operadorId,
    });

    const resposta = await request(app)
        .patch(rota)
        .set(cabecalhos())
        .send({ usuarioId: null })
        .expect(200);

    assert.deepEqual(resposta.body.data, {
        profissionalId: f.profissionalAId,
        usuarioId: null,
    });

    const profissional = await profissionalAtual();

    assert.equal(profissional?.usuario_id, null);

    const permissao = await permissaoAtual();

    assert.equal(permissao?.acesso_clinico_autorizado, false);

    const registros = await buscarAuditorias();

    assert.equal(registros.length, 1);

    assert.equal(registros[0]?.acao, 'PROFISSIONAL.USUARIO_DESVINCULADO');

    assert.equal(registros[0]?.dados_contexto.usuarioAnteriorId, f.operadorId);

    assert.equal(registros[0]?.dados_contexto.usuarioNovoId, null);
});

// ============================================================
// 8. ROTAS CLÍNICAS CONTINUAM FECHADAS
// ============================================================

test('API v1 continua sem expor sessões clínicas', async () => {
    const resposta = await request(app)
        .get('/api/v1/sessoes-clinicas')
        .set(cabecalhos())
        .expect(404);

    assert.equal(resposta.body.codigo, 'ROTA_NAO_ENCONTRADA');
});
