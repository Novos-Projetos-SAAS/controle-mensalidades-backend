import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('formulario_versoes', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'formulario_id', 'formularios');
        table.integer('numero').notNullable();
        table.string('status', 30).notNullable().defaultTo('RASCUNHO');
        table.timestamp('publicado_em', { useTz: true });
        adicionarCriadoEm(table, knex);
        adicionarFk(table, 'criado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });

        table.unique(['formulario_id', 'numero'], 'uq_formulario_versoes_formulario_numero');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('formulario_versoes');
}
