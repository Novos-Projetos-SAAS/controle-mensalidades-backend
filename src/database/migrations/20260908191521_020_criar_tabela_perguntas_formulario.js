import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('perguntas_formulario', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'formulario_versao_id', 'formulario_versoes');
        table.integer('ordem').notNullable();
        table.string('titulo', 255).notNullable();
        table.text('descricao');
        table.string('tipo', 30).notNullable();
        table.boolean('obrigatoria').notNullable().defaultTo(false);
        adicionarCriadoEm(table, knex);

        table.index(['formulario_versao_id', 'ordem'], 'idx_perguntas_formulario_versao_ordem');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('perguntas_formulario');
}
