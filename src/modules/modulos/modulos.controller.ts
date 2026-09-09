import type { NextFunction, Request, Response } from 'express';

import modulosService from './modulos.service.js';

class ModulosController {
    async listarHabilitadosPorOrganizacao(req: Request, res: Response, next: NextFunction) {
        try {
            const organizacaoId = req.auth?.organizacaoId;

            const modulos = await modulosService.listarHabilitadosPorOrganizacao(organizacaoId);

            return res.status(200).json({
                status: 'success',
                message: 'Módulos listados com sucesso.',
                data: modulos,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new ModulosController();
