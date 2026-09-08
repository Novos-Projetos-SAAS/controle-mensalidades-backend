import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('opcoes_pergunta', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'pergunta_formulario_id', 'perguntas_formulario');
        table.integer('ordem').notNullable();
        table.string('valor', 255).notNullable();
        adicionarCriadoEm(table, knex);

        table.unique(['pergunta_formulario_id', 'ordem'], 'uq_opcoes_pergunta_pergunta_ordem');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('opcoes_pergunta');
}
