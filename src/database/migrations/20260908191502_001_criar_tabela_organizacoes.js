import { adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await knex.schema.createTable('organizacoes', (table) => {
        adicionarId(table, knex);
        table.string('nome', 150).notNullable();
        table.string('nome_fantasia', 150);
        table.string('razao_social', 150);
        table.string('cpf_cnpj', 20).unique();
        table.string('email', 150);
        table.string('telefone', 20);
        table.string('cep', 10);
        table.string('logradouro', 150);
        table.string('numero', 20);
        table.string('complemento', 100);
        table.string('bairro', 100);
        table.string('cidade', 100);
        table.string('uf', 2);
        table.string('logo_url', 500);
        table.string('fuso_horario', 50).notNullable().defaultTo('America/Sao_Paulo');
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
        table.timestamp('inativado_em', { useTz: true });

        table.index(['nome'], 'idx_organizacoes_nome');
        table.index(['ativo'], 'idx_organizacoes_ativo');
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists('organizacoes');
}
