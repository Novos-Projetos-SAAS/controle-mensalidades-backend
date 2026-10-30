import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verificarModulo from '../../middlewares/verifyModule.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';

import agendamentosController from './agendamentos.controller.js';

const agendamentosRoutes = Router();

agendamentosRoutes.use(
    verifyUser,
    verifyOrganization,
    contextoArea,
    verificarModulo('AGENDA'),
    // Decisão do MVP: a recepção (OPERADOR) pode ler e escrever a agenda diária.
    verifyProfile('ADMINISTRADOR', 'OPERADOR'),
);

agendamentosRoutes.post('/', agendamentosController.criar);
agendamentosRoutes.get('/', agendamentosController.listar);
agendamentosRoutes.get('/:agendamentoId', agendamentosController.buscarPorId);
agendamentosRoutes.patch('/:agendamentoId/confirmar', agendamentosController.confirmar);
agendamentosRoutes.patch('/:agendamentoId/concluir', agendamentosController.concluir);
agendamentosRoutes.patch('/:agendamentoId/cancelar', agendamentosController.cancelar);
agendamentosRoutes.patch('/:agendamentoId', agendamentosController.atualizar);

export default agendamentosRoutes;
