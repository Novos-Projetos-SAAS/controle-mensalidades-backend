import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('logs_erros', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        adicionarFk(table, 'usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('request_id', 100);
        table.string('codigo', 100);
        table.text('mensagem').notNullable();
        table.jsonb('contexto');
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('logs_erros');
}
