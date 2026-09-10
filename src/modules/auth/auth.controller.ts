import type { NextFunction, Request, Response } from 'express';

import { env } from '../../configuration/env.js';
import AppError from '../../shared/errors/AppError.js';

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

    async me(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.usuario) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const data = await authService.me(req.usuario.id);

            return res.status(200).json({
                status: 'success',
                message: 'Usuário autenticado obtido com sucesso.',
                data,
            });
        } catch (error) {
            next(error);
        }
    }

    async logout(req: Request, res: Response, next: NextFunction) {
        try {
            const usuarioId = await authService.identificarUsuarioPorToken(req.cookies?.token);

            res.clearCookie('token', opcoesCookieAuth);

            if (usuarioId) {
                try {
                    const userAgent = req.get('user-agent');
                    const ip = req.ip;

                    await auditoriaService.registrar({
                        usuarioId,
                        acao: 'AUTH.LOGOUT',
                        recurso: 'AUTENTICACAO',
                        recursoId: usuarioId,
                        dadosContexto: {
                            requestId: req.requestId,
                        },
                        ...(ip ? { ip } : {}),
                        ...(userAgent ? { userAgent } : {}),
                    });
                } catch (auditoriaError) {
                    console.error(
                        `Falha ao registrar auditoria de logout. Request ID: ${req.requestId}`,
                        auditoriaError,
                    );
                }
            }

            return res.status(200).json({
                status: 'success',
                message: 'Logout realizado com sucesso.',
                data: null,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AuthController();
