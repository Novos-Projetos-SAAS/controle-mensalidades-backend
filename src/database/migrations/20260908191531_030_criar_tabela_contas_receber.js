import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('contas_receber', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
        });
        adicionarFk(table, 'cliente_id', 'clientes', { nullable: true });
        table.string('origem_tipo', 30).notNullable();
        table.uuid('origem_id').notNullable();
        table.string('descricao', 255).notNullable();
        table.decimal('valor_original', 12, 2).notNullable();
        table.decimal('desconto', 12, 2).notNullable().defaultTo(0);
        table.decimal('acrescimo', 12, 2).notNullable().defaultTo(0);
        table.decimal('valor_final', 12, 2).notNullable();
        table.date('vencimento_em').notNullable();
        table.string('status', 30).notNullable().defaultTo('PENDENTE');
        adicionarTimestamps(table, knex);
        table.timestamp('recebido_em', { useTz: true });
        table.timestamp('cancelado_em', { useTz: true });
        adicionarFk(table, 'cancelado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.text('motivo_cancelamento');

        table.check('valor_original >= 0', [], 'chk_contas_receber_valor_original');
        table.check('desconto >= 0', [], 'chk_contas_receber_desconto');
        table.check('acrescimo >= 0', [], 'chk_contas_receber_acrescimo');
        table.check('valor_final >= 0', [], 'chk_contas_receber_valor_final');
        table.index(['organizacao_id'], 'idx_contas_receber_organizacao');
        table.index(['area_negocio_id'], 'idx_contas_receber_area');
        table.index(['cliente_id'], 'idx_contas_receber_cliente');
        table.index(['origem_tipo', 'origem_id'], 'idx_contas_receber_origem');
        table.index(['vencimento_em'], 'idx_contas_receber_vencimento');
        table.index(['status'], 'idx_contas_receber_status');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('contas_receber');
}
