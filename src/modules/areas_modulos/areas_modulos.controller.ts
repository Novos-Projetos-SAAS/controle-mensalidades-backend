import type { NextFunction, Request, Response } from 'express';

import areasModulosService from './areas_modulos.service.js';

class AreasModulosController {
    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const organizacaoId = req.auth?.organizacaoId;

            const { areaNegocioId } = req.params;

            const modulos = await areasModulosService.listarHabilitadosPorArea(
                organizacaoId,
                areaNegocioId,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Módulos da área listados com sucesso.',
                data: modulos,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AreasModulosController();
