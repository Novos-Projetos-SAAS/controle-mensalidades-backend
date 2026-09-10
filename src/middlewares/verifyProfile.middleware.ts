import type { NextFunction, Request, Response } from 'express';

import AppError from '../shared/errors/AppError.js';

export default function verifyProfile(...perfisPermitidos: string[]) {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            if (!perfisPermitidos.includes(req.auth.perfil)) {
                throw new AppError(
                    'Usuário não possui permissão para esta operação.',
                    403,
                    'PERFIL_NAO_AUTORIZADO',
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}
