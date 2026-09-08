import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('sessoes_aparelhos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'sessao_clinica_id', 'sessoes_clinicas', {
            onDelete: 'CASCADE',
        });
        adicionarFk(table, 'aparelho_id', 'aparelhos', {
            onDelete: 'CASCADE',
        });
        table.text('observacao');
        adicionarCriadoEm(table, knex);

        table.unique(['sessao_clinica_id', 'aparelho_id'], 'uq_sessoes_aparelhos_sessao_aparelho');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('sessoes_aparelhos');
}
