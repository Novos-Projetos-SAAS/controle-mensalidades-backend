import { adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('modulos', (table) => {
        adicionarId(table, knex);
        table.string('codigo', 50).notNullable().unique();
        table.string('nome', 100).notNullable();
        table.string('descricao', 255);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('modulos');
}
