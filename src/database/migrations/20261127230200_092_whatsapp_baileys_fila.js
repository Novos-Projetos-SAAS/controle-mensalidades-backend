/** @param {import('knex').Knex} knex */
export async function up(knex) {
    await knex.schema.alterTable('tarefas_mensagem', (table) => {
        table.string('provedor_execucao', 40);
        table.index(['organizacao_id', 'area_negocio_id', 'provedor_execucao', 'status', 'executar_em'], 'idx_tarefas_baileys_prontas');
    });
}
export async function down(knex) {
    const existe = await knex('tarefas_mensagem').where('provedor_execucao', 'BAILEYS').first('id');
    if (existe) throw new Error('Rollback bloqueado: existem tarefas Baileys. Preserve o histórico.');
    await knex.schema.alterTable('tarefas_mensagem', (table) => {
        table.dropIndex(['organizacao_id', 'area_negocio_id', 'provedor_execucao', 'status', 'executar_em'], 'idx_tarefas_baileys_prontas');
        table.dropColumn('provedor_execucao');
    });
}
