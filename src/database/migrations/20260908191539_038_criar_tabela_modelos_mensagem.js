import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('modelos_mensagem', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        table.string('tipo', 50).notNullable();
        table.string('nome', 100).notNullable();
        table.text('conteudo').notNullable();
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('modelos_mensagem');
}
