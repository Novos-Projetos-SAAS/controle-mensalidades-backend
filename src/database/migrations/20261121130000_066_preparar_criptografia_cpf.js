/**
 * Fase 1: adicionar colunas cifradas sem remover a coluna legada.
 * NÃO executa backfill nem toca em dados pessoais preexistentes.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    for (const tabela of ['clientes', 'profissionais']) {
        await knex.schema.alterTable(tabela, (table) => {
            table.text('cpf_cifrado').nullable();
            table.string('cpf_indice', 64).nullable();
            table.unique(
                ['organizacao_id', 'cpf_indice'],
                'uq_' + tabela + '_organizacao_cpf_indice',
            );
        });
    }
}

/**
 * Recusa rollback que descartaria CPFs que já foram cifrados.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    for (const tabela of ['clientes', 'profissionais']) {
        const resultado = await knex(tabela)
            .whereNotNull('cpf_cifrado')
            .orWhereNotNull('cpf_indice')
            .first('id');
        if (resultado) {
            throw new Error(
                'Rollback bloqueado: existem CPFs cifrados. Faça um plano de reversão seguro.',
            );
        }
    }
    for (const tabela of ['profissionais', 'clientes']) {
        await knex.schema.alterTable(tabela, (table) => {
            table.dropUnique(
                ['organizacao_id', 'cpf_indice'],
                'uq_' + tabela + '_organizacao_cpf_indice',
            );
            table.dropColumn('cpf_indice');
            table.dropColumn('cpf_cifrado');
        });
    }
}
