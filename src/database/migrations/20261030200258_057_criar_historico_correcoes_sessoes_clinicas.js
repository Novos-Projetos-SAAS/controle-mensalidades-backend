
import {
    adicionarCriadoEm,
    adicionarFk,
    adicionarId,
} from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable(
        'historico_correcoes_sessoes_clinicas',
        (table) => {
            adicionarId(table, knex);

            adicionarFk(
                table,
                'sessao_clinica_id',
                'sessoes_clinicas',
            );

            adicionarFk(
                table,
                'corrigido_por_usuario_id',
                'usuarios',
            );

            // Somente os campos efetivamente alterados.
            table
                .specificType('campos_alterados', 'text[]')
                .notNullable();

            // Valores anteriores à correção.
            table.jsonb('dados_anteriores').notNullable();

            // Valores definidos pela correção.
            table.jsonb('dados_novos').notNullable();

            // Data e hora da correção.
            adicionarCriadoEm(table, knex);

            table.index(
                ['sessao_clinica_id', 'criado_em'],
                'idx_historico_correcoes_sessao_data',
            );
        },
    );
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists(
        'historico_correcoes_sessoes_clinicas',
    );
}
