import { Router } from 'express';

import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import whatsappController from './whatsapp.controller.js';

const whatsappRoutes = Router();

whatsappRoutes.use(verifyUser, verifyOrganization, verifyProfile('ADMINISTRADOR'));

whatsappRoutes.get('/configuracoes', whatsappController.listarConfiguracoes);
whatsappRoutes.put('/configuracoes', whatsappController.salvarConfiguracao);
whatsappRoutes.get('/modelos', contextoArea, whatsappController.listarPropostasTemplates);
whatsappRoutes.get('/tarefas', contextoArea, whatsappController.listarTarefas);
whatsappRoutes.get('/mensagens', contextoArea, whatsappController.listarMensagens);
whatsappRoutes.get('/metricas', contextoArea, whatsappController.obterMetricas);

export default whatsappRoutes;
