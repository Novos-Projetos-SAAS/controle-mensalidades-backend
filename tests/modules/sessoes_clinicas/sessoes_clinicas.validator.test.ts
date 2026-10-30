import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
    validarAtualizacaoSessaoClinica,
    validarCriacaoSessaoClinica,
    validarFiltrosSessoesClinicas,
    validarSessaoClinicaId,
} from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.validator.js';

const clienteId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();

function verificarErro(codigo: string) {
    return (error: unknown): boolean => {
        return (
            typeof error === 'object' && error !== null && 'code' in error && error.code === codigo
        );
    };
}

test('Validator aceita sessao com data e fuso e remove espacos do texto', () => {
    const dados = validarCriacaoSessaoClinica({
        cliente_id: clienteId,
        profissional_id: profissionalId,
        data_sessao: '2026-10-01T14:00:00-03:00',
        evolucao: '  Paciente apresentou melhora.  ',
    });

    assert.equal(dados.evolucao, 'Paciente apresentou melhora.');
    assert.equal(dados.cliente_id, clienteId);
});

test('Validator rejeita dados desconhecidos e data sem fuso', () => {
    const base = {
        cliente_id: clienteId,
        profissional_id: profissionalId,
        data_sessao: '2026-10-01T14:00:00-03:00',
        evolucao: 'Evolucao valida.',
    };

    for (const invalido of [
        { ...base, organizacao_id: crypto.randomUUID() },
        { ...base, data_sessao: '2026-10-01T14:00:00' },
        { ...base, evolucao: '   ' },
        { ...base, cliente_id: 'id-invalido' },
    ]) {
        assert.throws(
            () => validarCriacaoSessaoClinica(invalido),
            verificarErro('DADOS_SESSAO_CLINICA_INVALIDOS'),
        );
    }
});

test('Validator exige ao menos um campo para correcao', () => {
    assert.throws(
        () => validarAtualizacaoSessaoClinica({}),
        verificarErro('DADOS_SESSAO_CLINICA_INVALIDOS'),
    );
});

test('Validator permite limpar prognostico, mas nao a evolucao', () => {
    const dados = validarAtualizacaoSessaoClinica({ prognostico: null });
    assert.equal(dados.prognostico, null);

    assert.throws(
        () => validarAtualizacaoSessaoClinica({ evolucao: null }),
        verificarErro('DADOS_SESSAO_CLINICA_INVALIDOS'),
    );
});

test('Validator rejeita filtros com periodo invertido ou campo desconhecido', () => {
    const base = {
        inicio: '2026-10-01T00:00:00Z',
        fim: '2026-10-31T00:00:00Z',
    };

    assert.deepEqual(validarFiltrosSessoesClinicas(base), base);

    for (const invalido of [
        { ...base, inicio: '2026-11-01T00:00:00Z' },
        { ...base, desconhecido: true },
    ]) {
        assert.throws(
            () => validarFiltrosSessoesClinicas(invalido),
            verificarErro('FILTROS_SESSOES_CLINICAS_INVALIDOS'),
        );
    }
});

test('Validator rejeita ID de sessao clinica invalido', () => {
    assert.equal(validarSessaoClinicaId(clienteId), clienteId);
    assert.throws(
        () => validarSessaoClinicaId('nao-e-uuid'),
        verificarErro('SESSAO_CLINICA_ID_INVALIDO'),
    );
});
