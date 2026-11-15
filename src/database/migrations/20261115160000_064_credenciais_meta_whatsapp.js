/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.text('credenciais_meta_criptografadas');
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.alterTable('integracoes_whatsapp', (table) => {
        table.dropColumn('credenciais_meta_criptografadas');
    });
}
