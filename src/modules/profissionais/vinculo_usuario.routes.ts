import { Router } from 'express';

import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verificarModulo from '../../middlewares/verifyModule.middleware.js';

import contextoArea from '../contexto/contextoArea.middleware.js';

import vinculoUsuarioController from './vinculo_usuario.controller.js';

const vinculoUsuarioRoutes = Router();

// Rota administrativa isolada.
// Não publicar na API principal antes dos testes
// e da proteção definitiva de unicidade no banco.
vinculoUsuarioRoutes.use(
    verifyUser,
    verifyOrganization,
    contextoArea,
    verificarModulo('AGENDA'),
    verifyProfile('ADMINISTRADOR'),
);

// PATCH /profissionais/:profissionalId/usuario
vinculoUsuarioRoutes.get('/:profissionalId/usuario', vinculoUsuarioController.consultar);
vinculoUsuarioRoutes.patch('/:profissionalId/usuario', vinculoUsuarioController.alterar);

export default vinculoUsuarioRoutes;
