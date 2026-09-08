import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('clientes_areas', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'cliente_id', 'clientes', { onDelete: 'CASCADE' });
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            onDelete: 'CASCADE',
        });
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.unique(['cliente_id', 'area_negocio_id'], 'uq_clientes_areas_cliente_area');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('clientes_areas');
}
