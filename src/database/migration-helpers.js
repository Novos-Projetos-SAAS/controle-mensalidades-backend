export function adicionarId(table, knex) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
}

export function adicionarCriadoEm(table, knex) {
    table.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
}

export function adicionarAtualizadoEm(table, knex) {
    table.timestamp('atualizado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
}

export function adicionarTimestamps(table, knex) {
    adicionarCriadoEm(table, knex);
    adicionarAtualizadoEm(table, knex);
}

export function adicionarFk(
    table,
    coluna,
    tabelaReferenciada,
    { nullable = false, onDelete = 'RESTRICT' } = {},
) {
    const definicao = table.uuid(coluna);

    if (nullable) {
        definicao.nullable();
    } else {
        definicao.notNullable();
    }

    definicao.references('id').inTable(tabelaReferenciada).onUpdate('CASCADE').onDelete(onDelete);
}
