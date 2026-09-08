import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('mensalidades', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'assinatura_id', 'assinaturas');
        adicionarFk(table, 'conta_receber_id', 'contas_receber');
        table.date('competencia').notNullable();
        table.decimal('valor_base', 12, 2).notNullable();
        table.decimal('desconto_recorrente', 12, 2).notNullable().defaultTo(0);
        table.decimal('ajuste_competencia', 12, 2).notNullable().defaultTo(0);
        table.decimal('valor_final', 12, 2).notNullable();
        table.date('vencimento_em').notNullable();
        adicionarTimestamps(table, knex);

        table.unique(['conta_receber_id'], 'uq_mensalidades_conta_receber');
        table.unique(['assinatura_id', 'competencia'], 'uq_mensalidades_assinatura_competencia');
        table.check('valor_base >= 0', [], 'chk_mensalidades_valor_base');
        table.check('desconto_recorrente >= 0', [], 'chk_mensalidades_desconto_recorrente');
        table.check('ajuste_competencia >= 0', [], 'chk_mensalidades_ajuste_competencia');
        table.check('valor_final >= 0', [], 'chk_mensalidades_valor_final');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('mensalidades');
}
