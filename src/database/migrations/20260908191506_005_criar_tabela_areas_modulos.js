import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('areas_modulos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            onDelete: 'CASCADE',
        });
        adicionarFk(table, 'modulo_id', 'modulos', { onDelete: 'CASCADE' });
        table.boolean('habilitado').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.unique(['area_negocio_id', 'modulo_id'], 'uq_areas_modulos_area_modulo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('areas_modulos');
}
