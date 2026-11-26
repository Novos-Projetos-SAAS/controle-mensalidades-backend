import { Router } from 'express';

import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import { exigirAcessoClinicoDeHomologacao } from '../prontuario/prontuario.homologacao.middleware.js';
import prontuarioTimelineController from './prontuario.timeline.controller.js';
import pacientesVinculadosController from './prontuario.pacientes.controller.js';

const prontuarioTimelineRoutes = Router();

// Intencionalmente FORA de /api/v1 até homologação dos controles clínicos.
// O roteador também bloqueia qualquer montagem acidental por terceiros.
export const exigirHomologacaoProntuario = exigirAcessoClinicoDeHomologacao;

prontuarioTimelineRoutes.use(
    verifyUser, verifyOrganization, contextoArea, exigirHomologacaoProntuario,
);

prontuarioTimelineRoutes.get('/identidade', pacientesVinculadosController.identidade);
prontuarioTimelineRoutes.get('/pacientes', pacientesVinculadosController.listar);
prontuarioTimelineRoutes.get('/pacientes/:pacienteId/historico', prontuarioTimelineController.listar);

export default prontuarioTimelineRoutes;
