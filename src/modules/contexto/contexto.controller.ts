import type { NextFunction, Request, Response } from 'express';

class ContextoController {
    async obter(req: Request, res: Response, next: NextFunction) {
        try {
            return res.status(200).json({
                status: 'success',
                message: 'Contexto carregado com sucesso.',
                data: {
                    usuarioId: req.auth?.usuarioId,
                    organizacaoId: req.auth?.organizacaoId,
                    areaNegocioId: req.auth?.areaNegocioId,
                    perfil: req.auth?.perfil,
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new ContextoController();
