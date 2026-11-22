import type { NextFunction, Request, Response } from 'express';

import areasNegocioService from './areas_negocio.service.js';
import { criarAreaDaOrganizacao, validarCriacaoArea } from './areas_negocio.creation.js';
import AppError from '../../shared/errors/AppError.js';

class AreasNegocioController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            const area = await criarAreaDaOrganizacao(
                req.auth.organizacaoId, req.auth.usuarioId, validarCriacaoArea(req.body),
            );
            return res.status(201).json({ status: 'success', data: area });
        } catch (error) {
            return next(error);
        }
    }

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
