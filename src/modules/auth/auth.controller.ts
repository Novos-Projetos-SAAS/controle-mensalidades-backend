import type { NextFunction, Request, Response } from 'express';

import { env } from '../../configuration/env.js';
import auditoriaService from '../auditoria/auditoria.service.js';
import authService from './auth.service.js';

const duracaoCookiePorJwt = {
    '1h': 1 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

const opcoesCookieAuth = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
};

class AuthController {
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { token, usuario, organizacoes } = await authService.login(req.body);

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    usuarioId: String(usuario.id),
                    acao: 'AUTH.LOGIN',
                    recurso: 'AUTENTICACAO',
                    recursoId: String(usuario.id),
                    dadosContexto: {
                        requestId: req.requestId,
                    },
                    ...(ip ? { ip } : {}),
                    ...(userAgent ? { userAgent } : {}),
                });
            } catch (auditoriaError) {
                console.error(
                    `Falha ao registrar auditoria de login. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            res.cookie('token', token, {
                ...opcoesCookieAuth,
                maxAge: duracaoCookiePorJwt[env.JWT_EXPIRES_IN],
            });

            return res.status(200).json({
                status: 'success',
                message: 'Login realizado com sucesso.',
                data: {
                    usuario,
                    organizacoes,
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AuthController();
