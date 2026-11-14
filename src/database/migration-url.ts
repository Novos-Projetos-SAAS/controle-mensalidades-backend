import type { DatabaseEnvironment } from './database.config.js';

export function selecionarUrlMigrations(
    environment: DatabaseEnvironment,
    vars: NodeJS.ProcessEnv,
): string | undefined {
    if (environment === 'test') {
        return vars.DATABASE_URL_TEST;
    }

    if (environment === 'production') {
        return vars.DATABASE_URL_MIGRATIONS;
    }

    return vars.DATABASE_URL_MIGRATIONS || vars.DATABASE_URL;
}
