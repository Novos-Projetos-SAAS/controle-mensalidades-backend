import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('pacotes', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        table.string('nome', 150).notNullable();
        table.text('descricao');
        table.integer('quantidade_sessoes').notNullable();
        table.decimal('valor', 12, 2).notNullable();
        table.integer('validade_dias');
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.check('quantidade_sessoes > 0', [], 'chk_pacotes_quantidade_sessoes');
        table.check('valor >= 0', [], 'chk_pacotes_valor');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('pacotes');
}
