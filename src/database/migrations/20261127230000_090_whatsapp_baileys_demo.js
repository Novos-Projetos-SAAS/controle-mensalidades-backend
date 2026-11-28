import { adicionarFk } from '../migration-helpers.js';

/** @param {import('knex').Knex} knex */
export async function up(knex) {
    await knex.schema.createTable('whatsapp_baileys_sessoes', (table) => {
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        table.primary(['organizacao_id', 'area_negocio_id']);
        table.text('estado_cifrado');
        table.uuid('lease_id');
        table.timestamp('lease_ate', { useTz: true });
        table.string('ultimo_teste', 30);
        table.timestamp('ultimo_teste_em', { useTz: true });
    });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
    await knex.schema.dropTableIfExists('whatsapp_baileys_sessoes');
}
