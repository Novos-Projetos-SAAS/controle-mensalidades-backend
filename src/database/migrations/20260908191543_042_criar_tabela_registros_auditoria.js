import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('registros_auditoria', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        adicionarFk(table, 'usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('acao', 100).notNullable();
        table.string('recurso', 100).notNullable();
        table.uuid('recurso_id');
        table.jsonb('dados_contexto');
        table.string('ip', 64);
        table.string('user_agent', 500);
        adicionarCriadoEm(table, knex);

        table.index(['organizacao_id'], 'idx_registros_auditoria_organizacao');
        table.index(['usuario_id'], 'idx_registros_auditoria_usuario');
        table.index(['recurso', 'recurso_id'], 'idx_registros_auditoria_recurso');
        table.index(['criado_em'], 'idx_registros_auditoria_criado');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('registros_auditoria');
}
