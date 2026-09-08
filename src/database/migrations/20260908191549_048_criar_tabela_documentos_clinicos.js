import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('documentos_clinicos', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'area_negocio_id', 'areas_negocio');
        adicionarFk(table, 'cliente_id', 'clientes');
        adicionarFk(table, 'sessao_clinica_id', 'sessoes_clinicas', {
            nullable: true,
        });
        adicionarFk(table, 'formulario_preenchimento_id', 'preenchimentos_formulario', {
            nullable: true,
        });
        table.string('formato', 10).notNullable();
        table.string('tipo', 50).notNullable();
        adicionarFk(table, 'gerado_por_usuario_id', 'usuarios', {
            nullable: true,
            onDelete: 'SET NULL',
        });
        table.string('hash_documento', 128);
        table.string('storage_key', 500);
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('documentos_clinicos');
}
