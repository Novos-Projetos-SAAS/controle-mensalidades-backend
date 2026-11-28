import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import connection from '../../src/database/connection.js';

function exigirBancoIsolado() {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Testes documentais requerem banco de teste isolado e dados ficticios.');
    }
}

after(async () => {
    await connection.destroy();
});

test('migration 068 instala estrutura documental e invariantes de imutabilidade', async () => {
    exigirBancoIsolado();

    const tabelas = await connection('information_schema.tables')
        .where('table_schema', 'public')
        .whereIn('table_name', [
            'registros_clinicos_documentais',
            'versoes_registros_clinicos',
        ])
        .pluck('table_name');

    assert.deepEqual(
        tabelas.sort(),
        ['registros_clinicos_documentais', 'versoes_registros_clinicos'].sort(),
    );

    const colunas = await connection('information_schema.columns')
        .where('table_schema', 'public')
        .where('table_name', 'versoes_registros_clinicos')
        .pluck('column_name');

    for (const obrigatoria of [
        'registro_id', 'organizacao_id', 'area_negocio_id', 'cliente_id',
        'autor_usuario_id', 'versao', 'natureza', 'estado', 'conteudo',
        'justificativa', 'registrado_em',
    ]) {
        assert.ok(colunas.includes(obrigatoria), `Coluna ausente: ${obrigatoria}`);
    }

    const gatilhos = await connection('pg_trigger as t')
        .innerJoin('pg_class as c', 'c.oid', 't.tgrelid')
        .select('t.tgname')
        .whereIn('c.relname', [
            'registros_clinicos_documentais',
            'versoes_registros_clinicos',
        ])
        .whereRaw('c.relnamespace = to_regnamespace(?)', ['public'])
        .whereRaw('NOT t.tgisinternal');

    const nomes = new Set(gatilhos.map((t: { tgname: string }) => t.tgname));
    for (const nome of [
        'trg_registro_documental_escopo',
        'trg_validar_versao_documental',
        'trg_documental_imutavel',
        'trg_versao_documental_imutavel',
        'trg_documental_sem_truncate',
        'trg_versao_documental_sem_truncate',
    ]) {
        assert.ok(nomes.has(nome), `Gatilho de protecao ausente: ${nome}`);
    }
});

test('migration 068 rejeita TRUNCATE sem eliminar historico', async () => {
    exigirBancoIsolado();

    await assert.rejects(
        connection.transaction(async (trx) => {
            await trx.transaction((savepoint) =>
                savepoint.raw('TRUNCATE TABLE versoes_registros_clinicos'),
            );
        }),
        (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P0001',
    );
});
