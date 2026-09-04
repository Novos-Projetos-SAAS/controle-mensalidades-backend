import type { Request, Response, NextFunction } from 'express';

import saudeService from './saude.service.js';

class SaudeController {
    consultar(_req: Request, res: Response, next: NextFunction) {
        try {
            const resultado = saudeService.executar();

            return res.status(200).json(resultado);
        } catch (error) {
            next(error);
        }
    }
}

export default new SaudeController();
