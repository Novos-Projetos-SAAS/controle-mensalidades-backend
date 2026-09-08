import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('integracoes_pagamento', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        table.string('provedor', 50).notNullable();
        table.boolean('ativo').notNullable().defaultTo(true);
        table.text('configuracao_criptografada');
        adicionarTimestamps(table, knex);

        table.unique(
            ['organizacao_id', 'provedor'],
            'uq_integracoes_pagamento_organizacao_provedor',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('integracoes_pagamento');
}
