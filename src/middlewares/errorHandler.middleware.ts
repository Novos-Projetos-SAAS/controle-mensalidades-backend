import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { env } from '../configuration/env.js';

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
    const statusCode = error.statusCode ?? 500;

    const situacao = statusCode >= 500 ? 'erro' : 'falha';

    const mensagem = error.message || 'Erro interno do servidor';

    const codigo = error.code ?? (statusCode >= 500 ? 'ERRO_INTERNO' : null);

    const timestamp = new Date().toISOString();

    if (statusCode < 500) {
        if (statusCode === 409) {
            console.warn(
                `${logSymbols.warning} ${chalk.yellow(
                    `[${timestamp}] Conflito em ${req.method} ${req.originalUrl}: ${mensagem}`,
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

    console.error(
        `\n${logSymbols.error} ${chalk.red(`[${timestamp}] Erro em ${req.method} ${req.originalUrl}`)}`,
    );

    console.error(chalk.red(`Mensagem: ${mensagem}`));

    console.error(chalk.red(`Request ID: ${req.requestId}`));

    if (env.NODE_ENV !== 'production') {
        console.error(chalk.red(error.stack));
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
