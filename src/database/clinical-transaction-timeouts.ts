import type { Knex } from 'knex';

import { env } from '../configuration/env.js';

export type ClinicalTransactionTimeouts = {
    statementTimeoutMs: number;
    lockTimeoutMs: number;
    idleTransactionTimeoutMs: number;
};

const timeoutsConfigurados: ClinicalTransactionTimeouts = {
    statementTimeoutMs: env.CLINICAL_DB_STATEMENT_TIMEOUT_MS,
    lockTimeoutMs: env.CLINICAL_DB_LOCK_TIMEOUT_MS,
    idleTransactionTimeoutMs: env.CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS,
};

export async function aplicarTimeoutsTransacaoClinica(
    transaction: Knex.Transaction,
    timeouts: ClinicalTransactionTimeouts = timeoutsConfigurados,
): Promise<void> {
    if (timeouts.lockTimeoutMs >= timeouts.statementTimeoutMs) {
        throw new Error('O lock timeout precisa ser menor que o statement timeout.');
    }

    if (timeouts.idleTransactionTimeoutMs <= timeouts.statementTimeoutMs) {
        throw new Error('O idle transaction timeout precisa exceder o statement timeout.');
    }

    await transaction.raw(
        `SELECT
            set_config('statement_timeout', ?, true),
            set_config('lock_timeout', ?, true),
            set_config('idle_in_transaction_session_timeout', ?, true)
        `,
        [
            `${timeouts.statementTimeoutMs}ms`,
            `${timeouts.lockTimeoutMs}ms`,
            `${timeouts.idleTransactionTimeoutMs}ms`,
        ],
    );
}
