import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type EventoStatusMeta = {
    phoneNumberId: string;
    messagingAccountId: string;
    identificadorExterno: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    ocorridoEm: string;
    destinatario: string;
};

export function verificarAssinaturaMeta(
    corpoBruto: Buffer,
    assinatura: string | undefined,
    appSecret: string | undefined,
): boolean {
    if (!assinatura?.startsWith('sha256=') || !appSecret) return false;
    const hexadecimal = assinatura.slice('sha256='.length);
    if (!/^[a-f0-9]{64}$/i.test(hexadecimal)) return false;
    const recebida = Buffer.from(hexadecimal, 'hex');
    const esperada = createHmac('sha256', appSecret).update(corpoBruto).digest();
    return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

export function verificarHandshakeMeta(
    mode: string | undefined,
    tokenRecebido: string | undefined,
    tokenConfigurado: string | undefined,
    challenge: string | undefined,
): string | null {
    if (mode !== 'subscribe' || !tokenConfigurado || !tokenRecebido || !challenge) {
        return null;
    }
    const recebido = createHash('sha256').update(tokenRecebido).digest();
    const configurado = createHash('sha256').update(tokenConfigurado).digest();
    if (!timingSafeEqual(recebido, configurado)) return null;
    return challenge;
}

export function criarChaveEventoMeta(evento: EventoStatusMeta): string {
    return createHash('sha256')
        .update(
            [
                evento.phoneNumberId,
                evento.messagingAccountId,
                evento.identificadorExterno,
                evento.status,
                evento.ocorridoEm,
                evento.destinatario,
            ].join('|'),
        )
        .digest('hex');
}

export function extrairEventosStatusMeta(corpoBruto: Buffer): EventoStatusMeta[] {
    let payload: unknown;
    try {
        payload = JSON.parse(corpoBruto.toString('utf8')) as unknown;
    } catch {
        throw new Error('PAYLOAD_META_INVALIDO');
    }

    if (!payload || typeof payload !== 'object' || !('entry' in payload)) return [];
    const entradas = (payload as { entry?: unknown }).entry;
    if (!Array.isArray(entradas)) return [];

    const eventos: EventoStatusMeta[] = [];
    for (const entrada of entradas) {
        if (!entrada || typeof entrada !== 'object' || !('changes' in entrada)) continue;
        const messagingAccountId =
            'id' in entrada && typeof (entrada as { id?: unknown }).id === 'string'
                ? (entrada as { id: string }).id.trim()
                : '';
        const alteracoes = (entrada as { changes?: unknown }).changes;
        if (!Array.isArray(alteracoes)) continue;
        for (const alteracao of alteracoes) {
            if (!alteracao || typeof alteracao !== 'object' || !('value' in alteracao)) continue;
            const valor = (alteracao as { value?: unknown }).value;
            if (!valor || typeof valor !== 'object' || !('statuses' in valor)) continue;
            const metadata = (valor as { metadata?: unknown }).metadata;
            const phoneNumberId =
                metadata &&
                typeof metadata === 'object' &&
                'phone_number_id' in metadata &&
                typeof (metadata as { phone_number_id?: unknown }).phone_number_id === 'string'
                    ? (metadata as { phone_number_id: string }).phone_number_id.trim()
                    : '';
            const statuses = (valor as { statuses?: unknown }).statuses;
            if (!Array.isArray(statuses)) continue;

            for (const status of statuses) {
                if (!status || typeof status !== 'object') continue;
                const item = status as Record<string, unknown>;
                if (!['sent', 'delivered', 'read', 'failed'].includes(String(item.status)))
                    continue;

                const id = typeof item.id === 'string' ? item.id.trim() : '';
                const destinatario =
                    typeof item.recipient_id === 'string'
                        ? `+${item.recipient_id.replace(/\D/g, '')}`
                        : '';
                const timestamp = typeof item.timestamp === 'string' ? Number(item.timestamp) : NaN;
                if (
                    !phoneNumberId ||
                    phoneNumberId.length > 100 ||
                    !messagingAccountId ||
                    messagingAccountId.length > 100 ||
                    !id ||
                    !/^\+[1-9]\d{7,14}$/.test(destinatario) ||
                    !Number.isSafeInteger(timestamp) ||
                    timestamp <= 0
                ) {
                    throw new Error('EVENTO_META_INVALIDO');
                }
                eventos.push({
                    phoneNumberId,
                    messagingAccountId,
                    identificadorExterno: id,
                    status: item.status as EventoStatusMeta['status'],
                    ocorridoEm: new Date(timestamp * 1000).toISOString(),
                    destinatario,
                });
                if (eventos.length > 100) throw new Error('LIMITE_EVENTOS_META_EXCEDIDO');
            }
        }
    }
    return eventos;
}
