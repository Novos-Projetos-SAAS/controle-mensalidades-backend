import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import appPrincipal from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import vinculoUsuarioRoutes from '../../../src/modules/profissionais/vinculo_usuario.routes.js';
import vinculoUsuarioService from '../../../src/modules/profissionais/vinculo_usuario.service.js';
import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';

// ============================================================
// IDENTIFICADORES
// ============================================================

const f = {
    orgA: crypto.randomUUID(),
    orgB: crypto.randomUUID(),
    areaA: crypto.randomUUID(),
    areaB: crypto.randomUUID(),
    adminA: crypto.randomUUID(),
    adminB: crypto.randomUUID(),
    operadorA: crypto.randomUUID(),
    operadorLivre: crypto.randomUUID(),
    operadorB: crypto.randomUUID(),
    profissionalLivre: crypto.randomUUID(),
    profissionalLivre2: crypto.randomUUID(),
    profissionalVinculado: crypto.randomUUID(),
    profissionalB: crypto.randomUUID(),
    clienteId: crypto.randomUUID(),
};

const idsProfissionais = [
    f.profissionalLivre,
    f.profissionalLivre2,
    f.profissionalVinculado,
    f.profissionalB,
];

const idsUsuarios = [f.adminA, f.adminB, f.operadorA, f.operadorLivre, f.operadorB];

let moduloAgendaId: string | undefined;
let moduloCriadoPeloTeste = false;

// ============================================================
// APLICAÇÃO ISOLADA
// ============================================================

const appTeste = express();

appTeste.use(requestId);
appTeste.use(express.json());
appTeste.use(cookieParser());

appTeste.use('/profissionais', vinculoUsuarioRoutes);
appTeste.use(errorHandler);

function rota(profissionalId = f.profissionalLivre) {
    return `/profissionais/${profissionalId}/usuario`;
}

function cookie(usuarioId: string) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET de teste não configurada.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return `token=${token}`;
}

function cabecalhos(usuarioId = f.adminA, organizacaoId = f.orgA, areaId = f.areaA) {
    return {
        Cookie: cookie(usuarioId),
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

function dados(profissionalId: string, usuarioId: string | null) {
    return {
        organizacaoId: f.orgA,
        areaNegocioId: f.areaA,
        administradorId: f.adminA,
        profissionalId,
        usuarioId,
        requestId: crypto.randomUUID(),
    };
}

async function buscarProfissional(profissionalId: string) {
    return connection('profissionais').select('usuario_id').where('id', profissionalId).first();
}

async function buscarPermissao(profissionalId: string) {
    return connection('profissionais_areas')
        .select('acesso_clinico_autorizado')
        .where('profissional_id', profissionalId)
        .first();
}

async function auditorias(profissionalId: string) {
    return connection('registros_auditoria')
        .where({
            organizacao_id: f.orgA,
            recurso: 'PROFISSIONAL',
            recurso_id: profissionalId,
        })
        .whereIn('acao', ['PROFISSIONAL.USUARIO_VINCULADO', 'PROFISSIONAL.USUARIO_DESVINCULADO']);
}

function verificarErro(codigo: string, statusCode: number) {
    return (erro: unknown): boolean =>
        typeof erro === 'object' &&
        erro !== null &&
        'code' in erro &&
        erro.code === codigo &&
        'statusCode' in erro &&
        erro.statusCode === statusCode;
}

// ============================================================
// PREPARAÇÃO
// ============================================================

before(async () => {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Execute somente com NODE_ENV=test.');
    }

    if (process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Banco exclusivo de testes obrigatório.');
    }

    await connection('organizacoes').insert([
        {
            id: f.orgA,
            nome: 'Organização Vínculo A',
            ativo: true,
        },
        {
            id: f.orgB,
            nome: 'Organização Vínculo B',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: f.areaA,
            organizacao_id: f.orgA,
            codigo: `VUA-${f.areaA.slice(0, 8)}`,
            nome: 'Fisioterapia A',
            ativo: true,
        },
        {
            id: f.areaB,
            organizacao_id: f.orgB,
            codigo: `VUB-${f.areaB.slice(0, 8)}`,
            nome: 'Fisioterapia B',
            ativo: true,
        },
    ]);

    await connection('usuarios').insert(
        idsUsuarios.map((id) => ({
            id,
            nome: 'Usuário fictício do teste',
            email: `vinculo-${id}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        })),
    );

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: f.adminA,
            organizacao_id: f.orgA,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: f.adminB,
            organizacao_id: f.orgB,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        ...[f.operadorA, f.operadorLivre].map((usuarioId) => ({
            usuario_id: usuarioId,
            organizacao_id: f.orgA,
            perfil: 'OPERADOR',
            ativo: true,
        })),
        {
            usuario_id: f.operadorB,
            organizacao_id: f.orgB,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await connection('clientes').insert({
        id: f.clienteId,
        organizacao_id: f.orgA,
        nome: 'Paciente fictício',
        ativo: true,
    });

    await connection('profissionais').insert([
        {
            id: f.profissionalLivre,
            organizacao_id: f.orgA,
            usuario_id: null,
            nome: 'Profissional sem usuário',
            ativo: true,
        },
        {
            id: f.profissionalLivre2,
            organizacao_id: f.orgA,
            usuario_id: null,
            nome: 'Outro profissional livre',
            ativo: true,
        },
        {
            id: f.profissionalVinculado,
            organizacao_id: f.orgA,
            usuario_id: f.operadorA,
            nome: 'Profissional já vinculado',
            ativo: true,
        },
        {
            id: f.profissionalB,
            organizacao_id: f.orgB,
            usuario_id: f.operadorB,
            nome: 'Profissional de outra organização',
            ativo: true,
        },
    ]);

    await connection('profissionais_areas').insert([
        ...[f.profissionalLivre, f.profissionalLivre2, f.profissionalVinculado].map(
            (profissionalId) => ({
                profissional_id: profissionalId,
                area_negocio_id: f.areaA,
                ativo: true,
                acesso_clinico_autorizado: true,
            }),
        ),
        {
            profissional_id: f.profissionalB,
            area_negocio_id: f.areaB,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);

    const modulo = await connection('modulos')
        .select('id', 'ativo', 'deletado_em')
        .where('codigo', 'AGENDA')
        .first();

    if (modulo) {
        if (!modulo.ativo || modulo.deletado_em) {
            throw new Error('O módulo AGENDA precisa estar ativo.');
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

    await connection('organizacoes_modulos').insert([
        {
            organizacao_id: f.orgA,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
        {
            organizacao_id: f.orgB,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
    ]);

    await connection('areas_modulos').insert([
        {
            area_negocio_id: f.areaA,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
        {
            area_negocio_id: f.areaB,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
    ]);
});

// ============================================================
// ESTADO INICIAL DE CADA TESTE
// ============================================================

beforeEach(async () => {
    await connection('sessoes_clinicas').where('profissional_id', f.profissionalVinculado).del();

    await connection('profissionais')
        .whereIn('id', [f.profissionalLivre, f.profissionalLivre2])
        .update({
            usuario_id: null,
            ativo: true,
        });

    await connection('profissionais').where('id', f.profissionalVinculado).update({
        usuario_id: f.operadorA,
        ativo: true,
    });

    await connection('profissionais_areas')
        .whereIn('profissional_id', [
            f.profissionalLivre,
            f.profissionalLivre2,
            f.profissionalVinculado,
        ])
        .update({
            acesso_clinico_autorizado: true,
        });

    await connection('usuarios').where('id', f.operadorLivre).update({ ativo: true });

    await connection('registros_auditoria')
        .where('organizacao_id', f.orgA)
        .whereIn('recurso_id', idsProfissionais)
        .whereIn('acao', ['PROFISSIONAL.USUARIO_VINCULADO', 'PROFISSIONAL.USUARIO_DESVINCULADO'])
        .del();
});

// ============================================================
// LIMPEZA
// ============================================================

after(async () => {
    try {
        if (env.NODE_ENV === 'test' && process.env.AMBIENTE_BANCO === 'teste') {
            await connection('sessoes_clinicas').whereIn('profissional_id', idsProfissionais).del();

            await connection('registros_auditoria').whereIn('recurso_id', idsProfissionais).del();

            await connection('profissionais_areas')
                .whereIn('profissional_id', idsProfissionais)
                .del();

            await connection('profissionais').whereIn('id', idsProfissionais).del();

            await connection('areas_modulos').whereIn('area_negocio_id', [f.areaA, f.areaB]).del();

            await connection('organizacoes_modulos')
                .whereIn('organizacao_id', [f.orgA, f.orgB])
                .del();

            await connection('clientes').where('id', f.clienteId).del();

            await connection('usuarios_organizacoes').whereIn('usuario_id', idsUsuarios).del();

            await connection('usuarios').whereIn('id', idsUsuarios).del();

            await connection('areas_negocio').whereIn('id', [f.areaA, f.areaB]).del();

            await connection('organizacoes').whereIn('id', [f.orgA, f.orgB]).del();

            if (moduloCriadoPeloTeste && moduloAgendaId) {
                await connection('modulos').where('id', moduloAgendaId).del();
            }
        }
    } finally {
        await connection.destroy();
    }
});

// ============================================================
// TESTE 1 — ROTA PRINCIPAL EXIGE AUTENTICAÇÃO
// ============================================================

test('API principal exige autenticação para vincular usuário', async () => {
    const resposta = await request(appPrincipal)
        .patch(`/api/v1/profissionais/${f.profissionalLivre}/usuario`)
        .set({
            'x-organizacao-id': f.orgA,
            'x-area-negocio-id': f.areaA,
        })
        .send({ usuarioId: f.operadorLivre })
        .expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

// ============================================================
// TESTE 2 — AUTENTICAÇÃO OBRIGATÓRIA
// ============================================================

test('bloqueia requisição sem autenticação', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .send({ usuarioId: f.operadorLivre })
        .expect(401);

    assert.equal(resposta.body.codigo, 'TOKEN_AUSENTE');
});

// ============================================================
// TESTE 3 — PERFIL NÃO AUTORIZADO
// ============================================================

test('operador não pode vincular usuário', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos(f.operadorA))
        .send({ usuarioId: f.operadorLivre })
        .expect(403);

    assert.equal(resposta.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

// ============================================================
// TESTE 4 — BODY INVÁLIDO
// ============================================================

test('recusa valores inválidos e campos extras', async () => {
    const corposInvalidos = [
        {},
        { usuarioId: 'invalido' },
        { usuarioId: 123 },
        {
            usuarioId: f.operadorLivre,
            organizacaoId: f.orgB,
        },
    ];

    for (const corpo of corposInvalidos) {
        const resposta = await request(appTeste)
            .patch(rota())
            .set(cabecalhos())
            .send(corpo)
            .expect(400);

        assert.equal(resposta.body.codigo, 'DADOS_VINCULO_USUARIO_INVALIDOS');
    }
});

// ============================================================
// TESTE 5 — ISOLAMENTO ENTRE ORGANIZAÇÕES
// ============================================================

test('não altera profissional de outra organização', async () => {
    const resposta = await request(appTeste)
        .patch(rota(f.profissionalB))
        .set(cabecalhos())
        .send({ usuarioId: f.operadorLivre })
        .expect(404);

    assert.equal(resposta.body.codigo, 'PROFISSIONAL_NAO_ENCONTRADO');
});

// ============================================================
// TESTE 6 — USUÁRIO DE OUTRA ORGANIZAÇÃO
// ============================================================

test('não associa usuário de outra organização', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos())
        .send({ usuarioId: f.operadorB })
        .expect(404);

    assert.equal(resposta.body.codigo, 'USUARIO_NAO_ENCONTRADO');
});

// ============================================================
// TESTE 7 — USUÁRIO JÁ VINCULADO
// ============================================================

test('impede usuário vinculado a outro profissional', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos())
        .send({ usuarioId: f.operadorA })
        .expect(409);

    assert.equal(resposta.body.codigo, 'USUARIO_JA_VINCULADO_PROFISSIONAL');
});

// ============================================================
// TESTE 8 — VINCULAR COM AUDITORIA E REVOGAÇÃO
// ============================================================

test('vincula usuário e revoga permissões antigas', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos())
        .send({ usuarioId: f.operadorLivre })
        .expect(200);

    assert.deepEqual(resposta.body.data, {
        profissionalId: f.profissionalLivre,
        usuarioId: f.operadorLivre,
    });

    const profissional = await buscarProfissional(f.profissionalLivre);

    assert.equal(profissional?.usuario_id, f.operadorLivre);

    const permissao = await buscarPermissao(f.profissionalLivre);

    assert.equal(permissao?.acesso_clinico_autorizado, false);

    const registros = await auditorias(f.profissionalLivre);

    assert.equal(registros.length, 1);
    assert.equal(registros[0]?.acao, 'PROFISSIONAL.USUARIO_VINCULADO');

    const contexto = registros[0]?.dados_contexto;

    assert.equal(contexto.usuarioAnteriorId, null);

    assert.equal(contexto.usuarioNovoId, f.operadorLivre);

    assert.equal(contexto.autorizacoesClinicasRevogadas, true);

    const auditoriaJson = JSON.stringify(contexto);

    for (const proibido of ['senha_hash', 'evolucao', 'diagnostico_fisioterapeutico']) {
        assert.equal(auditoriaJson.includes(proibido), false);
    }

    // Mesmo vinculado, o usuário não recebe acesso clínico.
    await assert.rejects(
        autorizacaoClinicaService.identificarProfissional(f.operadorLivre, f.orgA, f.areaA),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );
});

// ============================================================
// TESTE 9 — DESVINCULAR COM REVOGAÇÃO
// ============================================================

test('desvincula usuário e revoga acesso clínico', async () => {
    const resposta = await request(appTeste)
        .patch(rota(f.profissionalVinculado))
        .set(cabecalhos())
        .send({ usuarioId: null })
        .expect(200);

    assert.equal(resposta.body.data.usuarioId, null);

    const profissional = await buscarProfissional(f.profissionalVinculado);

    assert.equal(profissional?.usuario_id, null);

    const permissao = await buscarPermissao(f.profissionalVinculado);

    assert.equal(permissao?.acesso_clinico_autorizado, false);

    const registros = await auditorias(f.profissionalVinculado);

    assert.equal(registros.length, 1);
    assert.equal(registros[0]?.acao, 'PROFISSIONAL.USUARIO_DESVINCULADO');

    await assert.rejects(
        autorizacaoClinicaService.identificarProfissional(f.operadorA, f.orgA, f.areaA),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );
});

// ============================================================
// TESTE 10 — OPERAÇÃO REPETIDA
// ============================================================

test('rejeita vínculo sem alteração e sem auditoria', async () => {
    const resposta = await request(appTeste)
        .patch(rota())
        .set(cabecalhos())
        .send({ usuarioId: null })
        .expect(409);

    assert.equal(resposta.body.codigo, 'VINCULO_USUARIO_SEM_ALTERACAO');

    assert.equal((await auditorias(f.profissionalLivre)).length, 0);
});

// ============================================================
// TESTE 11 — TROCA DIRETA PROIBIDA
// ============================================================

test('não substitui diretamente usuário já vinculado', async () => {
    const resposta = await request(appTeste)
        .patch(rota(f.profissionalVinculado))
        .set(cabecalhos())
        .send({ usuarioId: f.operadorLivre })
        .expect(409);

    assert.equal(resposta.body.codigo, 'TROCA_DIRETA_USUARIO_NAO_PERMITIDA');
});

// ============================================================
// TESTE 12 — HISTÓRICO CLÍNICO SOFT-DELETED
// ============================================================

test('bloqueia desvinculação mesmo com sessão clínica deletada', async () => {
    const sessaoId = crypto.randomUUID();

    await connection('sessoes_clinicas').insert({
        id: sessaoId,
        organizacao_id: f.orgA,
        area_negocio_id: f.areaA,
        cliente_id: f.clienteId,
        profissional_id: f.profissionalVinculado,
        data_sessao: new Date('2026-10-01T12:00:00Z'),
        evolucao: 'Texto fictício exclusivo de teste.',
        deletado_em: new Date(),
    });

    try {
        const resposta = await request(appTeste)
            .patch(rota(f.profissionalVinculado))
            .set(cabecalhos())
            .send({ usuarioId: null })
            .expect(409);

        assert.equal(resposta.body.codigo, 'PROFISSIONAL_COM_HISTORICO_CLINICO');

        const profissional = await buscarProfissional(f.profissionalVinculado);

        assert.equal(profissional?.usuario_id, f.operadorA);

        assert.equal((await auditorias(f.profissionalVinculado)).length, 0);
    } finally {
        await connection('sessoes_clinicas').where('id', sessaoId).del();
    }
});

// ============================================================
// TESTE 13 — USUÁRIO INATIVO
// ============================================================

test('não vincula usuário inativo', async () => {
    await connection('usuarios').where('id', f.operadorLivre).update({ ativo: false });

    try {
        const resposta = await request(appTeste)
            .patch(rota())
            .set(cabecalhos())
            .send({ usuarioId: f.operadorLivre })
            .expect(404);

        assert.equal(resposta.body.codigo, 'USUARIO_NAO_ENCONTRADO');
    } finally {
        await connection('usuarios').where('id', f.operadorLivre).update({ ativo: true });
    }
});

// ============================================================
// TESTE 14 — CONCORRÊNCIA
// ============================================================

test('duas vinculações simultâneas não duplicam o usuário', async () => {
    const [primeira, segunda] = await Promise.all([
        request(appTeste)
            .patch(rota(f.profissionalLivre))
            .set(cabecalhos())
            .send({ usuarioId: f.operadorLivre }),

        request(appTeste)
            .patch(rota(f.profissionalLivre2))
            .set(cabecalhos())
            .send({ usuarioId: f.operadorLivre }),
    ]);

    const status = [primeira.status, segunda.status].sort();

    assert.deepEqual(status, [200, 409]);

    const profissionais = await connection('profissionais')
        .select('id')
        .where({
            organizacao_id: f.orgA,
            usuario_id: f.operadorLivre,
        })
        .whereNull('deletado_em');

    assert.equal(profissionais.length, 1);
});

// ============================================================
// TESTE 15 — SERVICE REVALIDA ADMINISTRADOR
// ============================================================

test('Service impede operador mesmo sem middleware HTTP', async () => {
    await assert.rejects(
        vinculoUsuarioService.alterar({
            ...dados(f.profissionalLivre, f.operadorLivre),
            administradorId: f.operadorA,
        }),
        verificarErro('VINCULO_USUARIO_GESTOR_NEGADO', 403),
    );
});
