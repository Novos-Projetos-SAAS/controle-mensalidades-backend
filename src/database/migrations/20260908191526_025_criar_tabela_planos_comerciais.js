import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('planos_comerciais', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
        });
        table.string('nome', 150).notNullable();
        table.text('descricao');
        table.decimal('valor_base', 12, 2).notNullable();
        table.string('periodicidade', 30).notNullable().defaultTo('MENSAL');
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.check('valor_base >= 0', [], 'chk_planos_comerciais_valor_base');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('planos_comerciais');
}
