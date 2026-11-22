import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';

import financeiroController from './financeiro.controller.js';
import indicadoresController from './financeiro.indicadores.js';

const financeiroRoutes = Router();

financeiroRoutes.use(verifyUser, verifyOrganization, contextoArea, verifyProfile('ADMINISTRADOR'));

financeiroRoutes.get('/planos', financeiroController.listarPlanos);
financeiroRoutes.post('/planos', financeiroController.criarPlano);
financeiroRoutes.get('/planos/:planoId', financeiroController.buscarPlano);

financeiroRoutes.get('/assinaturas', financeiroController.listarAssinaturas);
financeiroRoutes.post('/assinaturas', financeiroController.criarAssinatura);
financeiroRoutes.get('/assinaturas/:assinaturaId', financeiroController.buscarAssinatura);
financeiroRoutes.post(
    '/assinaturas/:assinaturaId/mensalidades',
    financeiroController.gerarMensalidade,
);

financeiroRoutes.get('/mensalidades', financeiroController.listarMensalidades);
financeiroRoutes.get('/mensalidades/:mensalidadeId', financeiroController.buscarMensalidade);
financeiroRoutes.post(
    '/mensalidades/:mensalidadeId/recebimentos',
    financeiroController.registrarRecebimento,
);

financeiroRoutes.get('/resumo', financeiroController.obterResumo);
financeiroRoutes.get('/indicadores', indicadoresController);

export default financeiroRoutes;
