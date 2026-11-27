import { z } from 'zod';

export type ClienteCheckoutOrigem = { nome?: unknown; email?: unknown; telefone?: unknown };
export type ClienteCheckout = { name?: string; email?: string; phone_number?: string };

const ddds = new Set(
    '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(
        ' ',
    ),
);
const emailSchema = z.email().max(150);

function telefoneInternacional(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length > 50) return;
    const trimmed = value.trim();
    if (!/^\+?[\d\s().-]+$/.test(trimmed)) return;
    const compact = trimmed.replace(/[\s().-]/g, '');
    const digits = compact.replace(/^\+/, '');
    const brazil =
        compact.startsWith('+55') || (!compact.startsWith('+') && /^55\d{10,11}$/.test(compact));
    if (brazil || !compact.startsWith('+')) {
        const national = brazil ? digits.slice(2) : digits;
        if (!ddds.has(national.slice(0, 2)) || !/^\d{2}(?:[2-5]\d{7}|9\d{8})$/.test(national))
            return;
        return '+55' + national;
    }
    return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : undefined;
}

export function montarClienteCheckout(
    cliente?: ClienteCheckoutOrigem,
): ClienteCheckout | undefined {
    if (!cliente) return;
    const customer: ClienteCheckout = {};
    if (
        typeof cliente.nome === 'string' &&
        ![...cliente.nome].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ) {
        const name = cliente.nome.trim().replace(/\s+/g, ' ');
        if (name && name.length <= 150) customer.name = name;
    }
    if (typeof cliente.email === 'string') {
        const email = cliente.email.trim().toLowerCase();
        if (emailSchema.safeParse(email).success) customer.email = email;
    }
    const phone = telefoneInternacional(cliente.telefone);
    if (phone) customer.phone_number = phone;
    return Object.keys(customer).length ? customer : undefined;
}
