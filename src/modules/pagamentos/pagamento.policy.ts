import AppError from '../../shared/errors/AppError.js';

const DAY_MS = 86_400_000;
const saoPauloFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function dataSaoPaulo(now: Date): string {
    const parts = saoPauloFormatter.formatToParts(now);
    return ['year', 'month', 'day']
        .map((type) => parts.find((part) => part.type === type)?.value)
        .join('-');
}

function calendarDate(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const date = new Date(`${value}T12:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
        ? date.getTime()
        : Number.NaN;
}

export function deveGerarAutomaticamente(vencimento: string, hoje: string, dias: number): boolean {
    if (dias !== 1 && dias !== 2) return false;
    const difference = (calendarDate(vencimento) - calendarDate(hoje)) / DAY_MS;
    return difference >= 0 && difference <= dias;
}

export function expiraCobranca(vencimento: string, agora: Date): Date {
    if (!Number.isFinite(calendarDate(vencimento)) || !Number.isFinite(agora.getTime())) {
        throw new AppError('Data da cobrança inválida.', 400, 'PAGAMENTO_DATA_INVALIDA');
    }
    const endOfDueDate = new Date(`${vencimento}T23:59:59-03:00`).getTime();
    const now = agora.getTime();
    const requested = endOfDueDate > now ? endOfDueDate : now + DAY_MS;
    // O provedor aceita no máximo um ano; 365 dias também cobre anos bissextos.
    return new Date(Math.min(requested, now + 365 * DAY_MS - 1_000));
}

function trustedOrigin(value: string, ambiente: string): boolean {
    if (
        [...value].some(
            (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\',
        )
    )
        return false;
    try {
        const url = new URL(value);
        if (value !== url.origin || url.username || url.password) return false;
        if (url.protocol === 'https:') return true;
        return (
            ambiente !== 'production' &&
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        );
    } catch {
        return false;
    }
}

export function resolverOrigemPlataforma(
    candidata: string | undefined,
    origens: ReadonlySet<string>,
    ambiente: string,
): string {
    const origin = candidata ?? (origens.size === 1 ? [...origens][0] : undefined);
    if (!origin || !origens.has(origin) || !trustedOrigin(origin, ambiente)) {
        throw new AppError('Origem da plataforma inválida.', 400, 'PAGAMENTO_ORIGEM_INVALIDA');
    }
    return origin;
}
