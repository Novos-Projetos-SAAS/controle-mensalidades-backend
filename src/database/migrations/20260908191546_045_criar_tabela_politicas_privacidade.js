import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('politicas_privacidade', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        table.string('versao', 30).notNullable();
        table.string('titulo', 150).notNullable();
        table.text('conteudo').notNullable();
        table.timestamp('publicada_em', { useTz: true });
        table.boolean('ativa').notNullable().defaultTo(false);
        adicionarTimestamps(table, knex);

        table.unique(['organizacao_id', 'versao'], 'uq_politicas_privacidade_organizacao_versao');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('politicas_privacidade');
}
