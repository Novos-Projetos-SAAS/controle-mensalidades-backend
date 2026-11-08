import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import { env } from '../../src/configuration/env.js';
import connection from '../../src/database/connection.js';
import {
    aplicarTimeoutsTransacaoClinica,
    type ClinicalTransactionTimeouts,
} from '../../src/database/clinical-transaction-timeouts.js';

const timeoutsCurtos: ClinicalTransactionTimeouts = {
    statementTimeoutMs: 100,
    lockTimeoutMs: 50,
    idleTransactionTimeoutMs: 300,
};

function exigirBancoTeste() {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Teste de timeout exige o banco exclusivo de testes.');
    }
}

after(async () => {
    await connection.destroy();
});

test('timeouts clinicos sao locais a transacao e respeitam os valores configurados', async () => {
    exigirBancoTeste();

    const configuracao = await connection.transaction(async (transaction) => {
        const anterior = await transaction.raw(`
            SELECT
                current_setting('statement_timeout') AS statement,
                current_setting('lock_timeout') AS lock,
                current_setting('idle_in_transaction_session_timeout') AS idle
        `);
        await aplicarTimeoutsTransacaoClinica(transaction);
        const resultado = await transaction.raw(`
            SELECT
                round(extract(epoch from current_setting('statement_timeout')::interval) * 1000)::int AS statement_ms,
                round(extract(epoch from current_setting('lock_timeout')::interval) * 1000)::int AS lock_ms,
                round(extract(epoch from current_setting('idle_in_transaction_session_timeout')::interval) * 1000)::int AS idle_ms
        `);
        return { anterior: anterior.rows[0], aplicado: resultado.rows[0] };
    });

    assert.equal(Number(configuracao.aplicado.statement_ms), env.CLINICAL_DB_STATEMENT_TIMEOUT_MS);
    assert.equal(Number(configuracao.aplicado.lock_ms), env.CLINICAL_DB_LOCK_TIMEOUT_MS);
    assert.equal(
        Number(configuracao.aplicado.idle_ms),
        env.CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS,
    );

    const fora = await connection.transaction(async (transaction) => {
        const resultado = await transaction.raw(`
            SELECT current_setting('statement_timeout') AS statement_timeout
        `);
        return resultado.rows[0].statement_timeout;
    });

    assert.equal(fora, configuracao.anterior.statement);
});

test('statement timeout aborta a operacao e reverte alteracoes do savepoint', async () => {
    exigirBancoTeste();

    await connection.transaction(async (outer) => {
        await outer.raw('CREATE TEMP TABLE clinical_timeout_probe (id integer) ON COMMIT DROP');
        await outer('clinical_timeout_probe').insert({ id: 1 });

        await assert.rejects(
            outer.transaction(async (inner) => {
                await aplicarTimeoutsTransacaoClinica(inner, timeoutsCurtos);
                await inner('clinical_timeout_probe').insert({ id: 2 });
                await inner.raw('SELECT pg_sleep(0.2)');
            }),
            (error: unknown) =>
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '57014',
        );

        const linhas = await outer('clinical_timeout_probe').select('id').orderBy('id');
        assert.deepEqual(linhas, [{ id: 1 }]);
    });
});

test('lock timeout interrompe uma espera por lock e libera a transacao', async () => {
    exigirBancoTeste();

    const advisoryLockA = 1732;
    const advisoryLockB = 91745;
    const bloqueadora = await connection.transaction();

    try {
        await bloqueadora.raw('SELECT pg_advisory_xact_lock(?, ?)', [advisoryLockA, advisoryLockB]);

        await assert.rejects(
            connection.transaction(async (transaction) => {
                await aplicarTimeoutsTransacaoClinica(transaction, timeoutsCurtos);
                await transaction.raw('SELECT pg_advisory_xact_lock(?, ?)', [
                    advisoryLockA,
                    advisoryLockB,
                ]);
            }),
            (error: unknown) =>
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '55P03',
        );
    } finally {
        if (!bloqueadora.isCompleted()) await bloqueadora.rollback();
    }
});
