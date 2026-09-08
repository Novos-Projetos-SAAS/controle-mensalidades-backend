import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('execucoes_rotina', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('rotina', 100).notNullable();
        table.string('status', 30).notNullable();
        table.timestamp('iniciado_em', { useTz: true }).notNullable();
        table.timestamp('finalizado_em', { useTz: true });
        table.jsonb('resumo');
        table.text('erro');
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('execucoes_rotina');
}
