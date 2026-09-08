import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('assinaturas', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'plano_comercial_id', 'planos_comerciais');
        table.decimal('valor_contratado', 12, 2).notNullable();
        table.decimal('desconto_recorrente', 12, 2).notNullable().defaultTo(0);
        table.integer('dia_vencimento').notNullable();
        table.date('inicio_em').notNullable();
        table.date('fim_em');
        table.string('status', 30).notNullable().defaultTo('ATIVA');
        adicionarTimestamps(table, knex);
        table.timestamp('cancelado_em', { useTz: true });

        table.check('valor_contratado >= 0', [], 'chk_assinaturas_valor_contratado');
        table.check('desconto_recorrente >= 0', [], 'chk_assinaturas_desconto_recorrente');
        table.check('dia_vencimento between 1 and 31', [], 'chk_assinaturas_dia_vencimento');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('assinaturas');
}
