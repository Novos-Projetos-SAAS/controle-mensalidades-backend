import assert from 'node:assert/strict';
import test from 'node:test';

import {
    criarConfiguracaoBanco,
    normalizarSslConnectionString,
} from '../../src/database/database.config.js';

test('SSL PostgreSQL normaliza modos legados para verify-full e preserva parametros', () => {
    const connectionString =
        'postgresql://usuario:senha-reservada@db.exemplo.test/clinica?sslmode=require&channel_binding=require&sslrootcert=%2Fetc%2Fssl%2Fca.pem';
    const normalizada = normalizarSslConnectionString(connectionString, false);
    const url = new URL(normalizada);

    assert.equal(url.searchParams.get('sslmode'), 'verify-full');
    assert.equal(url.searchParams.get('channel_binding'), 'require');
    assert.equal(url.searchParams.get('sslrootcert'), '/etc/ssl/ca.pem');
    assert.equal(url.username, 'usuario');
    assert.equal(url.password, 'senha-reservada');
});

test('SSL forcado substitui sslmode disable em ambiente seguro e preserva disable local', () => {
    const connectionString = 'postgresql://usuario:senha@db.exemplo.test/clinica?sslmode=disable';

    assert.equal(
        new URL(normalizarSslConnectionString(connectionString, false)).searchParams.get('sslmode'),
        'disable',
    );
    assert.equal(
        new URL(normalizarSslConnectionString(connectionString, true)).searchParams.get('sslmode'),
        'verify-full',
    );
});

test('configuração de produção exige verify-full sem combinar ssl object com connectionString', () => {
    const config = criarConfiguracaoBanco(
        'production',
        'postgresql://usuario:senha@db.exemplo.test/clinica?sslmode=require',
    );
    const conexao = config.connection as { connectionString: string; ssl?: unknown };

    assert.equal(new URL(conexao.connectionString).searchParams.get('sslmode'), 'verify-full');
    assert.equal(conexao.ssl, undefined);
});

test('erro de URL invalida nao inclui valor ou credenciais', () => {
    const urlSecreta = 'URL_INVALIDA_COM_CREDENCIAL_RESERVADA';

    assert.throws(
        () => normalizarSslConnectionString(urlSecreta, true),
        (error: unknown) =>
            error instanceof Error &&
            error.message.includes('DATABASE_URL inválida') &&
            !error.message.includes(urlSecreta),
    );
});
