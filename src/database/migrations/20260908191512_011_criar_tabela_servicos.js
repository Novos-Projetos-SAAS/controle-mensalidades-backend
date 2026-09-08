import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('servicos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        table.string('nome', 150).notNullable();
        table.text('descricao');
        table.integer('duracao_minutos').notNullable();
        table.decimal('valor', 12, 2);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.check('duracao_minutos > 0', [], 'chk_servicos_duracao_positiva');
        table.index(['organizacao_id'], 'idx_servicos_organizacao');
        table.index(['area_negocio_id'], 'idx_servicos_area');
        table.index(['ativo'], 'idx_servicos_ativo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('servicos');
}
