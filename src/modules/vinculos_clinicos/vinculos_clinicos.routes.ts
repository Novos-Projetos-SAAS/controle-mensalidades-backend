import { Router } from 'express';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import { exigirAcessoClinicoDeHomologacao } from '../prontuario/prontuario.homologacao.middleware.js';
import vinculosClinicosController from './vinculos_clinicos.controller.js';

const vinculosClinicosRoutes = Router();

// Rotas preparadas para homologacao, deliberadamente NAO montadas na API.
// Ninguem deve publicar vinculos clinicos via parametro de ambiente.
export const exigirHomologacaoVinculos = exigirAcessoClinicoDeHomologacao;

vinculosClinicosRoutes.use(
    verifyUser, verifyOrganization, contextoArea,
    verifyProfile('ADMINISTRADOR'), exigirHomologacaoVinculos,
);
vinculosClinicosRoutes.post('/', vinculosClinicosController.conceder);
vinculosClinicosRoutes.get('/paciente/:clienteId', vinculosClinicosController.listar);
vinculosClinicosRoutes.post('/:vinculoId/revogar', vinculosClinicosController.revogar);

export default vinculosClinicosRoutes;
