import assert from 'node:assert/strict';
import test from 'node:test';

import { cpfValido } from '../../src/utils/cpf.utils.js';

test('CPF verifica dígitos, rejeita sequências repetidas e aceita pontuação', () => {
    for (const cpf of ['52998224725', '529.982.247-25', '11144477735', '98765432100']) {
        assert.equal(cpfValido(cpf), true, cpf);
    }
    for (const cpf of [
        '52998224726',
        '12345678901',
        '11111111111',
        '00000000000',
        '99999999999',
        '123',
        'abc',
        '',
    ]) {
        assert.equal(cpfValido(cpf), false, cpf);
    }
});
