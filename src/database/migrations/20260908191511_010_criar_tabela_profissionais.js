import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('profissionais', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('nome', 150).notNullable();
        table.string('cpf', 14);
        table.string('email', 150);
        table.string('telefone', 20);
        table.string('conselho', 30);
        table.string('numero_conselho', 50);
        table.string('uf_conselho', 2);
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);
        table.timestamp('inativado_em', { useTz: true });

        table.index(['organizacao_id'], 'idx_profissionais_organizacao');
        table.index(['nome'], 'idx_profissionais_nome');
        table.index(['ativo'], 'idx_profissionais_ativo');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('profissionais');
}
