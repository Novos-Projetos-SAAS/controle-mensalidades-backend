/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    // Triggers por linha (UPDATE/DELETE) não são executados pelo TRUNCATE.
    // O histórico clínico também deve rejeitar essa forma de esvaziamento.
    await knex.raw(`
        CREATE TRIGGER tg_bloquear_truncate_historico_correcoes
        BEFORE TRUNCATE
        ON historico_correcoes_sessoes_clinicas
        FOR EACH STATEMENT
        EXECUTE FUNCTION impedir_alteracao_historico_correcoes();
    `);
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.raw(`
        DROP TRIGGER IF EXISTS tg_bloquear_truncate_historico_correcoes
        ON historico_correcoes_sessoes_clinicas;
    `);
}
