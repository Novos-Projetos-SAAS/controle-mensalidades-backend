import { Router } from 'express';

import areasNegociosController from './areas_negocio.controller.js';
import verificarToken from '../../middlewares/verifyToken.middleware.js';

const areasNegocioRoutes = Router();

// Middleware de autenticação para todas as rotas de áreas de negócio.
areasNegocioRoutes.use(verificarToken);

// ROTA GET /business-areas
areasNegocioRoutes.get('/', areasNegociosController.listar);

export default areasNegocioRoutes;
