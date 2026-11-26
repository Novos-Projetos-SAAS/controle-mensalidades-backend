import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import { exigirAcessoClinicoDeHomologacao } from '../prontuario/prontuario.homologacao.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';

import sessoesClinicasController from './sessoes_clinicas.controller.js';

const sessoesClinicasRoutes = Router();

// Bloqueio temporário até implementarmos autorização clínica específica.
// Mesmo que alguém monte estas rotas antes da conclusão,
// nenhuma operação clínica será permitida.
export const exigirAutorizacaoClinica = exigirAcessoClinicoDeHomologacao;

// Middlewares comuns a todas as rotas.
sessoesClinicasRoutes.use(verifyUser, verifyOrganization, contextoArea, exigirAutorizacaoClinica);

// POST /sessoes-clinicas
sessoesClinicasRoutes.post('/', sessoesClinicasController.criar);

// GET /sessoes-clinicas
sessoesClinicasRoutes.get('/', sessoesClinicasController.listar);

// GET /sessoes-clinicas/:sessaoClinicaId/historico
sessoesClinicasRoutes.get(
    '/:sessaoClinicaId/historico',
    sessoesClinicasController.listarHistoricoCorrecoes,
);

// PATCH /sessoes-clinicas/:sessaoClinicaId
sessoesClinicasRoutes.patch('/:sessaoClinicaId', sessoesClinicasController.corrigir);

// GET /sessoes-clinicas/:sessaoClinicaId
sessoesClinicasRoutes.get('/:sessaoClinicaId', sessoesClinicasController.buscarPorId);

export default sessoesClinicasRoutes;
