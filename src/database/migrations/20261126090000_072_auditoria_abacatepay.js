/** @param {import('knex').Knex} knex */
export async function up(knex) {
    for (const table of ['recursos_pagamento','recorrencias_pagamento']) {
        await knex.schema.alterTable(table,t=>{t.timestamp('deletado_em',{useTz:true});t.check('deletado_em IS NULL',[],`chk_${table}_historico`);});
        await knex.raw('CREATE TRIGGER ?? BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION definir_atualizado_em()',[`tg_upd_${table}`,table]);
    }
    await knex.schema.alterTable('transacoes_pagamento',t=>t.string('referencia_liquidacao',200));
    await knex.raw("CREATE UNIQUE INDEX uq_abacatepay_liquidacao ON transacoes_pagamento(provedor,referencia_liquidacao) WHERE provedor='ABACATEPAY'");
}

/** Keep financial aliases and audit evidence on operational rollback. */
export async function down() {
    throw new Error('Desative a AbacatePay para reverter operação. Preserve os registros financeiros.');
}
