import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('sessoes_clinicas', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'profissional_id', 'profissionais');
        adicionarFk(table, 'agendamento_id', 'agendamentos', {
            nullable: true,
        });
        table.timestamp('data_sessao', { useTz: true }).notNullable();
        table.text('evolucao');
        table.text('diagnostico_fisioterapeutico');
        table.text('prognostico');
        table.text('plano_terapeutico');
        table.text('observacoes');
        adicionarTimestamps(table, knex);
        table.timestamp('corrigido_em', { useTz: true });
        adicionarFk(table, 'corrigido_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });

        table.index(['organizacao_id'], 'idx_sessoes_clinicas_organizacao');
        table.index(['cliente_id'], 'idx_sessoes_clinicas_cliente');
        table.index(['profissional_id'], 'idx_sessoes_clinicas_profissional');
        table.index(['data_sessao'], 'idx_sessoes_clinicas_data');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('sessoes_clinicas');
}
