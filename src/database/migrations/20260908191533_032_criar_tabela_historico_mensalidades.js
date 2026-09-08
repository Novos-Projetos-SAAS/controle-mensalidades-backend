import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('historico_mensalidades', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'mensalidade_id', 'mensalidades');
        adicionarFk(table, 'usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('tipo_evento', 50).notNullable();
        table.jsonb('dados_anteriores');
        table.jsonb('dados_novos');
        table.text('motivo');
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('historico_mensalidades');
}
