
/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    // Verifica se já existem sessões ativas duplicadas
    // para o mesmo agendamento.
    const duplicado = await knex('sessoes_clinicas')
        .select('agendamento_id')
        .whereNotNull('agendamento_id')
        .whereNull('deletado_em')
        .groupBy('agendamento_id')
        .havingRaw('COUNT(*) > 1')
        .first();

    if (duplicado) {
        throw new Error(
            'Existem sessões clínicas ativas duplicadas para um mesmo agendamento. ' +
                'Revise esses registros antes de aplicar a migration 056.',
        );
    }

    // Um agendamento pode ter apenas uma sessão clínica ativa.
    // Sessões avulsas continuam permitidas.
    await knex.raw(`
        CREATE UNIQUE INDEX uq_sessoes_clinicas_agendamento_ativo
        ON sessoes_clinicas (agendamento_id)
        WHERE agendamento_id IS NOT NULL
          AND deletado_em IS NULL;
    `);
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS uq_sessoes_clinicas_agendamento_ativo;
    `);
}
