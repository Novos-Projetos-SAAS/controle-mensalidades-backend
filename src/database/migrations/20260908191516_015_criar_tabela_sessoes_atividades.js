import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('sessoes_atividades', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'sessao_clinica_id', 'sessoes_clinicas', {
            onDelete: 'CASCADE',
        });
        adicionarFk(table, 'atividade_clinica_id', 'atividades_clinicas', {
            onDelete: 'CASCADE',
        });
        table.text('observacao');
        adicionarCriadoEm(table, knex);

        table.unique(
            ['sessao_clinica_id', 'atividade_clinica_id'],
            'uq_sessoes_atividades_sessao_atividade',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('sessoes_atividades');
}
