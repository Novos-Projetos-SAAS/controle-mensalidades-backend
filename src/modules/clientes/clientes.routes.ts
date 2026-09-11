import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';

import clientesController from './clientes.controller.js';

const clientesRoutes = Router();

// Middleware de autenticação e organização para todas as rotas de clientes.
clientesRoutes.use(verifyUser, verifyOrganization);

// ROTA POST /clientes
clientesRoutes.post('/', clientesController.criar);

// ROTA GET /clientes
clientesRoutes.get('/', clientesController.listar);

// ROTA GET /clientes/:clienteId
clientesRoutes.get('/:clienteId', clientesController.buscarPorId);

// ROTA PATCH /clientes/:clienteId
clientesRoutes.patch('/:clienteId', clientesController.atualizar);

export default clientesRoutes;
