import { adicionarCamposAuditoria, adicionarFk, adicionarId } from '../migration-helpers.js';

const indices = [
    'uq_integracoes_whatsapp_org_global_ativa',
    'uq_integracoes_whatsapp_org_area_ativa',
    'uq_modelos_whatsapp_org_global_chave',
    'uq_modelos_whatsapp_org_area_chave',
    'uq_tarefas_whatsapp_ciclo_lembrete',
    'uq_mensagens_whatsapp_identificador_externo',
    'idx_tarefas_whatsapp_prontas',
    'idx_mensagens_whatsapp_area_criacao',
];

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', { nullable: true });
        table.string('whatsapp_business_account_id', 100);
        table.string('phone_number_id', 100);
        table.string('numero_exibido', 30);
        table.string('nome_negocio', 150);
        table.string('situacao_conexao', 30).notNullable().defaultTo('NAO_CONFIGURADO');
        table.string('situacao_autorizacao', 30).notNullable().defaultTo('PENDENTE');
        table.string('credencial_referencia', 250);
        table.timestamp('ativada_em', { useTz: true });
        table.timestamp('ultima_validacao_em', { useTz: true });
        table.string('situacao_templates', 30).notNullable().defaultTo('NAO_VALIDADO');
        table.string('motivo_indisponibilidade', 120);
    });

    await knex('integracoes_whatsapp')
        .whereNull('deletado_em')
        .update({
            ativo: false,
            situacao_conexao: knex.raw(
                "CASE WHEN ativo THEN 'PENDENTE_AUTORIZACAO' ELSE 'DESCONECTADO' END",
            ),
            situacao_autorizacao: 'PENDENTE',
            situacao_templates: 'NAO_VALIDADO',
            motivo_indisponibilidade: 'VALIDACAO_META_PENDENTE',
        });

    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.dropUnique(['organizacao_id', 'provedor'], 'uq_integracoes_whatsapp_organizacao_provedor');
    });

    await knex.schema.alterTable('modelos_mensagem', (table) => {
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', { nullable: true });
        table.string('chave', 80);
        table.string('nome_template_meta', 100);
        table.string('idioma_meta', 10).notNullable().defaultTo('pt_BR');
        table.string('categoria_meta', 30);
        table.string('status_meta', 30).notNullable().defaultTo('NAO_SUBMETIDO');
        table.jsonb('esquema_parametros');
        table.timestamp('aprovado_em', { useTz: true });
    });

    await knex.schema.alterTable('tarefas_mensagem', (table) => {
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', { nullable: true });
        adicionarFk(table, 'mensalidade_id', 'mensalidades', { nullable: true });
        table.string('ciclo_financeiro', 7);
        table.string('lembrete_tipo', 20);
        table.uuid('lease_token');
        table.timestamp('lease_expira_em', { useTz: true });
        table.integer('tentativas').notNullable().defaultTo(0);
        table.integer('max_tentativas').notNullable().defaultTo(5);
        table.timestamp('ultima_tentativa_em', { useTz: true });
        table.timestamp('resultado_incerto_em', { useTz: true });
        table.string('codigo_resultado', 80);
    });

    await knex.schema.alterTable('mensagens', (table) => {
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', { nullable: true });
        adicionarFk(table, 'mensalidade_id', 'mensalidades', { nullable: true });
        table.string('provedor', 40);
        table.string('nome_template_meta', 100);
        table.string('categoria_template', 30);
        table.string('modo_processamento', 20);
        table.integer('tentativa');
        table.string('erro_codigo', 80);
    });

    await knex.schema.createTable('webhook_eventos_whatsapp', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', { nullable: true });
        table.string('chave_evento', 64).notNullable();
        table.string('identificador_externo', 150).notNullable();
        table.string('status', 20).notNullable();
        table.timestamp('ocorrido_em', { useTz: true }).notNullable();
        adicionarCamposAuditoria(table, knex);
        table.unique(['organizacao_id', 'chave_evento'], 'uq_webhook_eventos_whatsapp_chave');
        table.index(
            ['organizacao_id', 'area_negocio_id', 'identificador_externo'],
            'idx_webhook_eventos_whatsapp_mensagem',
        );
    });

    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[0]}
         ON integracoes_whatsapp (organizacao_id, provedor)
         WHERE area_negocio_id IS NULL AND deletado_em IS NULL`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[1]}
         ON integracoes_whatsapp (organizacao_id, area_negocio_id, provedor)
         WHERE area_negocio_id IS NOT NULL AND deletado_em IS NULL`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[2]}
         ON modelos_mensagem (organizacao_id, chave)
         WHERE chave IS NOT NULL AND area_negocio_id IS NULL AND deletado_em IS NULL`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[3]}
         ON modelos_mensagem (organizacao_id, area_negocio_id, chave)
         WHERE chave IS NOT NULL AND area_negocio_id IS NOT NULL AND deletado_em IS NULL`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[4]}
         ON tarefas_mensagem
            (organizacao_id, area_negocio_id, cliente_id, mensalidade_id, lembrete_tipo, ciclo_financeiro)
         WHERE mensalidade_id IS NOT NULL AND lembrete_tipo IS NOT NULL AND ciclo_financeiro IS NOT NULL`,
    );
    await knex.raw(
        `CREATE UNIQUE INDEX ${indices[5]}
         ON mensagens (organizacao_id, identificador_externo)
         WHERE provedor = 'META_CLOUD_API' AND identificador_externo IS NOT NULL`,
    );
    await knex.raw(
        `CREATE INDEX ${indices[6]}
         ON tarefas_mensagem (status, executar_em, lease_expira_em)
         WHERE mensalidade_id IS NOT NULL`,
    );
    await knex.raw(
        `CREATE INDEX ${indices[7]}
         ON mensagens (organizacao_id, area_negocio_id, criado_em DESC)
         WHERE canal = 'WHATSAPP'`,
    );
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    const conflitos = await knex('integracoes_whatsapp')
        .select('organizacao_id', 'provedor')
        .count('* as total')
        .groupBy('organizacao_id', 'provedor')
        .havingRaw('COUNT(*) > 1')
        .first();

    if (conflitos) {
        throw new Error(
            'Rollback bloqueado: existem integrações WhatsApp por área que não cabem na constraint legada.',
        );
    }

    for (const indice of indices) {
        await knex.raw(`DROP INDEX IF EXISTS ${indice}`);
    }

    await knex.schema.dropTableIfExists('webhook_eventos_whatsapp');

    await knex.schema.alterTable('mensagens', (table) => {
        table.dropColumn([
            'area_negocio_id',
            'mensalidade_id',
            'provedor',
            'nome_template_meta',
            'categoria_template',
            'modo_processamento',
            'tentativa',
            'erro_codigo',
        ]);
    });
    await knex.schema.alterTable('tarefas_mensagem', (table) => {
        table.dropColumn([
            'area_negocio_id',
            'mensalidade_id',
            'ciclo_financeiro',
            'lembrete_tipo',
            'lease_token',
            'lease_expira_em',
            'tentativas',
            'max_tentativas',
            'ultima_tentativa_em',
            'resultado_incerto_em',
            'codigo_resultado',
        ]);
    });
    await knex.schema.alterTable('modelos_mensagem', (table) => {
        table.dropColumn([
            'area_negocio_id',
            'chave',
            'nome_template_meta',
            'idioma_meta',
            'categoria_meta',
            'status_meta',
            'esquema_parametros',
            'aprovado_em',
        ]);
    });
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.dropColumn([
            'area_negocio_id',
            'whatsapp_business_account_id',
            'phone_number_id',
            'numero_exibido',
            'nome_negocio',
            'situacao_conexao',
            'situacao_autorizacao',
            'credencial_referencia',
            'ativada_em',
            'ultima_validacao_em',
            'situacao_templates',
            'motivo_indisponibilidade',
        ]);
        table.unique(
            ['organizacao_id', 'provedor'],
            'uq_integracoes_whatsapp_organizacao_provedor',
        );
    });
}
