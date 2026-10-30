import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import connection from '../../../src/database/connection.js';
import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';

type DadosFixture = {
    organizacaoId: string;
    areaId: string;
    usuarioId: string;
    clienteId: string;
    profissionalId: string;
    servicoId: string;
    agendamentoId: string;
};

function novosIds(): DadosFixture {
    return {
        organizacaoId: crypto.randomUUID(),
        areaId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        clienteId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        servicoId: crypto.randomUUID(),
        agendamentoId: crypto.randomUUID(),
    };
}

async function prepararFixture(transaction: Knex.Transaction, ids: DadosFixture) {
    await transaction('organizacoes').insert({
        id: ids.organizacaoId,
        nome: 'Clínica de Teste',
        ativo: true,
    });

    await transaction('areas_negocio').insert({
        id: ids.areaId,
        organizacao_id: ids.organizacaoId,
        nome: 'Fisioterapia Teste',
        codigo: `FIS-${ids.areaId.slice(0, 8)}`,
        ativo: true,
    });

    await transaction('usuarios').insert({
        id: ids.usuarioId,
        nome: 'Profissional de Teste',
        email: `clinico-${ids.usuarioId}@teste.local`,
        senha_hash: 'hash-ficticio',
        ativo: true,
    });

    await transaction('clientes').insert({
        id: ids.clienteId,
        organizacao_id: ids.organizacaoId,
        nome: 'Paciente Fictício',
        ativo: true,
    });

    await transaction('clientes_areas').insert({
        cliente_id: ids.clienteId,
        area_negocio_id: ids.areaId,
        ativo: true,
    });

    await transaction('profissionais').insert({
        id: ids.profissionalId,
        organizacao_id: ids.organizacaoId,
        usuario_id: ids.usuarioId,
        nome: 'Fisioterapeuta de Teste',
        ativo: true,
    });

    await transaction('profissionais_areas').insert({
        profissional_id: ids.profissionalId,
        area_negocio_id: ids.areaId,
        ativo: true,
    });

    await transaction('servicos').insert({
        id: ids.servicoId,
        organizacao_id: ids.organizacaoId,
        area_negocio_id: ids.areaId,
        nome: 'Sessão de Fisioterapia',
        duracao_minutos: 60,
        ativo: true,
    });

    await transaction('agendamentos').insert({
        id: ids.agendamentoId,
        organizacao_id: ids.organizacaoId,
        area_negocio_id: ids.areaId,
        cliente_id: ids.clienteId,
        profissional_id: ids.profissionalId,
        servico_id: ids.servicoId,
        inicio_em: new Date('2026-10-01T14:00:00Z'),
        fim_em: new Date('2026-10-01T15:00:00Z'),
        status: 'CONCLUIDO',
    });
}

// Tudo que for criado durante um teste será revertido.
async function executarComRollback(
    operacao: (transaction: Knex.Transaction, ids: DadosFixture) => Promise<void>,
) {
    const rollbackIntencional = new Error('ROLLBACK_INTENCIONAL_TESTE');

    const ids = novosIds();

    try {
        await connection.transaction(async (transaction) => {
            await prepararFixture(transaction, ids);
            await operacao(transaction, ids);

            // Impede que dados fictícios sejam confirmados no banco.
            throw rollbackIntencional;
        });
    } catch (error) {
        if (error !== rollbackIntencional) {
            throw error;
        }
    }
}

async function criarSessao(
    transaction: Knex.Transaction,
    ids: DadosFixture,
    evolucao = 'Evolução inicial do paciente.',
    comAgendamento = false,
) {
    return sessoesClinicasRepository.criar(
        ids.organizacaoId,
        ids.areaId,
        {
            cliente_id: ids.clienteId,
            profissional_id: ids.profissionalId,
            data_sessao: new Date('2026-10-01T14:00:00Z'),
            evolucao,
            ...(comAgendamento && {
                agendamento_id: ids.agendamentoId,
            }),
        },
        transaction,
    );
}

async function criarRegistroHistorico(transaction: Knex.Transaction, ids: DadosFixture) {
    const sessaoId = await criarSessao(transaction, ids);

    await sessoesClinicasRepository.registrarHistoricoCorrecao(
        sessaoId,
        ids.usuarioId,
        ['evolucao'],
        { evolucao: 'Texto original.' },
        { evolucao: 'Texto corrigido.' },
        transaction,
    );

    const registro = await transaction('historico_correcoes_sessoes_clinicas')
        .select('id')
        .where('sessao_clinica_id', sessaoId)
        .first();

    assert.ok(registro);

    return registro.id as string;
}

after(async () => {
    await connection.destroy();
});

test('cada atendimento deve gerar uma sessão independente', async () => {
    await executarComRollback(async (transaction, ids) => {
        const primeiraId = await criarSessao(
            transaction,
            ids,
            'Paciente apresentou dor moderada.',
            true,
        );

        const segundaId = await criarSessao(
            transaction,
            ids,
            'Paciente apresentou melhora da mobilidade.',
        );

        assert.notEqual(primeiraId, segundaId);

        const primeira = await sessoesClinicasRepository.buscarPorId(
            ids.organizacaoId,
            ids.areaId,
            primeiraId,
            transaction,
        );

        const segunda = await sessoesClinicasRepository.buscarPorId(
            ids.organizacaoId,
            ids.areaId,
            segundaId,
            transaction,
        );

        assert.ok(primeira);
        assert.ok(segunda);

        assert.equal(primeira.evolucao, 'Paciente apresentou dor moderada.');

        assert.equal(segunda.evolucao, 'Paciente apresentou melhora da mobilidade.');

        // O acesso por outra organização não deve encontrar a sessão.
        const outraOrganizacao = await sessoesClinicasRepository.buscarPorId(
            crypto.randomUUID(),
            ids.areaId,
            primeiraId,
            transaction,
        );

        assert.equal(outraOrganizacao, undefined);
    });
});

test('mesmo agendamento não pode gerar duas sessões ativas', async () => {
    await executarComRollback(async (transaction, ids) => {
        await criarSessao(transaction, ids, 'Primeiro registro.', true);

        await assert.rejects(
            criarSessao(transaction, ids, 'Tentativa de duplicação.', true),
            (error: unknown) => {
                const erro = error as { code?: string };

                return erro.code === '23505';
            },
        );
    });
});

test('duas correções devem preservar seus históricos', async () => {
    await executarComRollback(async (transaction, ids) => {
        const sessaoId = await criarSessao(transaction, ids, 'Paciente apresentou dor intensa.');

        // Primeira correção.
        await sessoesClinicasRepository.corrigir(
            ids.organizacaoId,
            ids.areaId,
            sessaoId,
            ids.usuarioId,
            {
                evolucao: 'Paciente apresentou dor moderada.',
            },
            transaction,
        );

        await sessoesClinicasRepository.registrarHistoricoCorrecao(
            sessaoId,
            ids.usuarioId,
            ['evolucao'],
            { evolucao: 'Paciente apresentou dor intensa.' },
            { evolucao: 'Paciente apresentou dor moderada.' },
            transaction,
        );

        // Segunda correção.
        await sessoesClinicasRepository.corrigir(
            ids.organizacaoId,
            ids.areaId,
            sessaoId,
            ids.usuarioId,
            {
                evolucao: 'Paciente apresentou dor leve.',
            },
            transaction,
        );

        await sessoesClinicasRepository.registrarHistoricoCorrecao(
            sessaoId,
            ids.usuarioId,
            ['evolucao'],
            { evolucao: 'Paciente apresentou dor moderada.' },
            { evolucao: 'Paciente apresentou dor leve.' },
            transaction,
        );

        const sessao = await sessoesClinicasRepository.buscarPorId(
            ids.organizacaoId,
            ids.areaId,
            sessaoId,
            transaction,
        );

        assert.equal(sessao?.evolucao, 'Paciente apresentou dor leve.');

        const historico = await transaction('historico_correcoes_sessoes_clinicas')
            .select('dados_anteriores', 'dados_novos', 'corrigido_por_usuario_id')
            .where('sessao_clinica_id', sessaoId);

        assert.equal(historico.length, 2);

        const primeiraCorrecao = historico.find(
            (item) => item.dados_anteriores.evolucao === 'Paciente apresentou dor intensa.',
        );

        const segundaCorrecao = historico.find(
            (item) => item.dados_anteriores.evolucao === 'Paciente apresentou dor moderada.',
        );

        assert.ok(primeiraCorrecao);
        assert.ok(segundaCorrecao);

        assert.equal(primeiraCorrecao.dados_novos.evolucao, 'Paciente apresentou dor moderada.');

        assert.equal(segundaCorrecao.dados_novos.evolucao, 'Paciente apresentou dor leve.');

        assert.equal(segundaCorrecao.corrigido_por_usuario_id, ids.usuarioId);
    });
});

test('histórico clínico não pode ser alterado', async () => {
    await executarComRollback(async (transaction, ids) => {
        const historicoId = await criarRegistroHistorico(transaction, ids);

        await assert.rejects(
            transaction('historico_correcoes_sessoes_clinicas')
                .where('id', historicoId)
                .update({
                    dados_novos: JSON.stringify({
                        evolucao: 'Alteração indevida.',
                    }),
                }),
            (error: unknown) => {
                const erro = error as { code?: string };

                return erro.code === 'P0001';
            },
        );
    });
});

test('histórico clínico não pode ser excluído', async () => {
    await executarComRollback(async (transaction, ids) => {
        const historicoId = await criarRegistroHistorico(transaction, ids);

        await assert.rejects(
            transaction('historico_correcoes_sessoes_clinicas').where('id', historicoId).del(),
            (error: unknown) => {
                const erro = error as { code?: string };

                return erro.code === 'P0001';
            },
        );
    });
});
