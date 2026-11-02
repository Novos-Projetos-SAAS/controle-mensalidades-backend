/** @param { import('knex').Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('profissionais_areas', (table) => {
        // Negado por padrão: vínculo de área NÃO concede acesso ao prontuário.
        table.boolean('acesso_clinico_autorizado').notNullable().defaultTo(false);
    });
}

/** @param { import('knex').Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.alterTable('profissionais_areas', (table) => {
        table.dropColumn('acesso_clinico_autorizado');
    });
}