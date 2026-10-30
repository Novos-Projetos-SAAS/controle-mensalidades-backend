/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    // A extensão é compartilhada pelo banco. O rollback remove apenas os objetos deste módulo.
    await knex.raw('CREATE EXTENSION IF NOT EXISTS btree_gist');

    await knex.raw(`
        ALTER TABLE agendamentos
        ADD CONSTRAINT chk_agendamentos_status_valido
        CHECK (status IN ('AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO'))
        NOT VALID;
    `);

    await knex.raw(`
        ALTER TABLE agendamentos
        ADD CONSTRAINT ex_agendamentos_profissional_horario
        EXCLUDE USING gist (
            organizacao_id WITH =,
            profissional_id WITH =,
            tstzrange(inicio_em, fim_em, '[)') WITH &&
        )
        WHERE (status <> 'CANCELADO' AND deletado_em IS NULL);
    `);

    await knex.raw(`
        ALTER TABLE agendamentos
        ADD CONSTRAINT ex_agendamentos_cliente_horario
        EXCLUDE USING gist (
            organizacao_id WITH =,
            cliente_id WITH =,
            tstzrange(inicio_em, fim_em, '[)') WITH &&
        )
        WHERE (status <> 'CANCELADO' AND deletado_em IS NULL);
    `);
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.raw(`
        ALTER TABLE agendamentos
        DROP CONSTRAINT IF EXISTS ex_agendamentos_cliente_horario;
    `);

    await knex.raw(`
        ALTER TABLE agendamentos
        DROP CONSTRAINT IF EXISTS ex_agendamentos_profissional_horario;
    `);

    await knex.raw(`
        ALTER TABLE agendamentos
        DROP CONSTRAINT IF EXISTS chk_agendamentos_status_valido;
    `);
}
