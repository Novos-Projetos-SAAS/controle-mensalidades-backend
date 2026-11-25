/**
 * Campos clínicos estruturados, aditivos e compatíveis com atendimentos anteriores.
 * Não realiza backfill e não desbloqueia a publicação das rotas clínicas.
 * @param { import('knex').Knex } knex
 */
const campos = ["objetivo_sessao","avaliacao_previa","procedimentos_realizados","exercicios_parametros","resposta_paciente","orientacoes","plano_proxima_sessao"];
export async function up(knex) {
    await knex.schema.alterTable('sessoes_clinicas', (table) => {
        for (const campo of campos) table.text(campo).nullable();
    });
}

/**
 * Evita apagar qualquer dado de saúde durante rollback.
 * @param { import('knex').Knex } knex
 */
export async function down(knex) {
    const registro = await knex('sessoes_clinicas')
        .where((query) => {
            for (const campo of campos) query.orWhereNotNull(campo);
        })
        .first('id');
    if (registro) {
        throw new Error('Rollback bloqueado: existem registros clínicos estruturados.');
    }
    await knex.schema.alterTable('sessoes_clinicas', (table) => {
        for (const campo of campos) table.dropColumn(campo);
    });
}
