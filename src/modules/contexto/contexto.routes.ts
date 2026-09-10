// src/modules/contexto/contexto.routes.ts

import { Router } from 'express';

import verificarUsuario from '../../middlewares/verifyUser.middleware.js';
import verificarOrganizacao from '../../middlewares/verifyOrganization.middleware.js';

import contextoArea from './contextoArea.middleware.js';
import contextoController from './contexto.controller.js';

const contextoRoutes = Router();

// Middleware de autenticação e organização para todas as rotas de contexto.
contextoRoutes.use(verificarUsuario, verificarOrganizacao);

// ROTA GET /contexto
contextoRoutes.get('/', contextoArea, contextoController.obter);

export default contextoRoutes;
