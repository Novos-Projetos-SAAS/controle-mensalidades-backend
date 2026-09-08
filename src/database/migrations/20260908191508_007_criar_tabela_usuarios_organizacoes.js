import { adicionarFk, adicionarId, adicionarTimestamps } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('usuarios_organizacoes', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'usuario_id', 'usuarios', { onDelete: 'CASCADE' });
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            onDelete: 'CASCADE',
        });
        table.string('perfil', 50).notNullable();
        table.boolean('ativo').notNullable().defaultTo(true);
        adicionarTimestamps(table, knex);

        table.unique(
            ['usuario_id', 'organizacao_id'],
            'uq_usuarios_organizacoes_usuario_organizacao',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('usuarios_organizacoes');
}
