
import {
    adicionarAtualizadoEm,
    adicionarDeletadoEm,
} from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    // Mantém o padrão de auditoria das tabelas da aplicação.
    await knex.schema.alterTable(
        'historico_correcoes_sessoes_clinicas',
        (table) => {
            adicionarAtualizadoEm(table, knex);
            adicionarDeletadoEm(table);
        },
    );

    // O histórico clínico deve ser somente de inserção:
    // registros existentes não podem ser alterados ou apagados.
    await knex.raw(`
        CREATE FUNCTION impedir_alteracao_historico_correcoes()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION
                'O histórico de correções clínicas é imutável.';
        END;
        $$ LANGUAGE plpgsql;
    `);

    await knex.raw(`
        CREATE TRIGGER tg_bloquear_alteracao_historico_correcoes
        BEFORE UPDATE OR DELETE
        ON historico_correcoes_sessoes_clinicas
        FOR EACH ROW
        EXECUTE FUNCTION impedir_alteracao_historico_correcoes();
    `);
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.raw(`
        DROP TRIGGER IF EXISTS
            tg_bloquear_alteracao_historico_correcoes
        ON historico_correcoes_sessoes_clinicas;
    `);

    await knex.raw(`
        DROP FUNCTION IF EXISTS
            impedir_alteracao_historico_correcoes();
    `);

    await knex.schema.alterTable(
        'historico_correcoes_sessoes_clinicas',
        (table) => {
            table.dropColumn('deletado_em');
            table.dropColumn('atualizado_em');
        },
    );
}
