import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('pacotes_clientes', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'pacote_id', 'pacotes');
        table.integer('quantidade_total').notNullable();
        table.integer('quantidade_utilizada').notNullable().defaultTo(0);
        table.timestamp('adquirido_em', { useTz: true }).notNullable();
        table.timestamp('expira_em', { useTz: true });
        table.string('status', 30).notNullable().defaultTo('ATIVO');
        adicionarTimestamps(table, knex);

        table.check('quantidade_total > 0', [], 'chk_pacotes_clientes_quantidade_total');
        table.check('quantidade_utilizada >= 0', [], 'chk_pacotes_clientes_quantidade_utilizada');
        table.check(
            'quantidade_utilizada <= quantidade_total',
            [],
            'chk_pacotes_clientes_saldo_valido',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('pacotes_clientes');
}
