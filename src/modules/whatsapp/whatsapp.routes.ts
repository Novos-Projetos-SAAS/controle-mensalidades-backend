import { Router } from 'express';

import { env } from '../../configuration/env.js';
import AppError from '../../shared/errors/AppError.js';
import verifyOrganization from '../../middlewares/verifyOrganization.middleware.js';
import verifyProfile from '../../middlewares/verifyProfile.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';
import contextoArea from '../contexto/contextoArea.middleware.js';
import whatsappController from './whatsapp.controller.js';
import whatsappOnboardingController from './whatsapp.onboarding.controller.js';
import { processarEventoStatusMetaVerificado } from './whatsapp.webhook.service.js';
import { verificarHandshakeMeta } from './whatsapp.webhook.js';

const whatsappRoutes = Router();

whatsappRoutes.get('/webhook', (req, res) => {
    const valor = (chave: string) => {
        const recebido = req.query[chave];
        return typeof recebido === 'string' ? recebido : undefined;
    };
    const challenge = verificarHandshakeMeta(
        valor('hub.mode'),
        valor('hub.verify_token'),
        env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN,
        valor('hub.challenge'),
    );
    if (challenge === null) return res.sendStatus(403);
    return res.status(200).type('text/plain').send(challenge);
});

whatsappRoutes.post('/webhook', async (req, res, next) => {
    try {
        if (!Buffer.isBuffer(req.body)) {
            throw new AppError(
                'Corpo do webhook deve ser JSON bruto.',
                400,
                'PAYLOAD_META_INVALIDO',
            );
        }
        if (!env.WHATSAPP_META_APP_SECRET) {
            throw new AppError(
                'Webhook Meta não configurado.',
                503,
                'WEBHOOK_META_NAO_CONFIGURADO',
            );
        }
        const resultados = await processarEventoStatusMetaVerificado({
            corpoBruto: req.body,
            assinatura: req.header('x-hub-signature-256'),
            appSecret: env.WHATSAPP_META_APP_SECRET,
        });
        return res.status(200).json({ recebido: true, eventos: resultados.length });
    } catch (erro) {
        return next(erro);
    }
});

whatsappRoutes.use(verifyUser, verifyOrganization, verifyProfile('ADMINISTRADOR'));

whatsappRoutes.get(
    '/onboarding/configuracao-sdk',
    contextoArea,
    whatsappOnboardingController.obterConfiguracaoSdk,
);
whatsappRoutes.post('/onboarding/iniciar', contextoArea, whatsappOnboardingController.iniciar);
whatsappRoutes.post('/onboarding/concluir', contextoArea, whatsappOnboardingController.concluir);
whatsappRoutes.post(
    '/onboarding/:correlacaoId/continuar',
    contextoArea,
    whatsappOnboardingController.continuar,
);
whatsappRoutes.get(
    '/onboarding/:correlacaoId',
    contextoArea,
    whatsappOnboardingController.obterStatus,
);

whatsappRoutes.get('/configuracoes', whatsappController.listarConfiguracoes);
whatsappRoutes.put('/configuracoes', whatsappController.salvarConfiguracao);
whatsappRoutes.get('/modelos', contextoArea, whatsappController.listarPropostasTemplates);
whatsappRoutes.get('/tarefas', contextoArea, whatsappController.listarTarefas);
whatsappRoutes.get('/mensagens', contextoArea, whatsappController.listarMensagens);
whatsappRoutes.get('/metricas', contextoArea, whatsappController.obterMetricas);

export default whatsappRoutes;
