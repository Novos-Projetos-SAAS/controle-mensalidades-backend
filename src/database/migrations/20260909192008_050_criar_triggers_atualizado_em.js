const tabelasComAtualizadoEm = [
    'agendamentos',
    'aparelhos',
    'areas_modulos',
    'areas_negocio',
    'assinaturas',
    'atividades_clinicas',
    'clientes',
    'clientes_areas',
    'cobrancas_pagamento',
    'contas_receber',
    'documentos_clinicos',
    'envios_formulario',
    'eventos_webhook',
    'execucoes_rotina',
    'formulario_versoes',
    'formularios',
    'historico_mensalidades',
    'incidentes_seguranca',
    'integracoes_pagamento',
    'integracoes_whatsapp',
    'logs_erros',
    'mensagens',
    'mensalidades',
    'modelos_mensagem',
    'modulos',
    'opcoes_pergunta',
    'organizacoes',
    'organizacoes_modulos',
    'pacotes',
    'pacotes_clientes',
    'pagamentos',
    'perguntas_formulario',
    'planos_comerciais',
    'politicas_privacidade',
    'preenchimentos_formulario',
    'profissionais',
    'registros_auditoria',
    'regras_cobranca',
    'respostas_formulario',
    'servicos',
    'sessoes_aparelhos',
    'sessoes_atividades',
    'sessoes_clinicas',
    'solicitacoes_titulares',
    'tarefas_mensagem',
    'usuarios',
    'usuarios_organizacoes',
    'vendas_avulsas',
];

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.raw(`
        CREATE OR REPLACE FUNCTION definir_atualizado_em()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.atualizado_em = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    for (const tabela of tabelasComAtualizadoEm) {
        const trigger = `tg_upd_${tabela}`;

        await knex.raw(`
            DROP TRIGGER IF EXISTS "${trigger}"
            ON "${tabela}";
        `);

        await knex.raw(`
            CREATE TRIGGER "${trigger}"
            BEFORE UPDATE ON "${tabela}"
            FOR EACH ROW
            EXECUTE FUNCTION definir_atualizado_em();
        `);
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    for (const tabela of [...tabelasComAtualizadoEm].reverse()) {
        const trigger = `tg_upd_${tabela}`;

        await knex.raw(`
            DROP TRIGGER IF EXISTS "${trigger}"
            ON "${tabela}";
        `);
    }

    await knex.raw(`
        DROP FUNCTION IF EXISTS definir_atualizado_em();
    `);
}
