import {
    adicionarCamposAuditoria,
    adicionarFk,
    adicionarId,
} from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('profissionais_areas', (table) => {
        adicionarId(table, knex);

        adicionarFk(table, 'profissional_id', 'profissionais', {
            onDelete: 'CASCADE',
        });

        adicionarFk(table, 'area_negocio_id', 'areas_negocio', {
            onDelete: 'CASCADE',
        });

        table.boolean('ativo').notNullable().defaultTo(true);

        adicionarCamposAuditoria(table, knex);

        table.unique(
            ['profissional_id', 'area_negocio_id'],
            'uq_profissionais_areas_profissional_area',
        );

        table.index('profissional_id', 'idx_profissionais_areas_profissional');
        table.index('area_negocio_id', 'idx_profissionais_areas_area');
        table.index('ativo', 'idx_profissionais_areas_ativo');
    });

    await knex.raw(`
        CREATE TRIGGER "tg_upd_profissionais_areas"
        BEFORE UPDATE ON "profissionais_areas"
        FOR EACH ROW
        EXECUTE FUNCTION definir_atualizado_em();
    `);
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.raw(`
        DROP TRIGGER IF EXISTS "tg_upd_profissionais_areas"
        ON "profissionais_areas";
    `);

    await knex.schema.dropTableIfExists('profissionais_areas');
}