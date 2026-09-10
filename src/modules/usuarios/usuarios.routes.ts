import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';

import usuariosController from './usuarios.controller.js';

const usuariosRoutes = Router();

// Middleware de autenticação, organização e perfil para todas as rotas de usuários.
usuariosRoutes.use(verifyUser, verifyOrganization, verifyProfile('ADMINISTRADOR'));

// ROTA POST /usuarios
usuariosRoutes.post('/', usuariosController.criar);

// ROTA GET /usuarios
usuariosRoutes.get('/', usuariosController.listar);

// ROTA PATCH /usuarios/:usuarioId
usuariosRoutes.patch('/:usuarioId', usuariosController.atualizarVinculo);

export default usuariosRoutes;
