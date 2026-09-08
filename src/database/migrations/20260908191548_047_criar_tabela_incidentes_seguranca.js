import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('incidentes_seguranca', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('titulo', 150).notNullable();
        table.text('descricao').notNullable();
        table.string('severidade', 30).notNullable();
        table.string('status', 30).notNullable().defaultTo('ABERTO');
        table.timestamp('identificado_em', { useTz: true }).notNullable();
        table.timestamp('resolvido_em', { useTz: true });
        adicionarFk(table, 'responsavel_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('incidentes_seguranca');
}
