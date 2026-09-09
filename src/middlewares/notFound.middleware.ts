import type { NextFunction, Request, Response } from 'express';

import AppError from '../shared/errors/AppError.js';

export default function notFound(req: Request, res: Response, next: NextFunction) {
    next(new AppError('Rota não encontrada.', 404, 'ROTA_NAO_ENCONTRADA'));
}
