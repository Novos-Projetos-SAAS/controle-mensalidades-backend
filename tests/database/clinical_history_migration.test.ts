import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import connection from '../../src/database/connection.js';

const migration = (await import(
    new URL(
        '../../src/database/migrations/20261108000000_061_bloquear_truncate_historico_clinico.js',
        import.meta.url,
    ).href
)) as {
    up: (knex: Knex.Transaction) => Promise<void>;
    down: (knex: Knex.Transaction) => Promise<void>;
};

const { down, up } = migration;

function exigirBancoTeste() {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Teste da migration clinica exige o banco exclusivo de testes.');
    }
}

async function exigirErroSqlState(
    transaction: import('knex').Knex.Transaction,
    sql: string,
    sqlState: string,
) {
    await assert.rejects(
        transaction.transaction((savepoint) => savepoint.raw(sql)),
        (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === sqlState,
    );
}

after(async () => {
    await connection.destroy();
});

test('migration 061 instala e reverte apenas o trigger de TRUNCATE sem persistir objetos de teste', async () => {
    exigirBancoTeste();

    const schema = `clinico_migration_${crypto.randomUUID().replaceAll('-', '')}`;
    const rollbackEsperado = new Error('ROLLBACK_INTENCIONAL_TESTE_MIGRATION_061');

    await assert.rejects(
        connection.transaction(async (transaction) => {
            await transaction.raw('CREATE SCHEMA ??', [schema]);
            await transaction.raw('SET LOCAL search_path TO ??', [schema]);
            await transaction.raw(`
                CREATE TABLE historico_correcoes_sessoes_clinicas (
                    id integer PRIMARY KEY,
                    evolucao text NOT NULL
                )
            `);
            await transaction.raw(`
                CREATE FUNCTION impedir_alteracao_historico_correcoes()
                RETURNS TRIGGER AS $$
                BEGIN
                    RAISE EXCEPTION 'O historico clinico e imutavel.';
                END;
                $$ LANGUAGE plpgsql
            `);
            await transaction.raw(`
                CREATE TRIGGER tg_bloquear_alteracao_historico_correcoes
                BEFORE UPDATE OR DELETE ON historico_correcoes_sessoes_clinicas
                FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_historico_correcoes()
            `);

            await up(transaction);
            await transaction('historico_correcoes_sessoes_clinicas').insert({
                id: 1,
                evolucao: 'texto ficticio de teste',
            });

            await exigirErroSqlState(
                transaction,
                'TRUNCATE TABLE historico_correcoes_sessoes_clinicas',
                'P0001',
            );
            let registros = await transaction('historico_correcoes_sessoes_clinicas').select('id');
            assert.deepEqual(registros, [{ id: 1 }]);

            await down(transaction);
            const triggersAposRollback = await transaction('pg_trigger as t')
                .innerJoin('pg_class as c', 'c.oid', 't.tgrelid')
                .select('t.tgname')
                .whereRaw('c.relnamespace = to_regnamespace(?)', [schema])
                .where('c.relname', 'historico_correcoes_sessoes_clinicas')
                .whereIn('t.tgname', [
                    'tg_bloquear_alteracao_historico_correcoes',
                    'tg_bloquear_truncate_historico_correcoes',
                ])
                .whereRaw('NOT t.tgisinternal')
                .orderBy('t.tgname');

            assert.deepEqual(
                triggersAposRollback.map((trigger) => trigger.tgname),
                ['tg_bloquear_alteracao_historico_correcoes'],
            );

            await exigirErroSqlState(
                transaction,
                "UPDATE historico_correcoes_sessoes_clinicas SET evolucao = 'alterado' WHERE id = 1",
                'P0001',
            );
            await exigirErroSqlState(
                transaction,
                'DELETE FROM historico_correcoes_sessoes_clinicas WHERE id = 1',
                'P0001',
            );

            registros = await transaction('historico_correcoes_sessoes_clinicas').select('id');
            assert.deepEqual(registros, [{ id: 1 }]);

            await up(transaction);
            await exigirErroSqlState(
                transaction,
                'TRUNCATE TABLE historico_correcoes_sessoes_clinicas',
                'P0001',
            );
            throw rollbackEsperado;
        }),
        (error: unknown) => error === rollbackEsperado,
    );
});
