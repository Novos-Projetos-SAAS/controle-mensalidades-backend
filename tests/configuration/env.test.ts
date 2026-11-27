import test from 'node:test';
import assert from 'node:assert/strict';

import { validarEnv } from '../../src/configuration/env.js';

test('deve usar valores padrão das variáveis de ambiente', () => {
    const resultado = validarEnv({});

    assert.equal(resultado.NODE_ENV, 'development');

    assert.equal(resultado.PORT, 3333);
    assert.equal(resultado.CLINICAL_DB_STATEMENT_TIMEOUT_MS, 15000);
    assert.equal(resultado.CLINICAL_DB_LOCK_TIMEOUT_MS, 3000);
    assert.equal(resultado.CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS, 30000);
    assert.equal(resultado.DATABASE_POOL_ACQUIRE_TIMEOUT_MS, 5000);
    assert.equal(resultado.DATABASE_CONNECTION_TIMEOUT_MS, 8000);
});

test('deve validar timeout de conexão PostgreSQL configurável', () => {
    const resultado = validarEnv({ DATABASE_CONNECTION_TIMEOUT_MS: '12000' });

    assert.equal(resultado.DATABASE_CONNECTION_TIMEOUT_MS, 12000);
    assert.throws(() => validarEnv({ DATABASE_CONNECTION_TIMEOUT_MS: '499' }));
    assert.throws(() => validarEnv({ DATABASE_CONNECTION_TIMEOUT_MS: '60001' }));
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

test('deve rejeitar lock timeout maior ou igual ao statement timeout', () => {
    assert.throws(() =>
        validarEnv({
            CLINICAL_DB_STATEMENT_TIMEOUT_MS: '3000',
            CLINICAL_DB_LOCK_TIMEOUT_MS: '3000',
        }),
    );
});

test('deve rejeitar DB_SSL fora de true ou false', () => {
    assert.throws(() => validarEnv({ DB_SSL: 'maybe' }));
});

test('deve preservar ENCRYPTION_KEY para as integrações de pagamento', () => {
    const chave = Buffer.alloc(32, 7).toString('base64');
    const resultado = validarEnv({ ENCRYPTION_KEY: chave });

    assert.equal(resultado.ENCRYPTION_KEY, chave);
    assert.equal(validarEnv({}).ENCRYPTION_KEY, undefined);
});
