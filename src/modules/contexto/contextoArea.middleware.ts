import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import contextoService from './contexto.service.js';

export default async function contextoArea(req: Request, _res: Response, next: NextFunction) {
    try {
        const areaNegocioIdHeader = req.headers['x-area-negocio-id'];

        if (!areaNegocioIdHeader || Array.isArray(areaNegocioIdHeader)) {
            throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
        }

        if (!req.auth) {
            throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
        }

        const area = await contextoService.resolverArea(
            req.auth.organizacaoId,
            areaNegocioIdHeader,
        );

        req.auth.areaNegocioId = area.id;

        next();
    } catch (error) {
        next(error);
    }
}
