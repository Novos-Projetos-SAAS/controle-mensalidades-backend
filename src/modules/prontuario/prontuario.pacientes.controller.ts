import type { NextFunction, Request, Response } from 'express';
import AppError from '../../shared/errors/AppError.js';
import pacientesVinculadosService from './prontuario.pacientes.service.js';
import { validarPaginacaoPacientesClinicos } from './prontuario.pacientes.validator.js';

class PacientesVinculadosController {
    async identidade(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth?.usuarioId || !req.auth.organizacaoId || !req.auth.areaNegocioId) {
                throw new AppError('Autenticação e contexto clínico necessários.', 401, 'AUTENTICACAO_NECESSARIA');
            }
            const resultado = await pacientesVinculadosService.identidade({
                usuarioId: req.auth.usuarioId,
                organizacaoId: req.auth.organizacaoId,
                areaNegocioId: req.auth.areaNegocioId,
            }, req.requestId);
            return res.status(200).json({ data: resultado });
        } catch (erro) {
            next(erro);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth?.usuarioId || !req.auth.organizacaoId || !req.auth.areaNegocioId) {
                throw new AppError('Autenticação e contexto clínico necessários.', 401, 'AUTENTICACAO_NECESSARIA');
            }
            const { pagina, limite } = validarPaginacaoPacientesClinicos(req.query);
            const dados = await pacientesVinculadosService.listar({
                usuarioId: req.auth.usuarioId,
                organizacaoId: req.auth.organizacaoId,
                areaNegocioId: req.auth.areaNegocioId,
            }, pagina, limite, req.requestId);

            return res.status(200).json({ data: dados });
        } catch (erro) {
            next(erro);
        }
    }
}

export default new PacientesVinculadosController();
