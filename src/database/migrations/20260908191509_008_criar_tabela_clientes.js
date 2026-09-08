import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('clientes', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        table.string('nome', 150).notNullable();
        table.string('cpf', 14);
        table.date('data_nascimento');
        table.string('telefone', 20);
        table.string('email', 150);
        table.string('sexo', 30);
        table.string('cep', 10);
        table.string('logradouro', 150);
        table.string('numero', 20);
        table.string('complemento', 100);
        table.string('bairro', 100);
        table.string('cidade', 100);
        table.string('uf', 2);
        table.text('observacao');
        table.boolean('aceite_whatsapp').notNullable().defaultTo(false);
        table.timestamp('aceite_whatsapp_em', { useTz: true });
        table.string('origem_aceite_whatsapp', 50);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
        table.timestamp('inativado_em', { useTz: true });

        table.unique(['organizacao_id', 'cpf'], 'uq_clientes_organizacao_cpf');
        table.index(['organizacao_id'], 'idx_clientes_organizacao');
        table.index(['nome'], 'idx_clientes_nome');
        table.index(['telefone'], 'idx_clientes_telefone');
        table.index(['ativo'], 'idx_clientes_ativo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('clientes');
}
