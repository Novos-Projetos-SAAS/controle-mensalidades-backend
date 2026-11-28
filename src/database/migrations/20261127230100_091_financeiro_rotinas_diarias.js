/** @param {import('knex').Knex} knex */
export async function up(knex) {
    await knex.schema.createTable('financeiro_rotinas_diarias', (table) => {
        table.date('dia').primary();
        table.timestamp('concluida_em', { useTz: true }).notNullable();
    });
}
export async function down(knex) {
    await knex.schema.dropTableIfExists('financeiro_rotinas_diarias');
}
