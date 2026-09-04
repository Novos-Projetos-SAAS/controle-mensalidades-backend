import test from 'node:test';
import assert from 'node:assert/strict';

import { validarEnv } from '../../src/configuration/env.js';

test('deve usar valores padrão das variáveis de ambiente', () => {
    const resultado = validarEnv({});

    assert.equal(resultado.NODE_ENV, 'development');

    assert.equal(resultado.PORT, 3333);
});

test('deve converter PORT de string para número', () => {
    const resultado = validarEnv({
        NODE_ENV: 'test',
        PORT: '4000',
    });

    assert.equal(resultado.NODE_ENV, 'test');

    assert.equal(resultado.PORT, 4000);

    assert.equal(typeof resultado.PORT, 'number');
});

test('deve rejeitar PORT inválida', () => {
    assert.throws(() => {
        validarEnv({
            PORT: 'porta-invalida',
        });
    });
});
