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

// ROTA PATCH /clientes/:clienteId/inativar
clientesRoutes.patch('/:clienteId/inativar', clientesController.inativar);

// ROTA PATCH /clientes/:clienteId/reativar
clientesRoutes.patch('/:clienteId/reativar', clientesController.reativar);

// ROTA PATCH /clientes/:clienteId/whatsapp/aceitar
clientesRoutes.patch('/:clienteId/whatsapp/aceitar', clientesController.aceitarWhatsapp);

// ROTA PATCH /clientes/:clienteId/whatsapp/revogar
clientesRoutes.patch('/:clienteId/whatsapp/revogar', clientesController.revogarWhatsapp);

// ROTA PATCH /clientes/:clienteId
clientesRoutes.patch('/:clienteId', clientesController.atualizar);

export default clientesRoutes;
