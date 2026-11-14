import type { CorsOptions } from 'cors';

export function resolverOrigensCors(
    configuracao: string | undefined,
    ambiente: 'development' | 'test' | 'production',
): Set<string> {
    if (configuracao === undefined) {
        return new Set(ambiente === 'production' ? [] : ['http://localhost:3000']);
    }

    const origens = configuracao
        .split(',')
        .map((origem) => origem.trim())
        .filter(Boolean);

    if (origens.includes('*')) {
        throw new Error('CORS_ALLOWED_ORIGINS não aceita wildcard.');
    }

    for (const origem of origens) {
        let url: URL;

        try {
            url = new URL(origem);
        } catch {
            throw new Error('CORS_ALLOWED_ORIGINS contém uma origem inválida.');
        }

        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.origin !== origem ||
            url.username ||
            url.password
        ) {
            throw new Error('CORS_ALLOWED_ORIGINS deve conter somente origens HTTP(S) exatas.');
        }
    }

    return new Set(origens);
}

export function criarOpcoesCors(origens: ReadonlySet<string>): CorsOptions {
    return {
        origin(origem, callback) {
            callback(null, Boolean(origem && origens.has(origem)));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'X-Organizacao-Id',
            'X-Area-Negocio-Id',
            'Idempotency-Key',
        ],
        exposedHeaders: ['X-Request-Id'],
        maxAge: 600,
    };
}
