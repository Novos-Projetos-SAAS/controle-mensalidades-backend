import assert from 'node:assert/strict';
import test from 'node:test';

import {
    validarAtualizacaoCliente,
    validarCriacaoCliente,
} from '../../../src/modules/clientes/clientes.validator.js';

test('validador aceita CPF matematicamente válido formatado e normaliza dígitos', () => {
    const cliente = validarCriacaoCliente({
        nome: 'Cliente Exemplo',
        cpf: '529.982.247-25',
        areas: ['11111111-1111-4111-8111-111111111111'],
    });
    assert.equal(cliente.cpf, '52998224725');
    const alterado = validarAtualizacaoCliente({ cpf: '111.444.777-35' });
    assert.equal(alterado.cpf, '11144477735');
});

test('validador rejeita CPF de 11 dígitos com dígitos verificadores incorretos', () => {
    for (const cpf of ['529.982.247-26', '111.111.111-11', '12345678901']) {
        assert.throws(
            () => validarCriacaoCliente({
                nome: 'Cliente Exemplo',
                cpf,
                areas: ['11111111-1111-4111-8111-111111111111'],
            }),
            (error: unknown) => typeof error === 'object' && error !== null &&
                'code' in error && error.code === 'DADOS_CLIENTE_INVALIDOS',
        );
        assert.throws(
            () => validarAtualizacaoCliente({ cpf }),
            (error: unknown) => typeof error === 'object' && error !== null &&
                'code' in error && error.code === 'DADOS_CLIENTE_INVALIDOS',
        );
    }
    assert.equal(validarAtualizacaoCliente({ cpf: null }).cpf, null);
});
