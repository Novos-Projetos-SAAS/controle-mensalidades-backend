import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../configuration/env.js';
import { resolverOrigensCors } from '../../configuration/cors.js';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { validarIdFinanceiro } from '../financeiro/financeiro.validator.js';
import { PagamentosService } from './pagamentos.service.js';
import { chaveConsultaPublica } from './pagamentos.limites.js';

export const pagamentosService = new PagamentosService({
    db: connection,
    key: () => env.INFINITEPAY_ENCRYPTION_KEY,
    origens: () => resolverOrigensCors(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV),
    ambiente: () => env.NODE_ENV,
});

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
        await pagamentosService.consultarCobranca(
            contexto(req),
            validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade'),
        ),
    ),
);
pagamentosAdminRoutes.post('/mensalidades/:mensalidadeId/cobranca', async (req, res) =>
    success(
        res,
        await pagamentosService.gerarCobranca(
            contexto(req),
            validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade'),
        ),
    ),
);
pagamentosAdminRoutes.post('/cobrancas/:id/conciliar', async (req, res) =>
    success(
        res,
        await pagamentosService.conciliar(
            contexto(req),
            validarIdFinanceiro(req.params.id, 'cobrança'),
            req.body,
        ),
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
    success(res, await pagamentosService.consultarPublica(req.params.token)),
);
pagamentosPublicRoutes.post('/publico/:token/confirmar', limiteConsulta, async (req, res) => {
    const result = await pagamentosService.confirmarPublica(req.params.token, req.body);
    return success(
        res,
        result,
        ['PAGO_VERIFICADO', 'PAGO_EM_REVISAO'].includes(result.status) ? 200 : 202,
    );
});
pagamentosPublicRoutes.post('/webhook/infinitepay', limiteWebhook, async (req, res) => {
    await pagamentosService.receberSinal(req.body, 'WEBHOOK');
    return success(res, { recebido: true });
});
