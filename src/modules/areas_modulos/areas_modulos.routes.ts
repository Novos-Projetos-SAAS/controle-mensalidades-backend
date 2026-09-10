import { Router } from 'express';

import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';

import areasModulosController from './areas_modulos.controller.js';

const areasModulosRoutes = Router();

// Middleware de autenticação e organização para todas as rotas de módulos por área.
areasModulosRoutes.use(verifyUser, verifyOrganization);

// ROTA GET /areas-negocio/:areaNegocioId/modulos
areasModulosRoutes.get('/:areaNegocioId/modulos', areasModulosController.listar);

export default areasModulosRoutes;
