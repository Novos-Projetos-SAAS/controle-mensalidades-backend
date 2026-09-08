import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('formularios', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
        });
        table.string('nome', 150).notNullable();
        table.text('descricao');
        table.string('tipo', 50).notNullable().defaultTo('ANAMNESE');
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('formularios');
}
