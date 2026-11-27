import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../configuration/env.js';
import { resolverOrigensCors } from '../../configuration/cors.js';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { validarIdFinanceiro } from '../financeiro/financeiro.validator.js';
import { PagamentosService } from './pagamentos.service.js';
import { chaveConsultaPublica } from './pagamentos.limites.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AbacatePayService } from './abacatepay/abacatepay.service.js';

export const pagamentosService = new PagamentosService({
    db: connection,
    key: () => env.INFINITEPAY_ENCRYPTION_KEY,
    origens: () => resolverOrigensCors(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV),
    ambiente: () => env.NODE_ENV,
});

export const abacatePayService = new AbacatePayService({
    db: connection,
    key: () => env.INFINITEPAY_ENCRYPTION_KEY,
    origens: () => resolverOrigensCors(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV),
    ambiente: () => env.NODE_ENV,
});

async function provedorToken(token: unknown) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return pagamentosService;
    const row = await connection('cobrancas_pagamento')
        .where('token_hash', createHash('sha256').update(token).digest('hex'))
        .select('provedor')
        .first();
    return row?.provedor === 'ABACATEPAY' ? abacatePayService : pagamentosService;
}

function contexto(req: Request) {
    if (!req.auth?.areaNegocioId)
        throw new AppError('Contexto administrativo necessário.', 401, 'AUTENTICACAO_NECESSARIA');
    return {
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
        usuarioId: req.auth.usuarioId,
    };
}
function headers(_req: Request, res: Response, next: NextFunction) {
    res.set({
        'Cache-Control': 'private, no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
    });
    next();
}
const success = (res: Response, data: unknown, code = 200) =>
    res.status(code).json({ status: 'success', data });

export const pagamentosAdminRoutes = Router();
pagamentosAdminRoutes.use(headers);
pagamentosAdminRoutes.get('/abacatepay/configuracao', async (req, res) =>
    success(res, await abacatePayService.lerConfiguracao(contexto(req))),
);
pagamentosAdminRoutes.patch('/abacatepay/configuracao', async (req, res) =>
    success(
        res,
        await abacatePayService.atualizarConfiguracao(
            contexto(req),
            req.body,
            req.get('x-platform-origin') ?? req.get('origin'),
        ),
    ),
);
pagamentosAdminRoutes.get('/integracoes-pagamento', async (req, res) =>
    success(res, await abacatePayService.configuracao.integracoes(contexto(req))),
);
pagamentosAdminRoutes.patch('/provedor-padrao', async (req, res) =>
    success(res, await abacatePayService.configuracao.padrao(contexto(req), req.body)),
);
pagamentosAdminRoutes.get('/assinaturas/:id/recorrencia', async (req, res) =>
    success(
        res,
        await abacatePayService.consultarRecorrencia(
            contexto(req),
            validarIdFinanceiro(req.params.id, 'assinatura'),
        ),
    ),
);
pagamentosAdminRoutes.post('/assinaturas/:id/recorrencia', async (req, res) =>
    success(
        res,
        await abacatePayService.criarRecorrencia(
            contexto(req),
            validarIdFinanceiro(req.params.id, 'assinatura'),
            req.body,
        ),
    ),
);
pagamentosAdminRoutes.post('/assinaturas/:id/recorrencia/conciliar', async (req, res) => {
    await abacatePayService.processarEventos();
    return success(
        res,
        await abacatePayService.conciliarRecorrencia(
            contexto(req),
            validarIdFinanceiro(req.params.id, 'assinatura'),
        ),
    );
});
pagamentosAdminRoutes.post('/assinaturas/:id/recorrencia/cancelar', async (req, res) =>
    success(
        res,
        await abacatePayService.cancelarRecorrencia(
            contexto(req),
            validarIdFinanceiro(req.params.id, 'assinatura'),
        ),
    ),
);

pagamentosAdminRoutes.get('/infinitepay/configuracao', async (req, res) =>
    success(res, await pagamentosService.lerConfiguracao(contexto(req))),
);
pagamentosAdminRoutes.patch('/infinitepay/configuracao', async (req, res) =>
    success(
        res,
        await pagamentosService.atualizarConfiguracao(
            contexto(req),
            req.body,
            req.get('x-platform-origin') ?? req.get('origin'),
        ),
    ),
);
pagamentosAdminRoutes.get('/mensalidades/:mensalidadeId/cobranca', async (req, res) =>
    success(
        res,
        await (async () => {
            const c = contexto(req),
                id = validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade');
            const conta = await pagamentosService.repo.conta(connection, id, c).first();
            if (!conta)
                throw new AppError(
                    'Mensalidade não encontrada nesta área.',
                    404,
                    'MENSALIDADE_NAO_ENCONTRADA',
                );
            const charge = await connection('cobrancas_pagamento')
                .where({
                    conta_receber_id: conta.conta_receber_id,
                    organizacao_id: c.organizacaoId,
                })
                .orderBy('criado_em', 'desc')
                .select('provedor')
                .first();
            return charge?.provedor === 'ABACATEPAY'
                ? abacatePayService.consultarCobranca(c, id)
                : pagamentosService.consultarCobranca(c, id);
        })(),
    ),
);
pagamentosAdminRoutes.post('/mensalidades/:mensalidadeId/cobranca', async (req, res) =>
    success(
        res,
        await (async () => {
            const c = contexto(req),
                id = validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade');
            const input = z
                .object({ provedor: z.enum(['INFINITEPAY', 'ABACATEPAY']).optional() })
                .strict()
                .safeParse(req.body ?? {});
            if (!input.success)
                throw new AppError(
                    'Escolha uma conta de pagamento válida.',
                    400,
                    'PROVEDOR_INVALIDO',
                );
            const provider =
                input.data.provedor ??
                (await abacatePayService.configuracao.integracoes(c)).provedor_padrao;
            return provider === 'ABACATEPAY'
                ? abacatePayService.gerarCobranca(c, id)
                : pagamentosService.gerarCobranca(c, id);
        })(),
    ),
);
pagamentosAdminRoutes.post('/cobrancas/:id/conciliar', async (req, res) =>
    success(
        res,
        await (async () => {
            const c = contexto(req),
                id = validarIdFinanceiro(req.params.id, 'cobrança');
            const charge = await connection('cobrancas_pagamento')
                .where({ id, organizacao_id: c.organizacaoId })
                .select('provedor')
                .first();
            return charge?.provedor === 'ABACATEPAY'
                ? abacatePayService.conciliar(c, id)
                : pagamentosService.conciliar(c, id, req.body);
        })(),
    ),
);

export const pagamentosPublicRoutes = Router();
pagamentosPublicRoutes.use(headers);
const limiteConsulta = rateLimit({
    windowMs: 60000,
    limit: 60,
    keyGenerator: chaveConsultaPublica(connection),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});
const limiteWebhook = rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
});
pagamentosPublicRoutes.get('/publico/:token', limiteConsulta, async (req, res) =>
    success(res, await (await provedorToken(req.params.token)).consultarPublica(req.params.token)),
);
pagamentosPublicRoutes.post('/publico/:token/confirmar', limiteConsulta, async (req, res) => {
    const provider = await provedorToken(req.params.token);
    const result =
        provider instanceof AbacatePayService
            ? await provider.confirmarPublica(req.params.token)
            : await provider.confirmarPublica(req.params.token, req.body);
    return success(
        res,
        result,
        ['PAGO_VERIFICADO', 'PAGO_EM_REVISAO'].includes(result.status) ? 200 : 202,
    );
});
pagamentosPublicRoutes.post('/webhook/abacatepay/:id', limiteWebhook, async (req, res) => {
    const secret =
        req.get('x-webhook-secret') ??
        (typeof req.query.webhookSecret === 'string' ? req.query.webhookSecret : '');
    await abacatePayService.receberWebhook(
        validarIdFinanceiro(req.params.id, 'integração'),
        req.body,
        secret,
        req.get('x-webhook-signature') ?? '',
    );
    return success(res, { recebido: true });
});
pagamentosPublicRoutes.post('/webhook/infinitepay', limiteWebhook, async (req, res) => {
    await pagamentosService.receberSinal(req.body, 'WEBHOOK');
    return success(res, { recebido: true });
});
