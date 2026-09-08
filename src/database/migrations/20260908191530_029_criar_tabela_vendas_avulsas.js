import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('vendas_avulsas', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
        });
        adicionarFk(table, 'cliente_id', 'clientes', { nullable: true });
        table.string('descricao', 255).notNullable();
        table.decimal('valor', 12, 2).notNullable();
        table.string('nome_pagador', 150);
        table.string('documento_pagador', 20);
        table.string('email_pagador', 150);
        table.string('telefone_pagador', 20);
        adicionarCriadoEm(table, knex);
        adicionarFk(table, 'criado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });

        table.check('valor >= 0', [], 'chk_vendas_avulsas_valor');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('vendas_avulsas');
}
