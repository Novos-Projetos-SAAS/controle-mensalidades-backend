import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('respostas_formulario', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'preenchimento_formulario_id', 'preenchimentos_formulario');
        adicionarFk(table, 'pergunta_formulario_id', 'perguntas_formulario');
        table.text('valor_texto');
        table.decimal('valor_numero', 18, 4);
        table.boolean('valor_booleano');
        table.date('valor_data');
        table.jsonb('valor_json');
        adicionarCriadoEm(table, knex);

        table.unique(
            ['preenchimento_formulario_id', 'pergunta_formulario_id'],
            'uq_respostas_formulario_preenchimento_pergunta',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('respostas_formulario');
}
