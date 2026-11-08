import type { Knex } from 'knex';
import { env } from '../configuration/env.js';

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export function normalizarSslConnectionString(
    connectionString: string,
    exigirVerificacaoCertificado: boolean,
): string {
    let url: URL;

    try {
        url = new URL(connectionString);
    } catch {
        throw new Error('DATABASE_URL inválida; verifique o formato sem expor credenciais.');
    }

    const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
    const tlsSolicitado = sslmode !== undefined && sslmode !== 'disable';

    if (exigirVerificacaoCertificado || tlsSolicitado) {
        // Fixa a validação da CA e do hostname para não depender da semântica
        // transitória de "require" no driver pg-connection-string.
        url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
}

export function criarConfiguracaoBanco(
    environment: DatabaseEnvironment,
    connectionStringOverride?: string,
): Knex.Config {
    const databaseUrl =
        connectionStringOverride ??
        (environment === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL);

    if (environment === 'test' && process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('O ambiente de teste deve utilizar um banco exclusivo para testes.');
    }

    if (
        environment === 'test' &&
        process.env.DATABASE_URL_TEST &&
        process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
    ) {
        throw new Error('DATABASE_URL_TEST deve ser diferente do banco de desenvolvimento.');
    }

    if (!databaseUrl) {
        throw new Error(`DATABASE_URL não definida para o ambiente "${environment}".`);
    }

    const connectionString = normalizarSslConnectionString(
        databaseUrl,
        environment === 'production' || env.DB_SSL === 'true',
    );

    return {
        client: 'pg',

        connection: {
            connectionString,
        },

        acquireConnectionTimeout: env.DATABASE_POOL_ACQUIRE_TIMEOUT_MS,

        pool: {
            min: 2,
            max: 10,
        },
    };
}
