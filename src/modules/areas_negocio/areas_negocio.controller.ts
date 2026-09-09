import type { NextFunction, Request, Response } from 'express';

import areasNegocioService from './areas_negocio.service.js';

class AreasNegocioController {
    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const organizacaoId = req.auth?.organizacaoId;

            const areas = await areasNegocioService.listarPorOrganizacao(organizacaoId!);

            return res.status(200).json(areas);
        } catch (error) {
            next(error);
        }
    }
}

export default new AreasNegocioController();
