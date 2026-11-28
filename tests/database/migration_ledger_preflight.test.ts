import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { compararLedgerMigrations } from '../../src/database/migration-ledger-preflight.js';

const infinitepay = '20261125120000_067_infinitepay_cobrancas.js';
const documentos = '20261125121000_068_documentos_clinicos_versionados.js';
const vinculos = '20261125122000_069_vinculos_clinicos_pacientes.js';
const evolucao = '20261125130000_070_campos_evolucao_fisioterapia.js';

test('detecta no ledger migration executada mas ausente no checkout clinico', () => {
    const atual = compararLedgerMigrations([infinitepay], [documentos, vinculos, evolucao]);
    assert.deepEqual(atual.registradasSemArquivo, [infinitepay]);
    assert.deepEqual(atual.arquivosPendentes, [documentos, vinculos, evolucao]);
    assert.deepEqual(atual.numerosReutilizados, []);
});

test('depois de recuperar arquivo original da InfinitePay, a lista e compatível', () => {
    const atual = compararLedgerMigrations(
        [infinitepay], [infinitepay, documentos, vinculos, evolucao],
    );
    assert.deepEqual(atual.registradasSemArquivo, []);
    assert.deepEqual(atual.arquivosPendentes, [documentos, vinculos, evolucao]);
    assert.deepEqual(atual.numerosReutilizados, []);
});

test('detecta arquivos com mesmo numero logico, ainda que seus timestamps difiram', () => {
    const atual = compararLedgerMigrations([], [
        '20261122170000_067_campos_evolucao_fisioterapia.js',
        infinitepay,
    ]);
    assert.equal(atual.numerosReutilizados.length, 1);
    assert.equal(atual.numerosReutilizados[0]?.numero, '067');
    assert.equal(atual.numerosReutilizados[0]?.arquivos.length, 2);
});

test('usa nomes exatos, sem presumir que mudanca de nome significa aplicada', () => {
    const antigo = '20261122170000_067_campos_evolucao_fisioterapia.js';
    const atual = compararLedgerMigrations([antigo], [evolucao]);
    assert.deepEqual(atual.registradasSemArquivo, [antigo]);
    assert.deepEqual(atual.arquivosPendentes, [evolucao]);
});

test('não repete nomes ou considera arquivo js.js invalido', () => {
    const antigo = '20261107003620_060_unicidade_usuario_profissional.js.js';
    const atual = compararLedgerMigrations([antigo, antigo], [antigo]);
    assert.deepEqual(atual.registradasSemArquivo, []);
    assert.deepEqual(atual.arquivosPendentes, []);
    assert.deepEqual(atual.numerosReutilizados, []);
});

test('checkout clínico tem o arquivo original 067 e a ordem 067→068→069→070', async () => {
    const arquivos = (await readdir(resolve('src/database/migrations')))
        .filter((nome) => nome.endsWith('.js'));
    assert.ok(arquivos.includes(infinitepay));
    assert.ok(arquivos.includes(documentos));
    assert.ok(arquivos.includes(vinculos));
    assert.ok(arquivos.includes(evolucao));
    assert.deepEqual([infinitepay, documentos, vinculos, evolucao].slice().sort(),
        [infinitepay, documentos, vinculos, evolucao]);
    assert.ok(!arquivos.includes('20261122170000_067_campos_evolucao_fisioterapia.js'));
    assert.ok(!arquivos.includes('20261122180000_068_documentos_clinicos_versionados.js'));
    assert.ok(!arquivos.includes('20261123190000_069_vinculos_clinicos_pacientes.js'));
    assert.equal(compararLedgerMigrations([infinitepay], arquivos).registradasSemArquivo.length, 0);
    assert.deepEqual(compararLedgerMigrations([], arquivos).numerosReutilizados, []);
});
