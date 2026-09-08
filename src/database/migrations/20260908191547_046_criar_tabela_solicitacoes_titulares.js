import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('solicitacoes_titulares', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'cliente_id', 'clientes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('tipo', 50).notNullable();
        table.text('descricao');
        table.string('status', 30).notNullable().defaultTo('ABERTA');
        table.timestamp('solicitada_em', { useTz: true }).notNullable();
        table.timestamp('concluida_em', { useTz: true });
        adicionarFk(table, 'responsavel_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.text('observacao');
        adicionarTimestamps(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('solicitacoes_titulares');
}
