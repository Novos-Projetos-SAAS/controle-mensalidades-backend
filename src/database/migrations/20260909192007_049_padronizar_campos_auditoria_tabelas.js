const tabelasSemCriadoEm = [];

const tabelasSemAtualizadoEm = [
    'documentos_clinicos',
    'envios_formulario',
    'eventos_webhook',
    'execucoes_rotina',
    'formulario_versoes',
    'historico_mensalidades',
    'logs_erros',
    'mensagens',
    'opcoes_pergunta',
    'pagamentos',
    'perguntas_formulario',
    'preenchimentos_formulario',
    'registros_auditoria',
    'respostas_formulario',
    'sessoes_aparelhos',
    'sessoes_atividades',
    'vendas_avulsas',
];

const tabelasSemDeletadoEm = [
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
    for (const tabela of tabelasSemCriadoEm) {
        await knex.schema.alterTable(tabela, (table) => {
            table.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }

    for (const tabela of tabelasSemAtualizadoEm) {
        await knex.schema.alterTable(tabela, (table) => {
            table
                .timestamp('atualizado_em', { useTz: true })
                .notNullable()
                .defaultTo(knex.fn.now());
        });
    }

    for (const tabela of tabelasSemDeletadoEm) {
        await knex.schema.alterTable(tabela, (table) => {
            table.timestamp('deletado_em', { useTz: true });
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    for (const tabela of [...tabelasSemDeletadoEm].reverse()) {
        await knex.schema.alterTable(tabela, (table) => {
            table.dropColumn('deletado_em');
        });
    }

    for (const tabela of [...tabelasSemAtualizadoEm].reverse()) {
        await knex.schema.alterTable(tabela, (table) => {
            table.dropColumn('atualizado_em');
        });
    }

    for (const tabela of [...tabelasSemCriadoEm].reverse()) {
        await knex.schema.alterTable(tabela, (table) => {
            table.dropColumn('criado_em');
        });
    }
}
