import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import connection from '../../src/database/connection.js';

type ColunaAuditoria = {
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
};

type RegistroAuditoria = {
    criado_em: Date;
    atualizado_em: Date;
    deletado_em: Date | null;
};

const organizacaoId = crypto.randomUUID();
const organizacaoTriggerId = crypto.randomUUID();
const colunasEsperadas = ['criado_em', 'atualizado_em', 'deletado_em'];

let tabelasAplicacao: string[] = [];
let colunasAuditoria: ColunaAuditoria[] = [];
let registroInserido: RegistroAuditoria;

before(async () => {
    await connection('organizacoes').whereIn('id', [organizacaoId, organizacaoTriggerId]).del();

    const tabelas = await connection('information_schema.tables')
        .select('table_name')
        .where({ table_schema: 'public', table_type: 'BASE TABLE' })
        .whereNotIn('table_name', ['knex_migrations', 'knex_migrations_lock'])
        .orderBy('table_name');

    tabelasAplicacao = tabelas.map((tabela) => tabela.table_name);

    colunasAuditoria = await connection<ColunaAuditoria>('information_schema.columns')
        .select('table_name', 'column_name', 'data_type', 'is_nullable', 'column_default')
        .where('table_schema', 'public')
        .whereIn('table_name', tabelasAplicacao)
        .whereIn('column_name', colunasEsperadas)
        .orderBy(['table_name', 'column_name']);

    const [registro] = await connection('organizacoes')
        .insert({
            id: organizacaoId,
            nome: 'Organização Teste Auditoria',
            ativo: true,
        })
        .returning(['criado_em', 'atualizado_em', 'deletado_em']);

    registroInserido = registro;

    await connection('organizacoes').insert({
        id: organizacaoTriggerId,
        nome: 'Organização Teste Trigger',
        ativo: true,
        atualizado_em: new Date('2000-01-01T00:00:00.000Z'),
    });
});

after(async () => {
    try {
        await connection('organizacoes').whereIn('id', [organizacaoId, organizacaoTriggerId]).del();
    } finally {
        await connection.destroy();
    }
});

test('inventário deve conter as 55 tabelas da aplicação com os três campos de auditoria', () => {
    assert.equal(tabelasAplicacao.length, 55);
    assert.ok(tabelasAplicacao.includes('recorrencias_pagamento'));
    assert.ok(tabelasAplicacao.includes('recursos_pagamento'));
    assert.ok(tabelasAplicacao.includes('webhook_eventos_whatsapp'));
    assert.ok(tabelasAplicacao.includes('integracoes_whatsapp_onboarding'));
    assert.ok(tabelasAplicacao.includes('profissionais_areas'));
    assert.ok(tabelasAplicacao.includes('historico_correcoes_sessoes_clinicas'));
    assert.ok(tabelasAplicacao.includes('webhook_eventos_whatsapp'));

    for (const tabela of tabelasAplicacao) {
        const nomesColunas = colunasAuditoria
            .filter((coluna) => coluna.table_name === tabela)
            .map((coluna) => coluna.column_name)
            .sort();

        assert.deepEqual(nomesColunas, [...colunasEsperadas].sort(), tabela);
    }
});

test('campos de auditoria devem usar timestamp with time zone', () => {
    assert.equal(colunasAuditoria.length, tabelasAplicacao.length * colunasEsperadas.length);

    for (const coluna of colunasAuditoria) {
        assert.equal(
            coluna.data_type,
            'timestamp with time zone',
            `${coluna.table_name}.${coluna.column_name}`,
        );
    }
});

test('criado_em e atualizado_em devem ser obrigatórios com default e deletado_em deve ser nullable', () => {
    for (const coluna of colunasAuditoria) {
        if (coluna.column_name === 'deletado_em') {
            assert.equal(coluna.is_nullable, 'YES', coluna.table_name);
            continue;
        }

        assert.equal(coluna.is_nullable, 'NO', `${coluna.table_name}.${coluna.column_name}`);
        assert.ok(coluna.column_default, `${coluna.table_name}.${coluna.column_name}`);
    }
});

test('insert deve preencher criado_em automaticamente', () => {
    assert.ok(registroInserido.criado_em);
});

test('insert deve preencher atualizado_em automaticamente', () => {
    assert.ok(registroInserido.atualizado_em);
});

test('deletado_em deve iniciar nulo', () => {
    assert.equal(registroInserido.deletado_em, null);
});

test('UPDATE real deve alterar atualizado_em automaticamente', async () => {
    const [registroAtualizado] = await connection('organizacoes')
        .where('id', organizacaoTriggerId)
        .update({ nome: 'Organização Teste Trigger Atualizada' })
        .returning('atualizado_em');

    assert.ok(registroAtualizado.atualizado_em);
    assert.notEqual(new Date(registroAtualizado.atualizado_em).getUTCFullYear(), 2000);
});

test('trigger deve sobrescrever tentativa de manter atualizado_em antigo', async () => {
    const dataAntiga = new Date('2000-01-01T00:00:00.000Z');

    const [registroAtualizado] = await connection('organizacoes')
        .where('id', organizacaoTriggerId)
        .update({
            nome: 'Organização Teste Auditoria Trigger',
            atualizado_em: dataAntiga,
        })
        .returning('atualizado_em');

    assert.notEqual(new Date(registroAtualizado.atualizado_em).getUTCFullYear(), 2000);
});
