import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

export const config = { transaction: true };

/** @param {import('knex').Knex} knex */
export async function up(knex) {
    // Keep the preflight and index creation in the same transaction, excluding concurrent writes.
    await knex.raw(
        'LOCK TABLE integracoes_pagamento, cobrancas_pagamento, eventos_webhook IN SHARE ROW EXCLUSIVE MODE',
    );
    const activeCharges = await knex.raw(`
        SELECT COUNT(*) AS total FROM (
            SELECT conta_receber_id FROM cobrancas_pagamento
            WHERE provedor IN ('INFINITEPAY','ABACATEPAY')
              AND status IN ('AGUARDANDO_CRIACAO','CRIANDO','CRIACAO_INCERTA','AGUARDANDO_PAGAMENTO','PAGO_EM_REVISAO')
            GROUP BY conta_receber_id HAVING COUNT(*) > 1
        ) AS conflitos
    `);
    if (Number(activeCharges.rows[0].total) > 0) {
        throw new Error(
            `Encontradas ${activeCharges.rows[0].total} contas com cobranças ativas conflitantes. Revise os vínculos antes de aplicar a 071; nenhum registro foi alterado.`,
        );
    }
    const invalidEvents = await knex.raw(`
        SELECT COUNT(*) AS total FROM eventos_webhook
        WHERE provedor = 'ABACATEPAY' AND NOT ((
            organizacao_id IS NOT NULL
            AND NULLIF(BTRIM(identificador_externo), '') IS NOT NULL
            AND jsonb_typeof(payload -> 'devMode') = 'boolean'
        ) IS TRUE)
    `);
    if (Number(invalidEvents.rows[0].total) > 0) {
        throw new Error(
            `Encontrados ${invalidEvents.rows[0].total} webhooks AbacatePay com identidade ou ambiente inválidos. Corrija a identificação antes de aplicar a 071; nenhum registro foi alterado.`,
        );
    }
    const duplicateEvents = await knex.raw(`
        SELECT COUNT(*) AS total FROM (
            SELECT organizacao_id, provedor, (payload ->> 'devMode'), identificador_externo
            FROM eventos_webhook WHERE provedor = 'ABACATEPAY'
            GROUP BY organizacao_id, provedor, (payload ->> 'devMode'), identificador_externo
            HAVING COUNT(*) > 1
        ) AS conflitos
    `);
    if (Number(duplicateEvents.rows[0].total) > 0) {
        throw new Error(
            `Encontrados ${duplicateEvents.rows[0].total} grupos de webhooks duplicados no mesmo ambiente. Revise os eventos antes de aplicar a 071; nenhum registro foi alterado.`,
        );
    }
    const existingIntegrations = await knex('integracoes_pagamento').select(
        'id',
        'organizacao_id',
        'provedor',
        'ativo',
        knex.raw("NULLIF(BTRIM(configuracao_criptografada), '') IS NOT NULL AS tem_credencial"),
        knex.raw("NULLIF(BTRIM(handle), '') IS NOT NULL AS tem_handle"),
    );
    const defaults = new Map();
    for (const row of existingIntegrations) {
        const eligible =
            row.ativo &&
            row.tem_credencial &&
            (row.provedor === 'ABACATEPAY' || (row.provedor === 'INFINITEPAY' && row.tem_handle));
        if (eligible && (!defaults.has(row.organizacao_id) || row.provedor === 'INFINITEPAY')) {
            defaults.set(row.organizacao_id, row.id);
        }
    }

    await knex.schema.alterTable('integracoes_pagamento', (t) => {
        // Legacy integrations had no sandbox selector; preserve their production context.
        t.string('ambiente', 10).notNullable().defaultTo('PRODUCAO');
        t.boolean('padrao').notNullable().defaultTo(false);
        t.boolean('recorrencia_habilitada').notNullable().defaultTo(false);
        t.boolean('cartao_recorrente').notNullable().defaultTo(true);
        t.string('pix_automatico_estado', 20).notNullable().defaultTo('NAO_VERIFICADO');
        t.check("ambiente IN ('TESTE','PRODUCAO')", [], 'chk_integracao_ambiente');
    });
    await knex.raw("ALTER TABLE integracoes_pagamento ALTER COLUMN ambiente SET DEFAULT 'TESTE'");
    if (defaults.size > 0) {
        await knex('integracoes_pagamento')
            .whereIn('id', [...defaults.values()])
            .update({ padrao: true });
    }
    await knex.raw(
        'CREATE UNIQUE INDEX uq_integracao_padrao ON integracoes_pagamento(organizacao_id) WHERE padrao',
    );
    await knex.schema.alterTable('cobrancas_pagamento', (t) => {
        t.string('ambiente', 10);
        t.string('recurso_externo_id', 150);
    });
    await knex.raw(
        `CREATE UNIQUE INDEX uq_cobranca_provedor_ativa ON cobrancas_pagamento(conta_receber_id) WHERE provedor IN ('INFINITEPAY','ABACATEPAY') AND status IN ('AGUARDANDO_CRIACAO','CRIANDO','CRIACAO_INCERTA','AGUARDANDO_PAGAMENTO','PAGO_EM_REVISAO')`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX uq_abacatepay_checkout ON cobrancas_pagamento(organizacao_id,ambiente,recurso_externo_id) WHERE provedor='ABACATEPAY' AND recurso_externo_id IS NOT NULL`,
    );
    await knex.raw(`ALTER TABLE eventos_webhook ADD CONSTRAINT chk_abacatepay_evento_identidade
        CHECK (provedor <> 'ABACATEPAY' OR (
            organizacao_id IS NOT NULL
            AND NULLIF(BTRIM(identificador_externo), '') IS NOT NULL
            AND jsonb_typeof(payload -> 'devMode') = 'boolean'
        ) IS TRUE)`);
    await knex.raw(
        `CREATE UNIQUE INDEX uq_abacatepay_evento ON eventos_webhook(organizacao_id,provedor,(payload ->> 'devMode'),identificador_externo) WHERE provedor='ABACATEPAY'`,
    );
    await knex.schema.createTable('recursos_pagamento', (t) => {
        adicionarId(t, knex);
        adicionarFk(t, 'organizacao_id', 'organizacoes');
        adicionarFk(t, 'integracao_id', 'integracoes_pagamento');
        t.string('ambiente', 10).notNullable();
        t.string('tipo', 20).notNullable();
        t.string('chave', 150).notNullable();
        t.string('identificador_externo', 150);
        t.string('status', 30).notNullable().defaultTo('PREPARANDO');
        adicionarTimestamps(t, knex);
        t.unique(['integracao_id', 'ambiente', 'tipo', 'chave'], 'uq_recurso_pagamento');
    });
    await knex.schema.createTable('recorrencias_pagamento', (t) => {
        adicionarId(t, knex);
        for (const [c, table] of [
            ['organizacao_id', 'organizacoes'],
            ['area_negocio_id', 'areas_negocio'],
            ['assinatura_id', 'assinaturas'],
            ['cliente_id', 'clientes'],
            ['plano_comercial_id', 'planos_comerciais'],
            ['integracao_id', 'integracoes_pagamento'],
        ])
            adicionarFk(t, c, table);
        t.string('provedor', 50).notNullable().defaultTo('ABACATEPAY');
        t.string('ambiente', 10).notNullable();
        t.string('status', 30).notNullable();
        t.string('metodo', 10).notNullable();
        t.decimal('valor', 12, 2).notNullable();
        t.integer('dia_vencimento').notNullable();
        t.date('competencia_inicial').notNullable();
        t.string('cliente_externo_id', 150);
        t.string('produto_externo_id', 150);
        t.string('checkout_externo_id', 150);
        t.text('checkout_url');
        t.string('assinatura_externa_id', 150);
        t.text('credencial_snapshot').notNullable();
        t.date('data_debito');
        t.timestamp('ciclo_inicio_em', { useTz: true });
        t.timestamp('ciclo_fim_em', { useTz: true });
        t.timestamp('proxima_cobranca_em', { useTz: true });
        t.timestamp('operacao_iniciada_em', { useTz: true });
        t.string('ultimo_erro', 100);
        t.timestamp('cancelado_em', { useTz: true });
        adicionarTimestamps(t, knex);
        t.check("metodo IN ('CARD','PIX')", [], 'chk_recorrencia_metodo');
        t.check('valor > 0', [], 'chk_recorrencia_valor');
        t.unique(['organizacao_id', 'ambiente', 'assinatura_externa_id'], 'uq_recorrencia_externa');
        t.unique(['organizacao_id', 'ambiente', 'checkout_externo_id'], 'uq_recorrencia_checkout');
    });
    await knex.raw(
        `CREATE UNIQUE INDEX uq_recorrencia_contrato ON recorrencias_pagamento(assinatura_id) WHERE status <> 'CANCELADA'`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX uq_abacatepay_pagamento ON pagamentos(organizacao_id,identificador_externo) WHERE origem='ABACATEPAY'`,
    );
}

/** Do not delete financial history on rollback. Disable the integration instead. */
export async function down() {
    throw new Error(
        'Desative a AbacatePay para reverter a operação. Preserve vínculos e evidências financeiras.',
    );
}
