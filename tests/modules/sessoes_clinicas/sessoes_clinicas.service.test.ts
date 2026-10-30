import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import connection from '../../../src/database/connection.js';
import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';
import sessoesClinicasService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.service.js';

const DATA_SESSAO = '2026-10-01T14:00:00Z';

type Fixture = {
    organizacaoId: string;
    areaId: string;
    usuarioId: string;
    clienteId: string;
    profissionalId: string;
    servicoId: string;
    agendamentoId: string;
};

function criarIds(): Fixture {
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

async function prepararFixture(transaction: Knex.Transaction, fixture: Fixture): Promise<void> {
    await transaction('organizacoes').insert({
        id: fixture.organizacaoId,
        nome: 'Organizacao Teste Service Clinico',
        ativo: true,
    });

    await transaction('areas_negocio').insert({
        id: fixture.areaId,
        organizacao_id: fixture.organizacaoId,
        nome: 'Fisioterapia Service',
        codigo: `FIS-SVC-${fixture.areaId.slice(0, 8)}`,
        ativo: true,
    });

    await transaction('usuarios').insert({
        id: fixture.usuarioId,
        nome: 'Usuario Clinico de Teste',
        email: `clinico-svc-${fixture.usuarioId}@teste.local`,
        senha_hash: 'hash-ficticio',
        ativo: true,
    });

    await transaction('clientes').insert({
        id: fixture.clienteId,
        organizacao_id: fixture.organizacaoId,
        nome: 'Paciente Clinico Ficticio',
        ativo: true,
    });

    await transaction('clientes_areas').insert({
        cliente_id: fixture.clienteId,
        area_negocio_id: fixture.areaId,
        ativo: true,
    });

    await transaction('profissionais').insert({
        id: fixture.profissionalId,
        organizacao_id: fixture.organizacaoId,
        usuario_id: fixture.usuarioId,
        nome: 'Profissional Clinico Ficticio',
        ativo: true,
    });

    await transaction('profissionais_areas').insert({
        profissional_id: fixture.profissionalId,
        area_negocio_id: fixture.areaId,
        ativo: true,
    });

    await transaction('servicos').insert({
        id: fixture.servicoId,
        organizacao_id: fixture.organizacaoId,
        area_negocio_id: fixture.areaId,
        nome: 'Consulta Fisioterapia',
        duracao_minutos: 60,
        ativo: true,
    });

    await transaction('agendamentos').insert({
        id: fixture.agendamentoId,
        organizacao_id: fixture.organizacaoId,
        area_negocio_id: fixture.areaId,
        cliente_id: fixture.clienteId,
        profissional_id: fixture.profissionalId,
        servico_id: fixture.servicoId,
        inicio_em: new Date(DATA_SESSAO),
        fim_em: new Date('2026-10-01T15:00:00Z'),
        status: 'CONCLUIDO',
    });
}

// O Service usa executarEmTransacao() internamente. Nos testes, usamos um
// savepoint dentro da transacao externa para manter o rollback verdadeiro.
// Assim, nenhum dado clinico de teste precisa ser apagado depois.
async function comFixture(
    executar: (transaction: Knex.Transaction, fixture: Fixture) => Promise<void>,
): Promise<void> {
    const fixture = criarIds();
    const rollbackIntencional = new Error('ROLLBACK_INTENCIONAL_SERVICE_TEST');

    try {
        await connection.transaction(async (transaction) => {
            await prepararFixture(transaction, fixture);

            const executarOriginal = sessoesClinicasRepository.executarEmTransacao;
            sessoesClinicasRepository.executarEmTransacao = async <T>(
                operacao: (tx: Knex.Transaction) => Promise<T>,
            ): Promise<T> => transaction.transaction(operacao);

            try {
                await executar(transaction, fixture);
            } finally {
                sessoesClinicasRepository.executarEmTransacao = executarOriginal;
            }

            throw rollbackIntencional;
        });
    } catch (error) {
        if (error !== rollbackIntencional) {
            throw error;
        }
    }
}

function dadosValidos(fixture: Fixture, vincularAgendamento = false) {
    return {
        cliente_id: fixture.clienteId,
        profissional_id: fixture.profissionalId,
        data_sessao: DATA_SESSAO,
        evolucao: 'Paciente realizou exercicios sem intercorrencias.',
        ...(vincularAgendamento && { agendamento_id: fixture.agendamentoId }),
    };
}

function verificarErro(codigo: string, statusCode: number) {
    return (error: unknown): boolean => {
        if (typeof error !== 'object' || error === null) {
            return false;
        }

        return (
            'code' in error &&
            error.code === codigo &&
            'statusCode' in error &&
            error.statusCode === statusCode
        );
    };
}

after(async () => {
    await connection.destroy();
});

test('Service cria sessao com cliente, profissional e agendamento validos', async () => {
    await comFixture(async (transaction, fixture) => {
        const sessao = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture, true),
        );

        assert.ok(sessao.id);
        assert.equal(sessao.cliente_id, fixture.clienteId);
        assert.equal(sessao.profissional_id, fixture.profissionalId);
        assert.equal(sessao.agendamento_id, fixture.agendamentoId);
        assert.equal(sessao.cliente_nome, 'Paciente Clinico Ficticio');

        const persistida = await transaction('sessoes_clinicas').where('id', sessao.id).first();

        assert.ok(persistida);
        assert.equal(persistida.organizacao_id, fixture.organizacaoId);
        assert.equal(persistida.area_negocio_id, fixture.areaId);
    });
});

test('Service permite registrar atendimentos avulsos distintos', async () => {
    await comFixture(async (transaction, fixture) => {
        const primeira = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture),
        );
        const segunda = await sessoesClinicasService.criar(fixture.organizacaoId, fixture.areaId, {
            ...dadosValidos(fixture),
            evolucao: 'Evolucao do segundo atendimento.',
        });

        assert.notEqual(primeira.id, segunda.id);
        assert.equal(primeira.agendamento_id, null);
        assert.equal(segunda.agendamento_id, null);

        const sessoes = await transaction('sessoes_clinicas').where({
            organizacao_id: fixture.organizacaoId,
            cliente_id: fixture.clienteId,
        });
        assert.equal(sessoes.length, 2);
    });
});

test('Service rejeita cliente de outra organizacao', async () => {
    await comFixture(async (transaction, fixture) => {
        const outraOrganizacaoId = crypto.randomUUID();
        const outroClienteId = crypto.randomUUID();

        await transaction('organizacoes').insert({
            id: outraOrganizacaoId,
            nome: 'Outra Organizacao de Teste',
            ativo: true,
        });
        await transaction('clientes').insert({
            id: outroClienteId,
            organizacao_id: outraOrganizacaoId,
            nome: 'Cliente de Outro Tenant',
            ativo: true,
        });

        await assert.rejects(
            sessoesClinicasService.criar(fixture.organizacaoId, fixture.areaId, {
                ...dadosValidos(fixture),
                cliente_id: outroClienteId,
            }),
            verificarErro('CLIENTE_NAO_DISPONIVEL', 404),
        );
    });
});

test('Service rejeita profissional sem vinculo ativo com a area', async () => {
    await comFixture(async (transaction, fixture) => {
        await transaction('profissionais_areas')
            .where({ profissional_id: fixture.profissionalId, area_negocio_id: fixture.areaId })
            .update({ ativo: false });

        await assert.rejects(
            sessoesClinicasService.criar(
                fixture.organizacaoId,
                fixture.areaId,
                dadosValidos(fixture),
            ),
            verificarErro('PROFISSIONAL_NAO_DISPONIVEL', 404),
        );
    });
});

test('Service rejeita agendamento cancelado', async () => {
    await comFixture(async (transaction, fixture) => {
        await transaction('agendamentos')
            .where('id', fixture.agendamentoId)
            .update({ status: 'CANCELADO' });

        await assert.rejects(
            sessoesClinicasService.criar(
                fixture.organizacaoId,
                fixture.areaId,
                dadosValidos(fixture, true),
            ),
            verificarErro('AGENDAMENTO_CANCELADO', 409),
        );
    });
});

test('Service rejeita agendamento com cliente divergente', async () => {
    await comFixture(async (transaction, fixture) => {
        const outroClienteId = crypto.randomUUID();
        await transaction('clientes').insert({
            id: outroClienteId,
            organizacao_id: fixture.organizacaoId,
            nome: 'Outro Cliente da Mesma Organizacao',
            ativo: true,
        });
        await transaction('agendamentos')
            .where('id', fixture.agendamentoId)
            .update({ cliente_id: outroClienteId });

        await assert.rejects(
            sessoesClinicasService.criar(
                fixture.organizacaoId,
                fixture.areaId,
                dadosValidos(fixture, true),
            ),
            verificarErro('AGENDAMENTO_DADOS_DIVERGENTES', 409),
        );
    });
});

test('Service retorna 409 quando o agendamento ja possui sessao', async () => {
    await comFixture(async (_transaction, fixture) => {
        await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture, true),
        );

        await assert.rejects(
            sessoesClinicasService.criar(
                fixture.organizacaoId,
                fixture.areaId,
                dadosValidos(fixture, true),
            ),
            verificarErro('SESSAO_CLINICA_AGENDAMENTO_DUPLICADO', 409),
        );
    });
});

test('Service rejeita uma sessao com data futura', async () => {
    await comFixture(async (_transaction, fixture) => {
        await assert.rejects(
            sessoesClinicasService.criar(fixture.organizacaoId, fixture.areaId, {
                ...dadosValidos(fixture),
                data_sessao: '2999-01-01T10:00:00Z',
            }),
            verificarErro('DATA_SESSAO_FUTURA', 400),
        );
    });
});

test('Service corrige a evolucao e registra valores anteriores e novos', async () => {
    await comFixture(async (transaction, fixture) => {
        const sessao = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture),
        );

        const resultado = await sessoesClinicasService.corrigir(
            fixture.organizacaoId,
            fixture.areaId,
            fixture.usuarioId,
            sessao.id,
            { evolucao: 'Paciente apresentou melhora da mobilidade.' },
        );

        assert.deepEqual(resultado.camposAlterados, ['evolucao']);
        assert.equal(resultado.sessao.evolucao, 'Paciente apresentou melhora da mobilidade.');

        const historico = await transaction('historico_correcoes_sessoes_clinicas')
            .where('sessao_clinica_id', sessao.id)
            .first();

        assert.ok(historico);
        assert.deepEqual(historico.campos_alterados, ['evolucao']);
        assert.equal(
            historico.dados_anteriores.evolucao,
            'Paciente realizou exercicios sem intercorrencias.',
        );
        assert.equal(historico.dados_novos.evolucao, 'Paciente apresentou melhora da mobilidade.');
        assert.equal(historico.corrigido_por_usuario_id, fixture.usuarioId);
    });
});

test('Service preserva duas correcoes distintas em ordem cronologica', async () => {
    await comFixture(async (transaction, fixture) => {
        const sessao = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture),
        );

        await sessoesClinicasService.corrigir(
            fixture.organizacaoId,
            fixture.areaId,
            fixture.usuarioId,
            sessao.id,
            { evolucao: 'Primeira correcao.' },
        );
        await sessoesClinicasService.corrigir(
            fixture.organizacaoId,
            fixture.areaId,
            fixture.usuarioId,
            sessao.id,
            { evolucao: 'Segunda correcao.' },
        );

        const historicos = await transaction('historico_correcoes_sessoes_clinicas')
            .where('sessao_clinica_id', sessao.id)
            .orderBy('criado_em', 'asc')
            .orderBy('id', 'asc');

        assert.equal(historicos.length, 2);
        assert.deepEqual(
            historicos.map((registro) => registro.dados_novos.evolucao).sort(),
            ['Primeira correcao.', 'Segunda correcao.'].sort(),
        );
        // NOW() usa o inicio da transacao: duas correcoes podem ter o mesmo
        // criado_em. Nao presumimos que o UUID defina a ordem cronologica.
        const segundaCorrecao = historicos.find(
            (registro) => registro.dados_novos.evolucao === 'Segunda correcao.',
        );
        assert.ok(segundaCorrecao);
        assert.equal(segundaCorrecao.dados_anteriores.evolucao, 'Primeira correcao.');

        const atual = await transaction('sessoes_clinicas').where('id', sessao.id).first();
        assert.equal(atual.evolucao, 'Segunda correcao.');
    });
});

test('Service aceita limpar campo nullable e preserva o valor anterior', async () => {
    await comFixture(async (transaction, fixture) => {
        const sessao = await sessoesClinicasService.criar(fixture.organizacaoId, fixture.areaId, {
            ...dadosValidos(fixture),
            prognostico: 'Prognostico anterior.',
        });

        await sessoesClinicasService.corrigir(
            fixture.organizacaoId,
            fixture.areaId,
            fixture.usuarioId,
            sessao.id,
            { prognostico: null },
        );

        const historico = await transaction('historico_correcoes_sessoes_clinicas')
            .where('sessao_clinica_id', sessao.id)
            .first();
        assert.ok(historico);
        assert.equal(historico.dados_anteriores.prognostico, 'Prognostico anterior.');
        assert.equal(historico.dados_novos.prognostico, null);

        const sessaoAtual = await transaction('sessoes_clinicas').where('id', sessao.id).first();
        assert.equal(sessaoAtual.prognostico, null);
    });
});

test('Service nao gera historico quando o conteudo nao mudou', async () => {
    await comFixture(async (transaction, fixture) => {
        const dados = dadosValidos(fixture);
        const sessao = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dados,
        );

        await assert.rejects(
            sessoesClinicasService.corrigir(
                fixture.organizacaoId,
                fixture.areaId,
                fixture.usuarioId,
                sessao.id,
                { evolucao: dados.evolucao },
            ),
            verificarErro('SESSAO_CLINICA_SEM_ALTERACOES', 400),
        );

        const historicos = await transaction('historico_correcoes_sessoes_clinicas').where(
            'sessao_clinica_id',
            sessao.id,
        );
        assert.equal(historicos.length, 0);
    });
});

test('falha ao salvar o historico reverte a alteracao clinica no savepoint', async () => {
    await comFixture(async (transaction, fixture) => {
        const sessao = await sessoesClinicasService.criar(
            fixture.organizacaoId,
            fixture.areaId,
            dadosValidos(fixture),
        );

        const registrarOriginal = sessoesClinicasRepository.registrarHistoricoCorrecao;
        sessoesClinicasRepository.registrarHistoricoCorrecao = async () => {
            throw new Error('FALHA_SIMULADA_HISTORICO');
        };

        try {
            await assert.rejects(
                sessoesClinicasService.corrigir(
                    fixture.organizacaoId,
                    fixture.areaId,
                    fixture.usuarioId,
                    sessao.id,
                    { evolucao: 'Correcao que deve ser revertida.' },
                ),
                /FALHA_SIMULADA_HISTORICO/,
            );
        } finally {
            sessoesClinicasRepository.registrarHistoricoCorrecao = registrarOriginal;
        }

        const persistida = await transaction('sessoes_clinicas').where('id', sessao.id).first();
        assert.equal(persistida.evolucao, 'Paciente realizou exercicios sem intercorrencias.');
        assert.equal(persistida.corrigido_em, null);

        const historicos = await transaction('historico_correcoes_sessoes_clinicas').where(
            'sessao_clinica_id',
            sessao.id,
        );
        assert.equal(historicos.length, 0);
    });
});
