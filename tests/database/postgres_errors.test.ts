import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizarErroPostgres } from '../../src/database/postgres-errors.js';

function erroPg(code: string, message = 'detalhe interno e conteudo clinico reservado') {
    return Object.assign(new Error(message), { code });
}

test('normaliza SQLSTATE operacional sem repassar a mensagem do driver', () => {
    const casos = [
        ['57014', 'CONSULTA_BANCO_INTERROMPIDA', 'consulta_cancelada'],
        ['55P03', 'BANCO_DADOS_OCUPADO', 'espera_lock_expirada'],
        ['40P01', 'CONFLITO_TRANSACIONAL_BANCO', 'deadlock'],
        ['25P03', 'TRANSACAO_BANCO_EXPIRADA', 'transacao_ociosa_expirada'],
        ['08006', 'BANCO_DADOS_INDISPONIVEL', 'banco_indisponivel'],
    ] as const;

    for (const [sqlState, codigo, categoria] of casos) {
        const normalizado = normalizarErroPostgres(erroPg(sqlState));

        assert.equal(normalizado?.statusCode, 503);
        assert.equal(normalizado?.codigo, codigo);
        assert.equal(normalizado?.categoria, categoria);
        assert.equal(normalizado?.sqlState, sqlState);
        assert.equal(normalizado?.mensagem.includes('conteudo clinico'), false);
    }
});

test('SQLSTATE desconhecido vira erro interno, não um timeout', () => {
    const normalizado = normalizarErroPostgres(erroPg('23505'));

    assert.equal(normalizado?.statusCode, 500);
    assert.equal(normalizado?.codigo, 'ERRO_BANCO_DADOS');
    assert.equal(normalizado?.categoria, 'erro_sql');
    assert.equal(normalizado?.mensagem, 'Erro interno no servidor.');
});

test('erros do pool e falhas de conexao recebem classificacoes distintas', () => {
    const pool = normalizarErroPostgres(
        Object.assign(new Error('pool reservado'), { name: 'KnexTimeoutError' }),
    );
    const rede = normalizarErroPostgres(
        Object.assign(new Error('socket reservado'), { code: 'ETIMEDOUT' }),
    );

    assert.equal(pool?.codigo, 'POOL_BANCO_TIMEOUT');
    assert.equal(pool?.categoria, 'pool_timeout');
    assert.equal(rede?.codigo, 'BANCO_DADOS_INDISPONIVEL');
    assert.equal(rede?.categoria, 'banco_indisponivel');
});
