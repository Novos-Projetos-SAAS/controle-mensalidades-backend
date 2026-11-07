
/**
 * Impede que um mesmo usuário represente dois profissionais
 * não deletados dentro da mesma organização.
 *
 * Profissionais sem usuário continuam permitidos.
 * Profissionais com soft delete não bloqueiam um novo vínculo.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
    const duplicado = await knex('profissionais')
        .select('organizacao_id', 'usuario_id')
        .whereNotNull('usuario_id')
        .whereNull('deletado_em')
        .groupBy('organizacao_id', 'usuario_id')
        .havingRaw('COUNT(*) > 1')
        .first();

    if (duplicado) {
        throw new Error(
            'Existem usuários vinculados a múltiplos profissionais ' +
                'na mesma organização. Revise esses vínculos antes ' +
                'de aplicar a migration 060.',
        );
    }

    await knex.raw(`
        CREATE UNIQUE INDEX
            uq_profissionais_organizacao_usuario_nao_deletado
        ON profissionais (organizacao_id, usuario_id)
        WHERE usuario_id IS NOT NULL
          AND deletado_em IS NULL;
    `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS
            uq_profissionais_organizacao_usuario_nao_deletado;
    `);
}
