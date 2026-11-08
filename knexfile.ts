import dotenv from 'dotenv';

import type { Knex } from 'knex';

import { env } from './src/configuration/env.js';
import {
    criarConfiguracaoBanco,
    type DatabaseEnvironment,
} from './src/database/database.config.js';

const environment = env.NODE_ENV as DatabaseEnvironment;

dotenv.config({
    path: environment === 'test' ? '.env.test' : '.env',
});

if (environment === 'test' && process.env.AMBIENTE_BANCO !== 'teste') {
    throw new Error('O ambiente de teste deve utilizar um banco exclusivo para testes.');
}

if (environment === 'test') {
    const variaveisDesenvolvimento: Record<string, string> = {};

    dotenv.config({
        path: '.env',
        processEnv: variaveisDesenvolvimento,
    });

    if (
        process.env.DATABASE_URL_TEST &&
        process.env.DATABASE_URL_TEST === variaveisDesenvolvimento.DATABASE_URL
    ) {
        throw new Error(
            'DATABASE_URL_TEST deve apontar para um banco diferente do desenvolvimento.',
        );
    }
}

const databaseUrl =
    environment === 'test'
        ? process.env.DATABASE_URL_TEST
        : environment === 'production'
          ? process.env.DATABASE_URL_MIGRATIONS
          : process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;

if (environment === 'production' && !databaseUrl) {
    throw new Error('DATABASE_URL_MIGRATIONS é obrigatória para executar migrations em produção.');
}

function obterVariavelObrigatoria(nome: string): string {
    const valor = process.env[nome];

    if (!valor) {
        throw new Error(`Variável de ambiente "${nome}" não definida.`);
    }

    return valor;
}

function obterPortaBanco(): number {
    const porta = Number(process.env.DB_PORT || 5432);

    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
        throw new Error('DB_PORT inválida; informe uma porta entre 1 e 65535.');
    }

    return porta;
}

const databaseConfig = databaseUrl
    ? criarConfiguracaoBanco(environment, databaseUrl)
    : ({
          client: 'pg' as const,
          connection: {
              host: obterVariavelObrigatoria('DB_HOST'),
              port: obterPortaBanco(),
              user: obterVariavelObrigatoria('DB_USER'),
              password: obterVariavelObrigatoria('DB_PASSWORD'),
              database: obterVariavelObrigatoria('DB_NAME'),
              ...((env.DB_SSL === 'true' || environment === 'production') && {
                  ssl: {
                      rejectUnauthorized: true,
                  },
              }),
          },
          acquireConnectionTimeout: env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,
          pool: {
              min: 2,
              max: 10,
          },
      } satisfies Knex.Config);

const configuracaoBase: Knex.Config = {
    ...databaseConfig,
    migrations: {
        directory: './src/database/migrations',
        tableName: 'knex_migrations',
        extension: 'js',
    },
    seeds: {
        directory: './src/database/seeds',
        extension: 'ts',
    },
};

const configuracoes: Record<DatabaseEnvironment, Knex.Config> = {
    development: { ...configuracaoBase },
    test: { ...configuracaoBase },
    production: { ...configuracaoBase },
};

export default configuracoes;
