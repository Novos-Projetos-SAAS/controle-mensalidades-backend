import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

import profissionaisRepository from '../../../src/modules/profissionais/profissionais.repository.js';

import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';

// ============================================================
// TIPOS E IDENTIFICADORES
// ============================================================

type Fixture = {
    organizacaoId: string;
    outraOrganizacaoId: string;
    area1Id: string;
    area2Id: string;
    outraAreaId: string;
    usuarioId: string;
    outroUsuarioId: string;
    profissionalId: string;
    outroProfissionalId: string;
};

function novaFixture(): Fixture {
    return {
        organizacaoId: crypto.randomUUID(),
        outraOrganizacaoId: crypto.randomUUID(),
        area1Id: crypto.randomUUID(),
        area2Id: crypto.randomUUID(),
        outraAreaId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        outroUsuarioId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        outroProfissionalId: crypto.randomUUID(),
    };
}

// ============================================================
// PREPARAÇÃO DOS DADOS FICTÍCIOS
// ============================================================

async function preparar(tx: Knex.Transaction, f: Fixture) {
    await tx('organizacoes').insert([
        {
            id: f.organizacaoId,
            nome: 'Clínica Revogação A',
            ativo: true,
        },
        {
            id: f.outraOrganizacaoId,
            nome: 'Clínica Revogação B',
            ativo: true,
        },
    ]);

    await tx('areas_negocio').insert([
        {
            id: f.area1Id,
            organizacao_id: f.organizacaoId,
            nome: 'Fisioterapia A1',
            codigo: `RV1-${f.area1Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: f.area2Id,
            organizacao_id: f.organizacaoId,
            nome: 'Pilates A2',
            codigo: `RV2-${f.area2Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: f.outraAreaId,
            organizacao_id: f.outraOrganizacaoId,
            nome: 'Fisioterapia B',
            codigo: `RVB-${f.outraAreaId.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    await tx('usuarios').insert([
        {
            id: f.usuarioId,
            nome: 'Profissional A',
            email: `rev-a-${f.usuarioId}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        },
        {
            id: f.outroUsuarioId,
            nome: 'Profissional B',
            email: `rev-b-${f.outroUsuarioId}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        },
    ]);

    await tx('usuarios_organizacoes').insert([
        {
            usuario_id: f.usuarioId,
            organizacao_id: f.organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
        {
            usuario_id: f.outroUsuarioId,
            organizacao_id: f.outraOrganizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await tx('profissionais').insert([
        {
            id: f.profissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.usuarioId,
            nome: 'Profissional Titular A',
            ativo: true,
        },
        {
            id: f.outroProfissionalId,
            organizacao_id: f.outraOrganizacaoId,
            usuario_id: f.outroUsuarioId,
            nome: 'Profissional Titular B',
            ativo: true,
        },
    ]);

    await tx('profissionais_areas').insert([
        {
            profissional_id: f.profissionalId,
            area_negocio_id: f.area1Id,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: f.profissionalId,
            area_negocio_id: f.area2Id,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: f.outroProfissionalId,
            area_negocio_id: f.outraAreaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);
}

// ============================================================
// ISOLAMENTO COM ROLLBACK
// ============================================================

async function comFixture(operacao: (tx: Knex.Transaction, f: Fixture) => Promise<void>) {
    if (env.NODE_ENV !== 'test') {
        throw new Error('Execute somente com NODE_ENV=test e .env.test.');
    }

    const f = novaFixture();

    const rollbackIntencional = new Error('ROLLBACK_INTENCIONAL_REVOGACAO_CLINICA');

    try {
        await connection.transaction(async (tx) => {
            await preparar(tx, f);

            await operacao(tx, f);

            // Nenhuma alteração de teste será confirmada.
            throw rollbackIntencional;
        });
    } catch (erro) {
        if (erro !== rollbackIntencional) {
            throw erro;
        }
    }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

async function estadoDaArea(tx: Knex.Transaction, profissionalId: string, areaNegocioId: string) {
    return tx('profissionais_areas')
        .select('ativo', 'acesso_clinico_autorizado', 'deletado_em')
        .where({
            profissional_id: profissionalId,
            area_negocio_id: areaNegocioId,
        })
        .first();
}

async function exigirAcessoNegado(tx: Knex.Transaction, f: Fixture, areaId: string) {
    await assert.rejects(
        autorizacaoClinicaService.identificarProfissional(f.usuarioId, f.organizacaoId, areaId, tx),
        (erro: unknown) =>
            typeof erro === 'object' &&
            erro !== null &&
            'statusCode' in erro &&
            erro.statusCode === 403 &&
            'code' in erro &&
            erro.code === 'ACESSO_CLINICO_NEGADO',
    );
}

after(async () => {
    await connection.destroy();
});

// ============================================================
// TESTE 1 — PRESERVAR PERMISSÕES VÁLIDAS
// ============================================================

test('atualização sem mudanças preserva autorizações clínicas', async () => {
    await comFixture(async (tx, f) => {
        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id, f.area2Id],
            tx,
        );

        for (const areaId of [f.area1Id, f.area2Id]) {
            const vinculo = await estadoDaArea(tx, f.profissionalId, areaId);

            assert.equal(vinculo?.ativo, true);

            assert.equal(vinculo?.acesso_clinico_autorizado, true);
        }
    });
});

// ============================================================
// TESTE 2 — REMOVER ÁREA REVOKA PERMISSÃO
// ============================================================

test('remover área revoga acesso clínico apenas naquela área', async () => {
    await comFixture(async (tx, f) => {
        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id],
            tx,
        );

        const areaPreservada = await estadoDaArea(tx, f.profissionalId, f.area1Id);

        const areaRemovida = await estadoDaArea(tx, f.profissionalId, f.area2Id);

        assert.equal(areaPreservada?.ativo, true);

        assert.equal(areaPreservada?.acesso_clinico_autorizado, true);

        assert.equal(areaRemovida?.ativo, false);

        assert.equal(areaRemovida?.acesso_clinico_autorizado, false);

        await exigirAcessoNegado(tx, f, f.area2Id);
    });
});

// ============================================================
// TESTE 3 — REATIVAR ÁREA NÃO RECUPERA ACESSO
// ============================================================

test('recolocar área não restaura automaticamente acesso clínico', async () => {
    await comFixture(async (tx, f) => {
        // Remove a segunda área.
        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id],
            tx,
        );

        // Adiciona a segunda área novamente.
        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id, f.area2Id],
            tx,
        );

        const reativada = await estadoDaArea(tx, f.profissionalId, f.area2Id);

        assert.equal(reativada?.ativo, true);

        assert.equal(reativada?.acesso_clinico_autorizado, false);

        await exigirAcessoNegado(tx, f, f.area2Id);

        // A primeira área continua autorizada.
        const identidade = await autorizacaoClinicaService.identificarProfissional(
            f.usuarioId,
            f.organizacaoId,
            f.area1Id,
            tx,
        );

        assert.equal(identidade.profissionalId, f.profissionalId);
    });
});

// ============================================================
// TESTE 4 — VÍNCULO DELETADO NÃO RECUPERA ACESSO
// ============================================================

test('vínculo deletado não recupera autorização ao ser restaurado', async () => {
    await comFixture(async (tx, f) => {
        await tx('profissionais_areas')
            .where({
                profissional_id: f.profissionalId,
                area_negocio_id: f.area2Id,
            })
            .update({
                deletado_em: new Date(),
                ativo: true,
                acesso_clinico_autorizado: true,
            });

        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id, f.area2Id],
            tx,
        );

        const vinculo = await estadoDaArea(tx, f.profissionalId, f.area2Id);

        assert.equal(vinculo?.deletado_em, null);
        assert.equal(vinculo?.ativo, true);

        assert.equal(vinculo?.acesso_clinico_autorizado, false);
    });
});

// ============================================================
// TESTE 5 — INATIVAR E REATIVAR PROFISSIONAL
// ============================================================

test('reativar profissional não restaura permissões clínicas', async () => {
    await comFixture(async (tx, f) => {
        await profissionaisRepository.inativarProfissional(f.organizacaoId, f.profissionalId, tx);

        for (const areaId of [f.area1Id, f.area2Id]) {
            const vinculo = await estadoDaArea(tx, f.profissionalId, areaId);

            assert.equal(vinculo?.acesso_clinico_autorizado, false);
        }

        await profissionaisRepository.reativarProfissional(f.organizacaoId, f.profissionalId, tx);

        const profissional = await tx('profissionais')
            .select('ativo')
            .where('id', f.profissionalId)
            .first();

        assert.equal(profissional?.ativo, true);

        await exigirAcessoNegado(tx, f, f.area1Id);

        await exigirAcessoNegado(tx, f, f.area2Id);
    });
});

// ============================================================
// TESTE 6 — NOVA ÁREA SEM ACESSO CLÍNICO
// ============================================================

test('nova área vinculada começa sem autorização clínica', async () => {
    await comFixture(async (tx, f) => {
        const novaAreaId = crypto.randomUUID();

        await tx('areas_negocio').insert({
            id: novaAreaId,
            organizacao_id: f.organizacaoId,
            nome: 'Nova Área de Fisioterapia',
            codigo: `RVN-${novaAreaId.slice(0, 8)}`,
            ativo: true,
        });

        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id, f.area2Id, novaAreaId],
            tx,
        );

        const novoVinculo = await estadoDaArea(tx, f.profissionalId, novaAreaId);

        assert.equal(novoVinculo?.ativo, true);

        assert.equal(novoVinculo?.acesso_clinico_autorizado, false);

        await exigirAcessoNegado(tx, f, novaAreaId);
    });
});

// ============================================================
// TESTE 7 — ISOLAMENTO ENTRE ORGANIZAÇÕES
// ============================================================

test('sincronizar áreas não revoga acesso de outra organização', async () => {
    await comFixture(async (tx, f) => {
        await profissionaisRepository.sincronizarAreas(
            f.organizacaoId,
            f.profissionalId,
            [f.area1Id],
            tx,
        );

        const outroVinculo = await estadoDaArea(tx, f.outroProfissionalId, f.outraAreaId);

        assert.equal(outroVinculo?.ativo, true);

        assert.equal(outroVinculo?.acesso_clinico_autorizado, true);
    });
});

// ============================================================
// TESTE 8 — ROLLBACK TRANSACIONAL
// ============================================================

test('falha transacional desfaz revogações parciais', async () => {
    await comFixture(async (tx, f) => {
        const falhaSimulada = new Error('FALHA_SIMULADA');

        await assert.rejects(
            tx.transaction(async (subtransacao) => {
                await profissionaisRepository.sincronizarAreas(
                    f.organizacaoId,
                    f.profissionalId,
                    [f.area1Id],
                    subtransacao,
                );

                // Simula uma falha após revogar a permissão.
                throw falhaSimulada;
            }),
            (erro: unknown) => erro === falhaSimulada,
        );

        // O rollback deve restaurar o estado anterior.
        const vinculo = await estadoDaArea(tx, f.profissionalId, f.area2Id);

        assert.equal(vinculo?.ativo, true);

        assert.equal(vinculo?.acesso_clinico_autorizado, true);
    });
});
