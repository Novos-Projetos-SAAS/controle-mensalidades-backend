/**
 * Executa SOMENTE as migrations clínicas pendentes no projeto Neon
 * mensalidades-desenv, via Knex. Não migra outros bancos nem altera o
 * histórico de migrations manualmente.
 *
 * Exige confirmação explícita, host DIRECT exato e ledger íntegro.
 * Nunca execute com dados clínicos reais antes da revisão de segurança.
 */
import dotenv from 'dotenv';
import knex from 'knex';

dotenv.config({ path: '.env' });

const hostDesenv = 'ep-lively-wildflower-ac3t3qcu.sa-east-1.aws.neon.tech';
const arquivoInfinitePay = '20261125120000_067_infinitepay_cobrancas.js';
const migrationsClinicas = [
    '20261125121000_068_documentos_clinicos_versionados.js',
    '20261125122000_069_vinculos_clinicos_pacientes.js',
    '20261125130000_070_campos_evolucao_fisioterapia.js',
];

export function validarDestinoProntuarioDesenv(
    vars: NodeJS.ProcessEnv,
    url: string | undefined,
): URL {
    if (
        vars.NODE_ENV !== 'development' ||
        vars.AMBIENTE_BANCO !== 'desenv' ||
        vars.CLINICAL_DESENV_MIGRATION_CONFIRMATION !== 'APLICAR_PRONTUARIO_SOMENTE_DESENV' ||
        vars.DB_SSL !== 'true' ||
        !url
    ) {
        throw new Error(
            'Exigidos NODE_ENV=development, AMBIENTE_BANCO=desenv, DB_SSL=true, ' +
            'DATABASE_URL_MIGRATIONS e confirmação de migration clínica no desenv.',
        );
    }

    const destino = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(destino.protocol) ||
        destino.hostname !== hostDesenv ||
        destino.hostname.includes('-pooler') ||
        decodeURIComponent(destino.pathname.slice(1)) !== 'neondb' ||
        (destino.port && destino.port !== '5432')
    ) {
        throw new Error(
            'Destino não autorizado. Use exclusivamente o host DIRECT de mensalidades-desenv/neondb.',
        );
    }
    return destino;
}

async function executar() {
    const url = process.env.DATABASE_URL_MIGRATIONS;
    validarDestinoProntuarioDesenv(process.env, url);

    const { criarConfiguracaoBanco } = await import('../database/database.config.js');
    const { compararLedgerMigrations } = await import('../database/migration-ledger-preflight.js');
    const { readdir } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const dir = resolve('src/database/migrations');
    const arquivos = (await readdir(dir)).filter((nome) => nome.endsWith('.js'));
    const db = knex({
        ...criarConfiguracaoBanco('development', url),
        pool: { min: 0, max: 1 },
    });

    try {
        const result = await db.raw(
            'SELECT current_database()::text AS banco, current_user::text AS papel',
        );
        if (result.rows[0]?.banco !== 'neondb') {
            throw new Error('Banco real não corresponde ao banco esperado.');
        }
        if (!(await db.schema.hasTable('knex_migrations'))) {
            throw new Error('Ledger do Knex não encontrado. Migração cancelada.');
        }

        const linhas = await db('knex_migrations').select('name') as Array<{ name: string }>;
        const registradas = linhas.map((v) => v.name);
        if (!registradas.includes(arquivoInfinitePay)) {
            throw new Error('A migration 067 original da InfinitePay deve estar aplicada primeiro.');
        }
        const diff = compararLedgerMigrations(registradas, arquivos);
        if (diff.registradasSemArquivo.length || diff.numerosReutilizados.length) {
            throw new Error('Histórico de migrations incompatível; não execute migration no desenv.');
        }
        if (diff.arquivosPendentes.some((nome) => !migrationsClinicas.includes(nome))) {
            throw new Error('Existem migrations não clínicas pendentes. Migração cancelada.');
        }
        if (!migrationsClinicas.every((nome) => arquivos.includes(nome))) {
            throw new Error('Checkout incompleto: arquivos clínicos 068, 069 e 070 obrigatórios.');
        }

        console.log(
            'Destino: mensalidades-desenv/neondb (host direto validado). ' +
            `${diff.arquivosPendentes.length} migration(s) clínica(s) pendente(s).`,
        );
        if (diff.arquivosPendentes.length > 0) {
            const [lote, aplicadas] = await db.migrate.latest({
                directory: dir,
                extension: 'js',
                tableName: 'knex_migrations',
            });
            console.log(`Lote ${lote}: ${aplicadas.length} migration(s) aplicadas.`);
        }

        const conferidas = await db('knex_migrations')
            .whereIn('name', [arquivoInfinitePay, ...migrationsClinicas])
            .select('name') as Array<{ name: string }>;
        if (conferidas.length !== 4) {
            throw new Error('Verificação final falhou: faltam migrations 067 a 070.');
        }
        console.log('Concluído: migrations 067–070 presentes no ledger do desenv.');
    } finally {
        await db.destroy();
    }
}

if (process.argv[1] && /migrar-prontuario-desenv\.(ts|js)$/.test(process.argv[1])) {
    executar().catch((erro: unknown) => {
        console.error(erro instanceof Error ? erro.message : 'Falha na migration do desenv.');
        process.exitCode = 1;
    });
}
