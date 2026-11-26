import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { env } from '../configuration/env.js';
import { normalizarErroPostgres } from '../database/postgres-errors.js';

import type { Request, Response, NextFunction } from 'express';

type ErroHttp = Error & {
    statusCode?: number;
    code?: string | null;
    acao?: string | null;
    isOperational?: boolean;
};

export default async function errorHandler(
    error: ErroHttp,
    req: Request,
    res: Response,
    _next: NextFunction,
) {
    const erroBanco = normalizarErroPostgres(error);
    const statusCode = erroBanco?.statusCode ?? error.statusCode ?? 500;

    const situacao = statusCode >= 500 ? 'erro' : 'falha';

    const mensagem = erroBanco?.mensagem ?? (error.message || 'Erro interno do servidor');

    const codigo = erroBanco?.codigo ?? error.code ?? (statusCode >= 500 ? 'ERRO_INTERNO' : null);

    const timestamp = new Date().toISOString();
    const caminho = (req.originalUrl.split('?')[0] || req.path).replace(
        /(\/pagamentos\/publico\/)[^/]+/g,
        '$1[privado]',
    );

    if (statusCode < 500) {
        if (statusCode === 409) {
            console.warn(
                `${logSymbols.warning} ${chalk.yellow(
                    `[${timestamp}] Conflito em ${req.method} ${caminho}: ${mensagem}`,
                )}`,
            );
        }

        return res.status(statusCode).json({
            situacao,
            mensagem,

            ...(codigo && {
                codigo,
            }),

            request_id: req.requestId,
        });
    }

    if (erroBanco) {
        console.error(
            `${logSymbols.error} ${chalk.red(
                `[${timestamp}] Falha PostgreSQL (${erroBanco.categoria}) em ${req.method} ${caminho}; SQLSTATE=${erroBanco.sqlState ?? 'indisponível'}; requestId=${req.requestId}`,
            )}`,
        );
    } else {
        console.error(
            `\n${logSymbols.error} ${chalk.red(`[${timestamp}] Erro em ${req.method} ${caminho}`)}`,
        );

        console.error(chalk.red(`Mensagem: ${mensagem}`));

        console.error(chalk.red(`Request ID: ${req.requestId}`));

        if (env.NODE_ENV !== 'production') {
            console.error(chalk.red(error.stack));
        }
    }

    console.error(chalk.gray('--------------------------------------------------\n'));

    /*
     * FUTURO:
     *
     * Quando Knex + tabela logs_erros estiverem prontos,
     * entra aqui o erroService.registrar().
     */

    return res.status(statusCode).json({
        situacao,

        mensagem: env.NODE_ENV === 'production' ? 'Erro interno no servidor.' : mensagem,

        codigo,

        request_id: req.requestId,
    });
}
