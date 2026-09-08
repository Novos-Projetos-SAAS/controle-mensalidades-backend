import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('tarefas_mensagem', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'cliente_id', 'clientes', { nullable: true });
        adicionarFk(table, 'conta_receber_id', 'contas_receber', {
            nullable: true,
        });
        adicionarFk(table, 'agendamento_id', 'agendamentos', {
            nullable: true,
        });
        adicionarFk(table, 'envio_formulario_id', 'envios_formulario', {
            nullable: true,
        });
        adicionarFk(table, 'modelo_mensagem_id', 'modelos_mensagem', {
            nullable: true,
        });
        table.string('tipo', 50).notNullable();
        table.string('status', 30).notNullable().defaultTo('PENDENTE');
        table.timestamp('executar_em', { useTz: true }).notNullable();
        adicionarTimestamps(table, knex);
        table.timestamp('cancelado_em', { useTz: true });
        table.text('motivo_cancelamento');

        table.index(['status'], 'idx_tarefas_mensagem_status');
        table.index(['executar_em'], 'idx_tarefas_mensagem_executar');
        table.index(['organizacao_id'], 'idx_tarefas_mensagem_organizacao');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('tarefas_mensagem');
}
