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

    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
        throw new Error('DATABASE_URL inválida; informe uma conexão PostgreSQL.');
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
