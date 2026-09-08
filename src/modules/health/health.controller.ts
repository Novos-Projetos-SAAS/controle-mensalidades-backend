import type { Request, Response, NextFunction } from 'express';

import healthService from './health.service.js';

class HealthController {
    consultar(_req: Request, res: Response, next: NextFunction) {
        try {
            const resultado = healthService.executar();

            return res.status(200).json(resultado);
        } catch (error) {
            next(error);
        }
    }
}

export default new HealthController();
