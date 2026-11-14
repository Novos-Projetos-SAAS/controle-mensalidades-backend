import assert from 'node:assert/strict';
import test from 'node:test';

import { env } from '../../src/configuration/env.js';
import {
    criarConfiguracaoBanco,
    normalizarSslConnectionString,
} from '../../src/database/database.config.js';
import { selecionarUrlMigrations } from '../../src/database/migration-url.js';

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
    const conexao = config.connection as {
        connectionString: string;
        connectionTimeoutMillis: number;
        ssl?: unknown;
    };

    assert.equal(new URL(conexao.connectionString).searchParams.get('sslmode'), 'verify-full');
    assert.equal(conexao.connectionTimeoutMillis, env.DATABASE_CONNECTION_TIMEOUT_MS);
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

test('runtime usa DATABASE_URL e não seleciona a credencial de migrations', () => {
    const anteriores = {
        DATABASE_URL: process.env.DATABASE_URL,
        DATABASE_URL_MIGRATIONS: process.env.DATABASE_URL_MIGRATIONS,
    };

    process.env.DATABASE_URL = 'postgresql://runtime:senha@runtime.test/app?sslmode=require';
    process.env.DATABASE_URL_MIGRATIONS =
        'postgresql://migrations:senha@migration.test/app?sslmode=require';

    try {
        const config = criarConfiguracaoBanco('production');
        const connection = config.connection as { connectionString: string };

        assert.equal(new URL(connection.connectionString).hostname, 'runtime.test');
        assert.notEqual(new URL(connection.connectionString).hostname, 'migration.test');
    } finally {
        if (anteriores.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = anteriores.DATABASE_URL;

        if (anteriores.DATABASE_URL_MIGRATIONS === undefined)
            delete process.env.DATABASE_URL_MIGRATIONS;
        else process.env.DATABASE_URL_MIGRATIONS = anteriores.DATABASE_URL_MIGRATIONS;
    }
});

test('knexfile seleciona URL de migrations distinta por ambiente e não cai para runtime em produção', () => {
    const variaveis = {
        DATABASE_URL: 'postgresql://runtime:senha@runtime.test/app',
        DATABASE_URL_TEST: 'postgresql://test:senha@test.test/app_test',
        DATABASE_URL_MIGRATIONS: 'postgresql://migrations:senha@migrations.test/app',
    };

    assert.equal(
        selecionarUrlMigrations('production', variaveis),
        variaveis.DATABASE_URL_MIGRATIONS,
    );
    assert.equal(selecionarUrlMigrations('test', variaveis), variaveis.DATABASE_URL_TEST);
    assert.equal(
        selecionarUrlMigrations('development', variaveis),
        variaveis.DATABASE_URL_MIGRATIONS,
    );
    assert.equal(
        selecionarUrlMigrations('production', { DATABASE_URL: variaveis.DATABASE_URL }),
        undefined,
    );
});
