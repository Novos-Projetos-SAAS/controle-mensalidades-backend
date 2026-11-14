/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('pagamentos', (table) => {
        table.string('chave_idempotencia', 150);
        table.unique(
            ['organizacao_id', 'chave_idempotencia'],
            'uq_pagamentos_organizacao_idempotencia',
        );
        table.index(
            ['organizacao_id', 'conta_receber_id'],
            'idx_pagamentos_organizacao_conta',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.alterTable('pagamentos', (table) => {
        table.dropIndex(
            ['organizacao_id', 'conta_receber_id'],
            'idx_pagamentos_organizacao_conta',
        );
        table.dropUnique(
            ['organizacao_id', 'chave_idempotencia'],
            'uq_pagamentos_organizacao_idempotencia',
        );
        table.dropColumn('chave_idempotencia');
    });
}
