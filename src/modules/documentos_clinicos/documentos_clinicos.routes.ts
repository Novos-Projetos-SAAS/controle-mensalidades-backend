import { Router } from 'express';

import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import { exigirAcessoClinicoDeHomologacao } from '../prontuario/prontuario.homologacao.middleware.js';
import documentosClinicosController from './documentos_clinicos.controller.js';

const documentosClinicosRoutes = Router();

// Gate fail-closed: o módulo não é montado em /api/v1 e a autenticação
// de um usuário ADMINISTRADOR não autoriza prontuários.
export const exigirHomologacaoDocumental = exigirAcessoClinicoDeHomologacao;

documentosClinicosRoutes.use(
    verifyUser, verifyOrganization, contextoArea, exigirHomologacaoDocumental,
);
documentosClinicosRoutes.post('/', documentosClinicosController.criar);
documentosClinicosRoutes.get('/paciente/:clienteId', documentosClinicosController.listar);
documentosClinicosRoutes.get('/:documentoId', documentosClinicosController.consultar);
documentosClinicosRoutes.post('/:documentoId/revisoes', documentosClinicosController.revisar);
documentosClinicosRoutes.post('/:documentoId/finalizar', documentosClinicosController.finalizar);

export default documentosClinicosRoutes;
