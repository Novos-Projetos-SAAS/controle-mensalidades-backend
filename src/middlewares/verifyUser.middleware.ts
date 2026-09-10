import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../configuration/env.js';
import connection from '../database/connection.js';
import AppError from '../shared/errors/AppError.js';

const uuidSchema = z.string().uuid();

export default async function verifyUser(req: Request, _res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.token;

        if (!token) {
            throw new AppError('Autenticação necessária.', 401, 'TOKEN_AUSENTE');
        }

        const jwtSecret = env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('JWT_SECRET não definida.');
        }

        let payload: JwtPayload | string;

        try {
            payload = jwt.verify(token, jwtSecret);
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new AppError('Sessão expirada.', 401, 'TOKEN_EXPIRADO');
            }

            throw new AppError('Token de autenticação inválido.', 401, 'TOKEN_INVALIDO');
        }

        if (typeof payload === 'string' || !payload.sub) {
            throw new AppError('Token de autenticação inválido.', 401, 'TOKEN_INVALIDO');
        }

        const resultadoUsuarioId = uuidSchema.safeParse(payload.sub);

        if (!resultadoUsuarioId.success) {
            throw new AppError('Token de autenticação inválido.', 401, 'TOKEN_INVALIDO');
        }

        const usuarioId = resultadoUsuarioId.data;

        const usuario = await connection('usuarios')
            .select('id')
            .where('id', usuarioId)
            .andWhere('ativo', true)
            .whereNull('deletado_em')
            .first();

        if (!usuario) {
            throw new AppError('Autenticação inválida.', 401, 'AUTENTICACAO_INVALIDA');
        }

        req.usuario = {
            id: usuario.id,
        };

        next();
    } catch (error) {
        next(error);
    }
}
