import type { NextFunction, Request, Response } from 'express';

import acessoModulosService from '../modules/acesso_modulos/acesso_modulos.service.js';

export default function verificarModulo(codigoModulo: string) {
    return async function (req: Request, _res: Response, next: NextFunction) {
        try {
            await acessoModulosService.verificar(
                req.auth?.organizacaoId,
                req.auth?.areaNegocioId,
                codigoModulo,
            );

            next();
        } catch (error) {
            next(error);
        }
    };
}
