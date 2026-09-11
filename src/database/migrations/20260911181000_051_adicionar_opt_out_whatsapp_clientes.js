/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.alterTable('clientes', (table) => {
        table.timestamp('opt_out_whatsapp_em', { useTz: true });
        table.string('origem_opt_out_whatsapp', 50);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.alterTable('clientes', (table) => {
        table.dropColumn('origem_opt_out_whatsapp');
        table.dropColumn('opt_out_whatsapp_em');
    });
}
