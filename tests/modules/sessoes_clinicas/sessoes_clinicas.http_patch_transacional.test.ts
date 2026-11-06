import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, type TestContext } from 'node:test';

import express from 'express';
import type { Knex } from 'knex';
import request from 'supertest';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import errorHandler from '../../../src/middlewares/errorHandler.middleware.js';
import requestId from '../../../src/middlewares/requestId.middleware.js';
import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';
import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';
import sessoesClinicasController from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.controller.js';
import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';
import AppError from '../../../src/shared/errors/AppError.js';

// Integração HTTP -> Controller -> Service -> SQL real.
// O pré-check de titularidade e a auditoria são mocks, pois os dados fictícios
// ainda não estão confirmados. A autorização transacional, o UPDATE e o INSERT
// do histórico são reais, executados em savepoints da transação externa.
// O ROLLBACK externo apaga todas as correções, inclusive as imutáveis.

type Fixture = {
    organizacaoId: string;
    areaId: string;
    usuarioId: string;
    outroUsuarioId: string;
    clienteId: string;
    profissionalId: string;
    outroProfissionalId: string;
    sessaoId: string;
    sessaoOutroId: string;
};

const TEXTO_ORIGINAL = 'Texto original ficticio protegido.';
const TEXTO_CORRIGIDO = 'Texto corrigido ficticio protegido.';
const TEXTO_FINAL = 'Texto final ficticio protegido.';

function novosIds(): Fixture {
    return {
        organizacaoId: crypto.randomUUID(),
        areaId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        outroUsuarioId: crypto.randomUUID(),
        clienteId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        outroProfissionalId: crypto.randomUUID(),
        sessaoId: crypto.randomUUID(),
        sessaoOutroId: crypto.randomUUID(),
    };
}

async function prepararDados(tx: Knex.Transaction, f: Fixture) {
    await tx('organizacoes').insert({
        id: f.organizacaoId,
        nome: 'Clinica testes PATCH',
        ativo: true,
    });
    await tx('areas_negocio').insert({
        id: f.areaId,
        organizacao_id: f.organizacaoId,
        codigo: `RBP-${f.areaId.slice(0, 8)}`,
        nome: 'Fisioterapia de testes',
        ativo: true,
    });
    await tx('usuarios').insert(
        [f.usuarioId, f.outroUsuarioId].map((id) => ({
            id,
            nome: 'Usuario ficticio',
            email: `patch-rollback-${id}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        })),
    );
    await tx('usuarios_organizacoes').insert(
        [f.usuarioId, f.outroUsuarioId].map((usuarioId) => ({
            usuario_id: usuarioId,
            organizacao_id: f.organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        })),
    );
    await tx('clientes').insert({
        id: f.clienteId,
        organizacao_id: f.organizacaoId,
        nome: 'Paciente ficticio',
        ativo: true,
    });
    await tx('profissionais').insert([
        {
            id: f.profissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.usuarioId,
            nome: 'Fisioterapeuta titular',
            ativo: true,
        },
        {
            id: f.outroProfissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.outroUsuarioId,
            nome: 'Outro fisioterapeuta',
            ativo: true,
        },
    ]);
    await tx('profissionais_areas').insert([
        {
            profissional_id: f.profissionalId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: f.outroProfissionalId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);
    await tx('sessoes_clinicas').insert([
        {
            id: f.sessaoId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaId,
            cliente_id: f.clienteId,
            profissional_id: f.profissionalId,
            data_sessao: new Date('2026-10-01T14:00:00Z'),
            evolucao: TEXTO_ORIGINAL,
        },
        {
            id: f.sessaoOutroId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaId,
            cliente_id: f.clienteId,
            profissional_id: f.outroProfissionalId,
            data_sessao: new Date('2026-10-01T15:00:00Z'),
            evolucao: 'Registro de outro profissional.',
        },
    ]);
}

function criarAppTeste(f: Fixture) {
    const app = express();
    app.use(requestId);
    app.use(express.json());

    // Contexto HTTP simulado. Os testes anteriores cobrem JWT e headers reais.
    app.use((req, _res, next) => {
        req.auth = {
            usuarioId: f.usuarioId,
            organizacaoId: f.organizacaoId,
            areaNegocioId: f.areaId,
            perfil: 'OPERADOR',
        };
        next();
    });

    app.patch('/sessoes-clinicas/:sessaoClinicaId', sessoesClinicasController.corrigir);
    app.use(errorHandler);
    return app;
}

async function historicos(tx: Knex.Transaction, sessaoId: string) {
    return tx('historico_correcoes_sessoes_clinicas')
        .select('campos_alterados', 'dados_anteriores', 'dados_novos', 'corrigido_por_usuario_id')
        .where('sessao_clinica_id', sessaoId);
}

async function textoAtual(tx: Knex.Transaction, sessaoId: string): Promise<string | null> {
    const registro = await tx('sessoes_clinicas').select('evolucao').where('id', sessaoId).first();
    assert.ok(registro);
    return registro.evolucao as string | null;
}

async function comRollback(executar: (tx: Knex.Transaction, f: Fixture) => Promise<void>) {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Exige NODE_ENV=test e AMBIENTE_BANCO=teste.');
    }
    const f = novosIds();
    const rollbackIntencional = new Error('ROLLBACK_INTENCIONAL_PATCH_HTTP');
    try {
        await connection.transaction(async (tx) => {
            await prepararDados(tx, f);

            const executarOriginal = sessoesClinicasRepository.executarEmTransacao;
            sessoesClinicasRepository.executarEmTransacao = async <T>(
                operacao: (trx: Knex.Transaction) => Promise<T>,
            ): Promise<T> => tx.transaction(operacao);
            try {
                await executar(tx, f);
            } finally {
                sessoesClinicasRepository.executarEmTransacao = executarOriginal;
            }

            throw rollbackIntencional;
        });
    } catch (error) {
        if (error !== rollbackIntencional) throw error;
    }
}

function prepararMocks(t: TestContext, f: Fixture) {
    // Somente o pré-check (fora da transação) é simulado.
    // O Service revalida a permissão com o PostgreSQL no savepoint.
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => ({
        profissionalId: f.profissionalId,
    }));
    return t.mock.method(auditoriaService, 'registrar', async () => undefined);
}

after(async () => {
    await connection.destroy();
});

test('PATCH legítimo grava correção e o texto anterior na mesma transação', async (t) => {
    await comRollback(async (tx, f) => {
        const auditoria = prepararMocks(t, f);
        const resposta = await request(criarAppTeste(f))
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_CORRIGIDO })
            .expect(200);

        assert.equal(resposta.body.data.evolucao, TEXTO_CORRIGIDO);
        assert.equal(await textoAtual(tx, f.sessaoId), TEXTO_CORRIGIDO);

        const versoes = await historicos(tx, f.sessaoId);
        assert.equal(versoes.length, 1);
        assert.deepEqual(versoes[0].campos_alterados, ['evolucao']);
        assert.equal(versoes[0].dados_anteriores.evolucao, TEXTO_ORIGINAL);
        assert.equal(versoes[0].dados_novos.evolucao, TEXTO_CORRIGIDO);
        assert.equal(versoes[0].corrigido_por_usuario_id, f.usuarioId);

        assert.equal(auditoria.mock.callCount(), 1);
        const dadosAuditoria = auditoria.mock.calls[0]?.arguments[0];
        assert.equal(dadosAuditoria?.acao, 'SESSAO_CLINICA.CORRIGIDA');
        assert.equal(JSON.stringify(dadosAuditoria).includes(TEXTO_CORRIGIDO), false);
        assert.equal(JSON.stringify(dadosAuditoria).includes(TEXTO_ORIGINAL), false);
    });
});

test('dois PATCHs legítimos preservam as versões intermediárias', async (t) => {
    await comRollback(async (tx, f) => {
        prepararMocks(t, f);
        const app = criarAppTeste(f);

        await request(app)
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_CORRIGIDO })
            .expect(200);
        await request(app)
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_FINAL })
            .expect(200);

        assert.equal(await textoAtual(tx, f.sessaoId), TEXTO_FINAL);
        const versoes = await historicos(tx, f.sessaoId);
        assert.equal(versoes.length, 2);

        const primeira = versoes.find((h) => h.dados_novos.evolucao === TEXTO_CORRIGIDO);
        const segunda = versoes.find((h) => h.dados_novos.evolucao === TEXTO_FINAL);
        assert.ok(primeira);
        assert.ok(segunda);
        assert.equal(primeira.dados_anteriores.evolucao, TEXTO_ORIGINAL);
        assert.equal(segunda.dados_anteriores.evolucao, TEXTO_CORRIGIDO);
    });
});

test('PATCH sem mudança retorna 400 e não gera histórico', async (t) => {
    await comRollback(async (tx, f) => {
        prepararMocks(t, f);
        const resposta = await request(criarAppTeste(f))
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_ORIGINAL })
            .expect(400);

        assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_SEM_ALTERACOES');
        assert.equal(await textoAtual(tx, f.sessaoId), TEXTO_ORIGINAL);
        assert.equal((await historicos(tx, f.sessaoId)).length, 0);
    });
});

test('falha ao gravar histórico desfaz a correção do prontuário', async (t) => {
    await comRollback(async (tx, f) => {
        const auditoria = prepararMocks(t, f);
        t.mock.method(sessoesClinicasRepository, 'registrarHistoricoCorrecao', async () => {
            throw new AppError('Falha de histórico simulada.', 503, 'HISTORICO_INDISPONIVEL');
        });

        const resposta = await request(criarAppTeste(f))
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_CORRIGIDO })
            .expect(503);

        assert.equal(resposta.body.codigo, 'HISTORICO_INDISPONIVEL');
        assert.equal(await textoAtual(tx, f.sessaoId), TEXTO_ORIGINAL);
        assert.equal((await historicos(tx, f.sessaoId)).length, 0);
        assert.equal(auditoria.mock.callCount(), 0);
    });
});

test('revogação clínica dentro da transação impede PATCH e histórico', async (t) => {
    await comRollback(async (tx, f) => {
        prepararMocks(t, f);
        await tx('profissionais_areas')
            .where({ profissional_id: f.profissionalId, area_negocio_id: f.areaId })
            .update({ acesso_clinico_autorizado: false });

        const resposta = await request(criarAppTeste(f))
            .patch(`/sessoes-clinicas/${f.sessaoId}`)
            .send({ evolucao: TEXTO_CORRIGIDO })
            .expect(403);

        assert.equal(resposta.body.codigo, 'ACESSO_CLINICO_NEGADO');
        assert.equal(await textoAtual(tx, f.sessaoId), TEXTO_ORIGINAL);
        assert.equal((await historicos(tx, f.sessaoId)).length, 0);
    });
});

test('SQL transacional impede PATCH em sessão de outro profissional', async (t) => {
    await comRollback(async (tx, f) => {
        prepararMocks(t, f);
        const resposta = await request(criarAppTeste(f))
            .patch(`/sessoes-clinicas/${f.sessaoOutroId}`)
            .send({ evolucao: TEXTO_CORRIGIDO })
            .expect(404);

        assert.equal(resposta.body.codigo, 'SESSAO_CLINICA_NAO_ENCONTRADA');
        assert.equal(await textoAtual(tx, f.sessaoOutroId), 'Registro de outro profissional.');
        assert.equal((await historicos(tx, f.sessaoOutroId)).length, 0);
    });
});
