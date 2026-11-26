import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import('knex').Knex } knex */
export async function up(knex) {
    await knex.schema.alterTable('integracoes_pagamento', (table) => {
        table.boolean('geracao_automatica').notNullable().defaultTo(false);
        table.smallint('dias_antecedencia').notNullable().defaultTo(2);
        table.string('handle', 100);
        table.text('origem_plataforma');
        table.check('dias_antecedencia IN (1, 2)', [], 'chk_integracao_dias_antecedencia');
    });
    await knex.schema.alterTable('cobrancas_pagamento', (table) => {
        table.text('checkout_url');
        table.string('handle_snapshot', 100);
        table.text('credencial_snapshot');
        table.text('token_criptografado');
        table.string('token_hash', 64).unique('uq_cobrancas_token_hash');
        table.jsonb('payload_checkout');
        table.timestamp('criacao_iniciada_em', { useTz: true });
        table.string('ultimo_erro', 100);
    });
    await knex.raw(`CREATE UNIQUE INDEX uq_infinitepay_referencia ON cobrancas_pagamento(provedor, identificador_externo) WHERE provedor = 'INFINITEPAY'`);
    await knex.raw(`CREATE UNIQUE INDEX uq_infinitepay_cobranca_ativa ON cobrancas_pagamento(conta_receber_id) WHERE provedor = 'INFINITEPAY' AND status IN ('AGUARDANDO_CRIACAO','CRIANDO','CRIACAO_INCERTA','AGUARDANDO_PAGAMENTO','PAGO_EM_REVISAO')`);
    await knex.schema.alterTable('pagamentos', (table) => {
        table.string('identificador_externo', 200).alter();
    });
    await knex.schema.createTable('transacoes_pagamento', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'cobranca_pagamento_id', 'cobrancas_pagamento');
        table.string('provedor', 50).notNullable();
        table.string('transaction_nsu', 200).notNullable();
        table.string('slug', 200).notNullable();
        table.bigInteger('valor_centavos').notNullable();
        table.bigInteger('pago_centavos').notNullable();
        table.string('capture_method', 30).notNullable();
        table.smallint('installments').notNullable();
        table.string('status', 30).notNullable();
        table.timestamp('verificado_em', { useTz: true }).notNullable();
        table.unique(['provedor', 'transaction_nsu'], 'uq_transacoes_provedor_nsu');
        table.check("status IN ('APLICADO', 'REVISAO')", [], 'chk_transacao_status');
        table.check('valor_centavos >= 0 AND pago_centavos >= 0', [], 'chk_transacao_valores');
        adicionarTimestamps(table, knex);
        table.timestamp('deletado_em', { useTz: true });
        table.check('deletado_em IS NULL', [], 'chk_transacao_nao_excluida');
    });
    await knex.schema.alterTable('eventos_webhook', (table) => {
        table.integer('tentativas').notNullable().defaultTo(0);
        table.timestamp('disponivel_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('lease_ate', { useTz: true });
        table.uuid('lease_token');
        table.jsonb('resultado');
        table.index(['provedor', 'status', 'disponivel_em'], 'idx_eventos_webhook_trabalho');
    });
    await knex.raw(`CREATE UNIQUE INDEX uq_infinitepay_evento ON eventos_webhook(provedor, identificador_externo) WHERE provedor = 'INFINITEPAY'`);
}

/** Financial evidence is preserved; operational rollback disables new charges. */
export async function down() {
    throw new Error('Desative a integração para reverter operação. Não remova cobranças ou evidências financeiras.');
}
