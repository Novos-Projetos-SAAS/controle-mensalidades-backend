import { Router } from 'express';

import verificarToken from '../../middlewares/verifyToken.middleware.js';

import contextoArea from './contextoArea.middleware.js';
import contextoController from './contexto.controller.js';

const contextoRoutes = Router();

// Middleware de autenticação para todas as rotas de contexto.
contextoRoutes.use(verificarToken);

// ROTA GET /contexto
contextoRoutes.get('/', contextoArea, contextoController.obter);

export default contextoRoutes;
