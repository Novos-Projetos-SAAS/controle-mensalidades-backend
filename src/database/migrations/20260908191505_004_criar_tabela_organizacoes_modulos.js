import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('organizacoes_modulos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            onDelete: 'CASCADE',
        });
        adicionarFk(table, 'modulo_id', 'modulos', { onDelete: 'CASCADE' });
        table.boolean('habilitado').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.unique(['organizacao_id', 'modulo_id'], 'uq_organizacoes_modulos_organizacao_modulo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('organizacoes_modulos');
}
