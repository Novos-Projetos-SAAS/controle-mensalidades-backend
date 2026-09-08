import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('pagamentos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'conta_receber_id', 'contas_receber');
        adicionarFk(table, 'cobranca_pagamento_id', 'cobrancas_pagamento', {
            nullable: true,
        });
        table.decimal('valor', 12, 2).notNullable();
        table.string('forma_pagamento', 30).notNullable();
        table.string('origem', 30).notNullable();
        table.string('identificador_externo', 150);
        table.timestamp('pago_em', { useTz: true }).notNullable();
        adicionarCriadoEm(table, knex);
        adicionarFk(table, 'registrado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.text('observacao');

        table.check('valor > 0', [], 'chk_pagamentos_valor_positivo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('pagamentos');
}
