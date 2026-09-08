import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('preenchimentos_formulario', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'envio_formulario_id', 'envios_formulario');
        adicionarFk(table, 'cliente_id', 'clientes');
        table.timestamp('iniciado_em', { useTz: true }).notNullable();
        table.timestamp('concluido_em', { useTz: true });
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('preenchimentos_formulario');
}
