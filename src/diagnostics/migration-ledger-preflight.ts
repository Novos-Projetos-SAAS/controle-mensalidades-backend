/**
 * Preflight SOMENTE LEITURA para reconciliação de migrations entre branches.
 *
 * Uso: NODE_ENV=development npm run migrations:preflight -- --env development
 *
 * Nunca executa migrate:latest, migrate:rollback, SQL DDL ou altera o ledger.
 */
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import knex from 'knex';

import { criarConfiguracaoBanco } from '../database/database.config.js';
import { selecionarUrlMigrations } from '../database/migration-url.js';
import { compararLedgerMigrations } from '../database/migration-ledger-preflight.js';
import type { DatabaseEnvironment } from '../database/database.config.js';

async function executar() {
    const args = process.argv.slice(2);
    const posicao = args.indexOf('--env');
    const solicitado = posicao >= 0 ? args[posicao + 1] : undefined;
    const ambiente = process.env.NODE_ENV || 'development';

    if (!['development', 'test', 'production'].includes(ambiente) || solicitado !== ambiente) {
        throw new Error('Informe --env e NODE_ENV iguais (development/test/production).');
    }
    if (args.length !== 2 || posicao !== 0) {
        throw new Error('Uso: npm run migrations:preflight -- --env development');
    }
    const url = selecionarUrlMigrations(ambiente as DatabaseEnvironment, process.env);
    if (!url) throw new Error('URL de migrations não definida. Configure DATABASE_URL_MIGRATIONS, DATABASE_URL ou DATABASE_URL_TEST conforme o ambiente.');
    const cfg = criarConfiguracaoBanco(ambiente as DatabaseEnvironment, url);

    const pasta = resolve(process.cwd(), './src/database/migrations');
    const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.js')).sort();

    const connection = knex({
        ...cfg,
        pool: { min: 0, max: 1 },
    });

    try {
        const identificacao = await connection.raw(
            'SELECT current_database()::text AS banco, current_user::text AS papel',
        );
        const { banco, papel } = identificacao.rows[0] as { banco: string; papel: string };
        console.log(`Ambiente: ${ambiente} | Banco: ${banco} | Papel: ${papel}`);

        const tabela = await connection.schema.hasTable('knex_migrations');
        if (!tabela) {
            console.error('A tabela knex_migrations não existe neste banco.');
            process.exitCode = 2;
            return;
        }

        const registradas = (await connection('knex_migrations')
            .select('name')) as Array<{ name: string }>;
        const diff = compararLedgerMigrations(registradas.map((r) => r.name), arquivos);
        console.log(`Aplicadas: ${registradas.length} | Arquivos locais: ${arquivos.length}`);

        if (diff.registradasSemArquivo.length > 0) {
            console.error('BLOQUEIO — já aplicadas no banco, porém AUSENTES neste checkout:');
            for (const nome of diff.registradasSemArquivo) console.error(`  - ${nome}`);
        }
        if (diff.numerosReutilizados.length > 0) {
            console.error('BLOQUEIO — número lógico reutilizado em migrations do checkout:');
            for (const item of diff.numerosReutilizados) {
                console.error(`  - ${item.numero}: ${item.arquivos.join(', ')}`);
            }
        }
        if (diff.arquivosPendentes.length > 0) {
            console.log('PENDENTES (não aplicadas automaticamente):');
            for (const nome of diff.arquivosPendentes) console.log(`  - ${nome}`);
        }

        if (diff.registradasSemArquivo.length || diff.numerosReutilizados.length) {
            console.error(
                'Não execute migrate:latest neste banco. Recupere os arquivos ORIGINAIS ' +
                'das migrations aplicadas e preserve seus nomes; não edite knex_migrations.',
            );
            process.exitCode = 2;
        } else {
            console.log('Ledger compatível com os arquivos do checkout. Nenhuma alteração foi executada.');
        }
    } finally {
        await connection.destroy();
    }
}

executar().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : 'Não foi possível conferir as migrations.');
    process.exitCode = 1;
});
