import AppError from '../../shared/errors/AppError.js';
import whatsappRepository from './whatsapp.repository.js';
import {
    criarChaveEventoMeta,
    extrairEventosStatusMeta,
    verificarAssinaturaMeta,
} from './whatsapp.webhook.js';

export async function processarEventoStatusMetaVerificado(input: {
    corpoBruto: Buffer;
    assinatura: string | undefined;
    appSecret: string | undefined;
}) {
    if (!verificarAssinaturaMeta(input.corpoBruto, input.assinatura, input.appSecret)) {
        throw new AppError(
            'Assinatura de webhook Meta inválida.',
            401,
            'WEBHOOK_META_NAO_AUTENTICADO',
        );
    }

    let eventos;
    try {
        eventos = extrairEventosStatusMeta(input.corpoBruto);
    } catch {
        throw new AppError('Payload de status Meta inválido.', 400, 'EVENTO_META_INVALIDO');
    }
    return Promise.all(
        eventos.map((evento) =>
            whatsappRepository.registrarEventoStatusMetaPorNumero(
                criarChaveEventoMeta(evento),
                evento,
            ),
        ),
    );
}
