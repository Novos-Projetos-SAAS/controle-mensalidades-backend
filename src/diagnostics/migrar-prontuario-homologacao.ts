/**
 * Executa migrations via Knex somente no Neon isolado, após validação explícita.
 * Não usar em projetos de produção ou no branch padrão do banco.
 *
 * Arquivos já aplicados NÃO devem ser renomeados nem repetidos.
 */
import dotenv from 'dotenv';
import knex from 'knex';

dotenv.config({ path: '.env' });

async function main() {
    const environment = process.env.NODE_ENV ?? 'development';
    if (
        environment !== 'development' ||
        process.env.AMBIENTE_BANCO !== 'homologacao' ||
        process.env.CLINICAL_HOMOLOGATION_ENABLED !== 'true' ||
        process.env.CLINICAL_HOMOLOGATION_CONFIRMATION !== 'SOMENTE_DADOS_FICTICIOS'
    ) {
        throw new Error('Migrations clínicas exigem homologação explicitamente habilitada.');
    }

    const url = process.env.DATABASE_URL_MIGRATIONS;
    const hostEsperado = process.env.CLINICAL_HOMOLOGATION_EXPECTED_HOST;
    const dbEsperado = process.env.CLINICAL_HOMOLOGATION_EXPECTED_DATABASE;
    if (!url || !hostEsperado || !dbEsperado) {
        throw new Error(
            'Configure DATABASE_URL_MIGRATIONS, CLINICAL_HOMOLOGATION_EXPECTED_HOST e ' +
            'CLINICAL_HOMOLOGATION_EXPECTED_DATABASE antes de migrar.',
        );
    }

    const target = new URL(url);
    if (
        !['postgres:', 'postgresql:'].includes(target.protocol) ||
        target.hostname !== hostEsperado ||
        !target.hostname.endsWith('.neon.tech') ||
        target.hostname.includes('-pooler') ||
        decodeURIComponent(target.pathname.slice(1)) !== dbEsperado ||
        process.env.DB_SSL !== 'true'
    ) {
        throw new Error('Destino incorreto: utilize o host DIRECT do branch de homologação Neon, com DB_SSL=true.');
    }

    // Banco é checado ANTES de consultar o ledger e de qualquer escrita.
    const { criarConfiguracaoBanco } = await import('../database/database.config.js');
    const db = knex({
        ...criarConfiguracaoBanco('development', url),
        pool: { min: 0, max: 1 },
    });
    try {
        const info = await db.raw('SELECT current_database()::text AS db, current_user::text AS role');
        const row = info.rows[0] as { db: string; role: string } | undefined;
        if (!row || row.db !== dbEsperado) throw new Error('Banco consultado não corresponde ao banco esperado.');

        const { compararLedgerMigrations } = await import('../database/migration-ledger-preflight.js');
        const { readdir } = await import('node:fs/promises');
        const { resolve } = await import('node:path');
        const diretorio = resolve('src/database/migrations');
        const arquivos = (await readdir(diretorio)).filter((nome) => nome.endsWith('.js'));
        const table = await db.schema.hasTable('knex_migrations');
        if (!table) throw new Error('Ledger Knex ausente; banco não inicializado. Recusando migração.');

        const rows = await db('knex_migrations').select('name') as Array<{ name: string }>;
        const diff = compararLedgerMigrations(rows.map((v) => v.name), arquivos);
        if (diff.registradasSemArquivo.length || diff.numerosReutilizados.length) {
            throw new Error('Ledger incompatível com os arquivos. Execute migrations:preflight antes.');
        }

        // Não exibe URL, usuário, senha ou dados clínicos.
        console.log(`Migrations em homologação: ${row.db}; ${diff.arquivosPendentes.length} pendentes.`);
        const [batch, applied] = await db.migrate.latest({
            directory: diretorio,
            extension: 'js',
            tableName: 'knex_migrations',
        });
        console.log(`Lote ${batch}: ${applied.length} migrations aplicadas.`);
        const nomes = (await db('knex_migrations').whereIn('name', [
            '20261125120000_067_infinitepay_cobrancas.js',
            '20261125121000_068_documentos_clinicos_versionados.js',
            '20261125122000_069_vinculos_clinicos_pacientes.js',
            '20261125130000_070_campos_evolucao_fisioterapia.js',
        ]).select('name')) as Array<{ name: string }>;
        if (nomes.length !== 4) throw new Error('Faltam migrations 067/068/069/070 após execução.');
        console.log('Esquema de homologação preparado: 067/068/069/070.');
    } finally {
        await db.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falha de migração clínica.');
    process.exitCode = 1;
});
