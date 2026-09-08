import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('areas_negocio', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        table.string('nome', 100).notNullable();
        table.string('codigo', 50).notNullable();
        table.string('descricao', 255);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
        table.timestamp('inativado_em', { useTz: true });

        table.unique(['organizacao_id', 'codigo'], 'uq_areas_negocio_organizacao_codigo');
        table.index(['organizacao_id'], 'idx_areas_negocio_organizacao');
        table.index(['ativo'], 'idx_areas_negocio_ativo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('areas_negocio');
}
