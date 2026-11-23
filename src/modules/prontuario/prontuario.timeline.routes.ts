import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import AppError from '../../shared/errors/AppError.js';
import prontuarioTimelineController from './prontuario.timeline.controller.js';

const prontuarioTimelineRoutes = Router();

// Intencionalmente FORA de /api/v1 até homologação dos controles clínicos.
// O roteador também bloqueia qualquer montagem acidental por terceiros.
export function exigirHomologacaoProntuario(_req: Request, _res: Response, next: NextFunction) {
    next(new AppError(
        'Prontuário indisponível até homologação.',
        403,
        'ACESSO_CLINICO_NAO_CONFIGURADO',
    ));
}

prontuarioTimelineRoutes.use(
    verifyUser, verifyOrganization, contextoArea, exigirHomologacaoProntuario,
);

prontuarioTimelineRoutes.get('/pacientes/:pacienteId/historico', prontuarioTimelineController.listar);

export default prontuarioTimelineRoutes;
