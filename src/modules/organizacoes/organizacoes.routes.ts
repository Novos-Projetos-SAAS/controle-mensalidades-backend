import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';

import organizacoesController from './organizacoes.controller.js';

const organizacoesRoutes = Router();

organizacoesRoutes.post('/', verifyUser, organizacoesController.criar);

organizacoesRoutes.use(verifyUser, verifyOrganization);

organizacoesRoutes.get('/atual', organizacoesController.obterAtual);

organizacoesRoutes.patch(
    '/atual',
    verifyProfile('ADMINISTRADOR'),
    organizacoesController.atualizarAtual,
);

export default organizacoesRoutes;
