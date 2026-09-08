import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('agendamentos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'profissional_id', 'profissionais');
        adicionarFk(table, 'servico_id', 'servicos');
        table.timestamp('inicio_em', { useTz: true }).notNullable();
        table.timestamp('fim_em', { useTz: true }).notNullable();
        table.string('status', 30).notNullable().defaultTo('AGENDADO');
        table.text('observacao');
        adicionarTimestamps(table, knex);
        table.timestamp('cancelado_em', { useTz: true });
        adicionarFk(table, 'cancelado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.text('motivo_cancelamento');

        table.check('fim_em > inicio_em', [], 'chk_agendamentos_periodo_valido');
        table.index(['organizacao_id'], 'idx_agendamentos_organizacao');
        table.index(['area_negocio_id'], 'idx_agendamentos_area');
        table.index(['profissional_id'], 'idx_agendamentos_profissional');
        table.index(['cliente_id'], 'idx_agendamentos_cliente');
        table.index(['inicio_em'], 'idx_agendamentos_inicio');
        table.index(['status'], 'idx_agendamentos_status');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('agendamentos');
}
