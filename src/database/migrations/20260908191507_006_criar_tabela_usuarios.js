import { adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('usuarios', (table) => {
        adicionarId(table, knex);
        table.string('nome', 150).notNullable();
        table.string('email', 150).notNullable().unique();
        table.string('senha_hash', 255).notNullable();
        table.string('telefone', 20);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
        table.timestamp('ultimo_login_em', { useTz: true });
        table.timestamp('inativado_em', { useTz: true });
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('usuarios');
}
