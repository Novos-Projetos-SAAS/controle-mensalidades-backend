import { adicionarCamposAuditoria, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.string('meta_business_id', 100);
        table.string('whatsapp_account_id', 100);
        table.string('messaging_account_id', 100);
        table.string('modo_onboarding', 30);
        table.string('situacao_registro', 30).notNullable().defaultTo('PENDENTE');
        table.string('situacao_webhook', 30).notNullable().defaultTo('PENDENTE');
        table.timestamp('autorizada_em', { useTz: true });
        table.timestamp('numero_registrado_em', { useTz: true });
        table.timestamp('webhook_assinado_em', { useTz: true });
    });

    await knex.schema.createTable('integracoes_whatsapp_onboarding', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'usuario_id', 'usuarios');
        adicionarFk(table, 'integracao_whatsapp_id', 'integracoes_whatsapp', { nullable: true });
        table.string('state_hash', 64).notNullable().unique('uq_whatsapp_onboarding_state');
        table.string('codigo_autorizacao_hash', 64).unique('uq_whatsapp_onboarding_code');
        table.string('status', 30).notNullable().defaultTo('INICIADO');
        table.string('modo_onboarding', 30);
        table.string('codigo_erro', 80);
        table.timestamp('expira_em', { useTz: true }).notNullable();
        table.timestamp('concluido_em', { useTz: true });
        adicionarCamposAuditoria(table, knex);
        table.index(
            ['organizacao_id', 'area_negocio_id', 'usuario_id', 'criado_em'],
            'idx_whatsapp_onboarding_escopo',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('integracoes_whatsapp_onboarding');
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.dropColumn('meta_business_id');
        table.dropColumn('whatsapp_account_id');
        table.dropColumn('messaging_account_id');
        table.dropColumn('modo_onboarding');
        table.dropColumn('situacao_registro');
        table.dropColumn('situacao_webhook');
        table.dropColumn('autorizada_em');
        table.dropColumn('numero_registrado_em');
        table.dropColumn('webhook_assinado_em');
    });
}
