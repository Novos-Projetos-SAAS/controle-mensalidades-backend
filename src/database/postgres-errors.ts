export type ErroBancoNormalizado = {
    statusCode: number;
    codigo: string;
    mensagem: string;
    categoria: string;
    sqlState?: string;
};

function codigoErro(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return undefined;
    }

    return typeof error.code === 'string' ? error.code : undefined;
}

function nomeErro(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('name' in error)) {
        return undefined;
    }

    return typeof error.name === 'string' ? error.name : undefined;
}

function erroBancoIndisponivel(sqlState?: string): ErroBancoNormalizado {
    return {
        statusCode: 503,
        codigo: 'BANCO_DADOS_INDISPONIVEL',
        mensagem: 'Banco de dados temporariamente indisponível.',
        categoria: 'banco_indisponivel',
        ...(sqlState && { sqlState }),
    };
}

export function normalizarErroPostgres(error: unknown): ErroBancoNormalizado | undefined {
    if (nomeErro(error) === 'KnexTimeoutError') {
        return {
            statusCode: 503,
            codigo: 'POOL_BANCO_TIMEOUT',
            mensagem: 'Banco de dados temporariamente indisponível.',
            categoria: 'pool_timeout',
        };
    }

    const code = codigoErro(error);

    if (!code) {
        return undefined;
    }

    if (/^[0-9A-Z]{5}$/.test(code)) {
        if (code.startsWith('08') || ['57P01', '57P02', '57P03', '53300'].includes(code)) {
            return erroBancoIndisponivel(code);
        }

        switch (code) {
            case '25P03':
                return {
                    statusCode: 503,
                    codigo: 'TRANSACAO_BANCO_EXPIRADA',
                    mensagem: 'A operação no banco de dados expirou.',
                    categoria: 'transacao_ociosa_expirada',
                    sqlState: code,
                };
            case '57014':
                return {
                    statusCode: 503,
                    codigo: 'CONSULTA_BANCO_INTERROMPIDA',
                    mensagem: 'Operação no banco de dados foi interrompida.',
                    categoria: 'consulta_cancelada',
                    sqlState: code,
                };
            case '55P03':
                return {
                    statusCode: 503,
                    codigo: 'BANCO_DADOS_OCUPADO',
                    mensagem: 'Banco de dados temporariamente ocupado.',
                    categoria: 'espera_lock_expirada',
                    sqlState: code,
                };
            case '40P01':
                return {
                    statusCode: 503,
                    codigo: 'CONFLITO_TRANSACIONAL_BANCO',
                    mensagem: 'Operação concorrente interrompida; tente novamente mais tarde.',
                    categoria: 'deadlock',
                    sqlState: code,
                };
            default:
                return {
                    statusCode: 500,
                    codigo: 'ERRO_BANCO_DADOS',
                    mensagem: 'Erro interno no servidor.',
                    categoria: 'erro_sql',
                    sqlState: code,
                };
        }
    }

    if (
        ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'EPIPE'].includes(
            code,
        )
    ) {
        return erroBancoIndisponivel();
    }

    return undefined;
}
