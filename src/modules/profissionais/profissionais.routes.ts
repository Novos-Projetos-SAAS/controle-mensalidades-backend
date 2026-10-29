import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verificarModulo from '../../middlewares/verifyModule.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';

import profissionaisController from './profissionais.controller.js';

const profissionaisRoutes = Router();

// Middleware de autenticação, organização, área e módulo para todas as rotas de profissionais.
profissionaisRoutes.use(verifyUser, verifyOrganization, contextoArea, verificarModulo('AGENDA'));

// ROTA POST /profissionais
profissionaisRoutes.post('/', verifyProfile('ADMINISTRADOR'), profissionaisController.criar);

// ROTA GET /profissionais
profissionaisRoutes.get('/', profissionaisController.listar);

// ROTA GET /profissionais/:profissionalId
profissionaisRoutes.get('/:profissionalId', profissionaisController.buscarPorId);

// ROTA PATCH /profissionais/:profissionalId/inativar
profissionaisRoutes.patch(
    '/:profissionalId/inativar',
    verifyProfile('ADMINISTRADOR'),
    profissionaisController.inativar,
);

// ROTA PATCH /profissionais/:profissionalId/reativar
profissionaisRoutes.patch(
    '/:profissionalId/reativar',
    verifyProfile('ADMINISTRADOR'),
    profissionaisController.reativar,
);

// ROTA PATCH /profissionais/:profissionalId
profissionaisRoutes.patch(
    '/:profissionalId',
    verifyProfile('ADMINISTRADOR'),
    profissionaisController.atualizar,
);

export default profissionaisRoutes;
