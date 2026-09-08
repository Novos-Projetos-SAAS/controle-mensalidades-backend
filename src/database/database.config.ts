import type { Knex } from 'knex';

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export function criarConfiguracaoBanco(environment: DatabaseEnvironment): Knex.Config {
    const databaseUrl =
        environment === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;

    if (!databaseUrl) {
        throw new Error(`DATABASE_URL não definida para o ambiente "${environment}".`);
    }

    return {
        client: 'pg',

        connection: {
            connectionString: databaseUrl,

            ...(process.env.DB_SSL === 'true' && {
                ssl: {
                    rejectUnauthorized: false,
                },
            }),
        },

        pool: {
            min: 2,
            max: 10,
        },
    };
}
