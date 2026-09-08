import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('regras_cobranca', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
        });
        table.string('nome', 100).notNullable();
        table.integer('dias_relativos_vencimento').notNullable();
        table.string('tipo_mensagem', 50).notNullable();
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('regras_cobranca');
}
