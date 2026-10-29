/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('profissionais', (table) => {
        table.unique(
            ['organizacao_id', 'cpf'],
            'uq_profissionais_organizacao_cpf',
        );
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.alterTable('profissionais', (table) => {
        table.dropUnique(
            ['organizacao_id', 'cpf'],
            'uq_profissionais_organizacao_cpf',
        );
    });
}