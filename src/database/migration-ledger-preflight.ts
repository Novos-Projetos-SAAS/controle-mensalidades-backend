/**
 * Comparação somente leitura entre o ledger Knex e os arquivos do checkout.
 * Nunca inventa uma migration ausente nem altera knex_migrations.
 */
export type MigrationLedgerDiff = {
    registradasSemArquivo: string[];
    arquivosPendentes: string[];
    numerosReutilizados: Array<{ numero: string; arquivos: string[] }>;
};

function numeroLogico(nome: string): string | null {
    const match = /^\d{14}_(\d{3})_.+\.js$/.exec(nome);
    return match?.[1] ?? null;
}

export function compararLedgerMigrations(
    registradas: readonly string[],
    arquivos: readonly string[],
): MigrationLedgerDiff {
    const emDisco = new Set(arquivos);
    const noBanco = new Set(registradas);
    const agrupadas = new Map<string, string[]>();

    for (const arquivo of arquivos) {
        const numero = numeroLogico(arquivo);
        if (!numero) continue;
        const existentes = agrupadas.get(numero) ?? [];
        existentes.push(arquivo);
        agrupadas.set(numero, existentes);
    }

    return {
        registradasSemArquivo: [...noBanco].filter((nome) => !emDisco.has(nome)).sort(),
        arquivosPendentes: [...emDisco].filter((nome) => !noBanco.has(nome)).sort(),
        numerosReutilizados: [...agrupadas.entries()]
            .filter(([, nomes]) => nomes.length > 1)
            .map(([numero, nomes]) => ({ numero, arquivos: nomes.sort() }))
            .sort((a, b) => a.numero.localeCompare(b.numero)),
    };
}
