/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.raw(`
        ALTER TABLE agendamentos
        VALIDATE CONSTRAINT chk_agendamentos_status_valido;
    `);
}

/** @returns { Promise<void> } */
export async function down() {
    // A validação não é revertida sem recriar a constraint.
}