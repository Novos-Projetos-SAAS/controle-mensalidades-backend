import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('envios_formulario', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'formulario_versao_id', 'formulario_versoes');
        table.string('token_hash', 255).notNullable().unique();
        table.timestamp('enviado_em', { useTz: true });
        table.timestamp('expira_em', { useTz: true }).notNullable();
        table.timestamp('acessado_em', { useTz: true });
        table.timestamp('concluido_em', { useTz: true });
        table.timestamp('cancelado_em', { useTz: true });
        table.integer('tentativas').notNullable().defaultTo(0);
        adicionarCriadoEm(table, knex);
        adicionarFk(table, 'criado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('envios_formulario');
}
