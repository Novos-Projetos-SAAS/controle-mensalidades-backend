// src/modules/modulos/modulos.routes.ts

import { Router } from 'express';

import verificarUsuario from '../../middlewares/verifyUser.middleware.js';
import verificarOrganizacao from '../../middlewares/verifyOrganization.middleware.js';

import modulosController from './modulos.controller.js';

const modulosRouter = Router();

// Middleware de autenticação e organização para todas as rotas de módulos.
modulosRouter.use(verificarUsuario, verificarOrganizacao);

// ROTA GET /modulos
modulosRouter.get('/', modulosController.listarHabilitadosPorOrganizacao);

export default modulosRouter;
