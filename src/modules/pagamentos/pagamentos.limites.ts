import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import type { Knex } from 'knex';

export function possuiLimiteProprioPagamento(req: Pick<Request, 'method' | 'originalUrl'>) {
    const path = req.originalUrl.split('?')[0] ?? '';
    return (
        (req.method === 'POST' && path === '/api/v1/pagamentos/webhook/infinitepay') ||
        (req.method === 'GET' && /^\/api\/v1\/pagamentos\/publico\/[^/]+$/.test(path)) ||
        (req.method === 'POST' && /^\/api\/v1\/pagamentos\/publico\/[^/]+\/confirmar$/.test(path))
    );
}

export function chaveConsultaPublica(db: Knex) {
    return async (req: Request) => {
        const token = req.params.token;
        if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) {
            const tokenHash = createHash('sha256').update(token).digest('hex');
            const charge = await db('cobrancas_pagamento')
                .where({ token_hash: tokenHash, provedor: 'INFINITEPAY' })
                .first('id');
            if (charge) return `cobranca:${String(charge.id)}`;
        }
        // Unknown capabilities share an IP bucket; no client-supplied forwarding header is trusted.
        return `invalido:${ipKeyGenerator(req.ip ?? '127.0.0.1')}`;
    };
}
