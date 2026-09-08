import { adicionarCriadoEm, adicionarFk, adicionarId } from '../migration-helpers.js';

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function up(knex) {
    await knex.schema.createTable('mensagens', (table) => {
        adicionarId(table, knex);
        adicionarFk(table, 'organizacao_id', 'organizacoes');
        adicionarFk(table, 'tarefa_mensagem_id', 'tarefas_mensagem', {
            nullable: true,
        });
        adicionarFk(table, 'cliente_id', 'clientes', { nullable: true });
        table.string('canal', 30).notNullable().defaultTo('WHATSAPP');
        table.string('destinatario', 100).notNullable();
        table.string('tipo', 50).notNullable();
        table.string('status', 30).notNullable();
        table.string('identificador_externo', 150);
        table.timestamp('enviado_em', { useTz: true });
        table.timestamp('entregue_em', { useTz: true });
        table.text('erro');
        adicionarCriadoEm(table, knex);
    });
}

/** @param { import("knex").Knex } knex @returns { Promise<void> } */
export async function down(knex) {
    await knex.schema.dropTableIfExists('mensagens');
}
