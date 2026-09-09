import { Router } from 'express';

import modulosController from './modulos.controller.js';
import verificarToken from '../../middlewares/verifyToken.middleware.js';

const modulosRouter = Router();

// Middleware de autenticação para todas as rotas de módulos.
modulosRouter.use(verificarToken);

// ROTA GET /modulos
modulosRouter.get('/', modulosController.listarHabilitadosPorOrganizacao);

export default modulosRouter;
