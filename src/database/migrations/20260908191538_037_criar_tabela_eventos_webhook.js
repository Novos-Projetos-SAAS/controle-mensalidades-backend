import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('eventos_webhook', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('provedor', 50).notNullable();
        table.string('identificador_externo', 150);
        table.string('tipo_evento', 100).notNullable();
        table.jsonb('payload');
        table.timestamp('recebido_em', { useTz: true }).notNullable();
        table.timestamp('processado_em', { useTz: true });
        table.string('status', 30).notNullable().defaultTo('PENDENTE');
        table.text('erro');
        adicionarCriadoEm(table, knex);

        table.index(['provedor'], 'idx_eventos_webhook_provedor');
        table.index(['identificador_externo'], 'idx_eventos_webhook_identificador');
        table.index(['status'], 'idx_eventos_webhook_status');
        table.index(['recebido_em'], 'idx_eventos_webhook_recebido');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('eventos_webhook');
}
