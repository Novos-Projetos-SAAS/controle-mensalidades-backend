import type { NextFunction, Request, Response } from 'express';
import AppError from '../../shared/errors/AppError.js';
import linhaTempoClinicaService from './prontuario.timeline.service.js';
import { validarHistoricoPacienteId, validarLimiteHistorico } from './prontuario.timeline.validator.js';

class ProntuarioTimelineController {
    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth?.usuarioId || !req.auth.organizacaoId || !req.auth.areaNegocioId) {
                throw new AppError(
                    'Autenticação e contexto clínico necessários.',
                    401,
                    'AUTENTICACAO_NECESSARIA',
                );
            }

            const dados = await linhaTempoClinicaService.listar(
                {
                    usuarioId: req.auth.usuarioId,
                    organizacaoId: req.auth.organizacaoId,
                    areaNegocioId: req.auth.areaNegocioId,
                },
                validarHistoricoPacienteId(req.params.pacienteId),
                validarLimiteHistorico(req.query),
                req.requestId,
            );
            return res.status(200).json({ data: dados });
        } catch (error) {
            next(error);
        }
    }
}

export default new ProntuarioTimelineController();
