// src/modules/areas_negocio/areas_negocio.routes.ts

import { Router } from 'express';

import verificarUsuario from '../../middlewares/verifyUser.middleware.js';
import verificarOrganizacao from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';

import areasNegociosController from './areas_negocio.controller.js';

const areasNegocioRoutes = Router();

// Middleware de autenticação e organização para todas as rotas de áreas de negócio.
areasNegocioRoutes.use(verificarUsuario, verificarOrganizacao);

// ROTA GET /areas-negocio
areasNegocioRoutes.get('/', areasNegociosController.listar);
areasNegocioRoutes.post('/', verifyProfile('ADMINISTRADOR'), areasNegociosController.criar);

export default areasNegocioRoutes;
