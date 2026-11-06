import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';

import contextoArea from '../contexto/contextoArea.middleware.js';

import permissoesClinicasController from './permissoes_clinicas.controller.js';

const permissoesClinicasRoutes = Router();

// Roteador isolado para testes.
// Ainda não montar na API pública.
permissoesClinicasRoutes.use(
    verifyUser,
    verifyOrganization,
    contextoArea,
    verifyProfile('ADMINISTRADOR'),
);

permissoesClinicasRoutes.patch(
    '/:profissionalId/acesso-clinico',
    permissoesClinicasController.alterar,
);

export default permissoesClinicasRoutes;
