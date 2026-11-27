import assert from 'node:assert/strict';
import test from 'node:test';
import { montarClienteCheckout } from '../../../src/modules/pagamentos/cliente-checkout.js';

test('normaliza os dados permitidos e não compartilha CPF ou informações clínicas', () => {
    const input = {
        nome: '  Maria   de Souza  ',
        email: ' CLIENTE+PAGAMENTO@EXAMPLE.COM ',
        telefone: '(11) 99999-9999',
        cpf: '00000000000',
        observacao: 'informação clínica',
    };
    assert.deepEqual(montarClienteCheckout(input), {
        name: 'Maria de Souza',
        email: 'cliente+pagamento@example.com',
        phone_number: '+5511999999999',
    });
});

test('omite contatos ausentes ou inválidos sem bloquear o nome válido', () => {
    for (const input of [
        { nome: 'Cliente Teste' },
        { nome: 'Cliente Teste', email: null, telefone: null },
        { nome: 'Cliente Teste', email: 'não é email', telefone: '99999999' },
        {
            nome: 'Cliente Teste',
            email: 'a@example.com\r\nBcc: b@example.com',
            telefone: 'ramal 11999999999',
        },
    ])
        assert.deepEqual(montarClienteCheckout(input), { name: 'Cliente Teste' });
});

test('omite customer quando não há campos válidos e aceita contato sem nome', () => {
    assert.equal(montarClienteCheckout(undefined), undefined);
    assert.equal(montarClienteCheckout({ nome: ' ', email: '', telefone: '' }), undefined);
    assert.equal(
        montarClienteCheckout({ nome: null, email: {}, telefone: 11999999999 }),
        undefined,
    );
    assert.deepEqual(montarClienteCheckout({ nome: '', email: ' cliente@example.com ' }), {
        email: 'cliente@example.com',
    });
});

test('normaliza telefone brasileiro com DDD e país sem inventar DDD', () => {
    for (const telefone of ['11999999999', '5511999999999', '+55 (11) 99999-9999']) {
        assert.deepEqual(montarClienteCheckout({ telefone }), { phone_number: '+5511999999999' });
    }
    assert.deepEqual(montarClienteCheckout({ telefone: '(11) 3333-4444' }), {
        phone_number: '+551133334444',
    });
});

test('preserva telefone internacional explícito e rejeita formatos inválidos', () => {
    assert.deepEqual(montarClienteCheckout({ telefone: '+44 20 7946 0958' }), {
        phone_number: '+442079460958',
    });
    for (const telefone of [
        '999999999',
        '+55119999',
        '++5511999999999',
        '+0123456789',
        '+1234567890123456',
        '20 99999-9999',
        '11 19999-9999',
        '11 0000-0000',
    ]) {
        assert.equal(montarClienteCheckout({ telefone }), undefined, telefone);
    }
});
