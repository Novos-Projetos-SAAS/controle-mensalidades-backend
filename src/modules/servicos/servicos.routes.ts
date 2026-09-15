import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verificarModulo from '../../middlewares/verifyModule.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';

import servicosController from './servicos.controller.js';

const servicosRoutes = Router();

// Middleware de autenticação, organização, área e módulo para todas as rotas de serviços.
servicosRoutes.use(verifyUser, verifyOrganization, contextoArea, verificarModulo('AGENDA'));

// ROTA GET /servicos
servicosRoutes.get('/', servicosController.listar);

// ROTA POST /servicos
servicosRoutes.post('/', verifyProfile('ADMINISTRADOR'), servicosController.criar);

// ROTA GET /servicos/:servicoId
servicosRoutes.get('/:servicoId', servicosController.buscarPorId);

// ROTA PATCH /servicos/:servicoId/inativar
servicosRoutes.patch(
    '/:servicoId/inativar',
    verifyProfile('ADMINISTRADOR'),
    servicosController.inativar,
);

// ROTA PATCH /servicos/:servicoId/reativar
servicosRoutes.patch(
    '/:servicoId/reativar',
    verifyProfile('ADMINISTRADOR'),
    servicosController.reativar,
);

// ROTA PATCH /servicos/:servicoId
servicosRoutes.patch('/:servicoId', verifyProfile('ADMINISTRADOR'), servicosController.atualizar);

export default servicosRoutes;
