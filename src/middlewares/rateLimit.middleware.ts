import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

import { env } from '../configuration/env.js';
import AppError from '../shared/errors/AppError.js';

const isDev = env.NODE_ENV === 'development';

function enviarErroRateLimit(mensagem: string, codigo: string) {
    return (_req: Request, _res: Response, next: NextFunction) => {
        next(new AppError(mensagem, 429, codigo));
    };
}

export const limitadorGeral = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => {
        if (isDev || req.method === 'OPTIONS') {
            return true;
        }

        return (
            req.originalUrl === '/api/v1/health' || req.originalUrl.startsWith('/api/v1/health?')
        );
    },
    handler: enviarErroRateLimit(
        'Muitas requisições foram realizadas em pouco tempo. Aguarde alguns minutos e tente novamente.',
        'MUITAS_REQUISICOES',
    ),
});

export const limitadorLogin = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: enviarErroRateLimit(
        'Muitas tentativas de login. Por segurança, tente novamente em 1 hora.',
        'MUITAS_TENTATIVAS_LOGIN',
    ),
});

export const limitadorCadastro = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: enviarErroRateLimit(
        'Limite de criação de contas atingido para hoje.',
        'LIMITE_CADASTRO_ATINGIDO',
    ),
});
