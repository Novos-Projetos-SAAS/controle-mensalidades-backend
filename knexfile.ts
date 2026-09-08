import dotenv from 'dotenv';

import type { Knex } from 'knex';

type Environment = 'development' | 'test' | 'production';

const environment = (process.env.NODE_ENV || 'development') as Environment;

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

function obterVariavelObrigatoria(nome: string): string {
    const valor = process.env[nome];

    if (!valor) {
        throw new Error(`Variável de ambiente "${nome}" não definida.`);
    }

    return valor;
}

function criarConfiguracaoConexao(): NonNullable<Knex.Config['connection']> {
    const databaseUrl =
        environment === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

    if (databaseUrl) {
        return {
            connectionString: databaseUrl,

            ...(process.env.DB_SSL === 'true' && {
                ssl: {
                    rejectUnauthorized: false,
                },
            }),
        };
    }

    return {
        host: obterVariavelObrigatoria('DB_HOST'),
        port: Number(process.env.DB_PORT || 5432),
        user: obterVariavelObrigatoria('DB_USER'),
        password: obterVariavelObrigatoria('DB_PASSWORD'),
        database: obterVariavelObrigatoria('DB_NAME'),

        ...(process.env.DB_SSL === 'true' && {
            ssl: {
                rejectUnauthorized: false,
            },
        }),
    };
}

const connection = criarConfiguracaoConexao();

const configuracaoBase: Knex.Config = {
    client: 'pg',

    connection,

    pool: {
        min: 2,
        max: 10,
    },

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

const configuracoes: Record<Environment, Knex.Config> = {
    development: {
        ...configuracaoBase,
    },

    test: {
        ...configuracaoBase,
    },

    production: {
        ...configuracaoBase,
    },
};

export default configuracoes;
