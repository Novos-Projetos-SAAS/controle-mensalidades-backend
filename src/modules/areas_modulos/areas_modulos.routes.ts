import { Router } from 'express';

import verificarToken from '../../middlewares/verifyToken.middleware.js';

import areasModulosController from './areas_modulos.controller.js';

const areasModulosRoutes = Router();

// Middleware de autenticação para todas as rotas de módulos por área.
areasModulosRoutes.use(verificarToken);

// ROTA GET /areas-negocio/:areaNegocioId/modulos
areasModulosRoutes.get('/:areaNegocioId/modulos', areasModulosController.listar);

export default areasModulosRoutes;
