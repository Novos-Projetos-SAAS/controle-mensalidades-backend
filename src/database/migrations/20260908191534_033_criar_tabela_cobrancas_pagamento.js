import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('cobrancas_pagamento', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'conta_receber_id', 'contas_receber');
        table.string('provedor', 50).notNullable();
        table.string('identificador_externo', 150);
        table.string('tipo', 30).notNullable().defaultTo('PIX');
        table.string('status', 30).notNullable().defaultTo('PENDENTE');
        table.decimal('valor', 12, 2).notNullable();
        table.text('qr_code');
        table.text('qr_code_base64');
        table.text('copia_cola');
        table.timestamp('expira_em', { useTz: true });
        adicionarTimestamps(table, knex);
        table.timestamp('invalidado_em', { useTz: true });
        table.text('motivo_invalidacao');

        table.index(['conta_receber_id'], 'idx_cobrancas_pagamento_conta');
        table.index(['identificador_externo'], 'idx_cobrancas_pagamento_identificador');
        table.index(['status'], 'idx_cobrancas_pagamento_status');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('cobrancas_pagamento');
}
