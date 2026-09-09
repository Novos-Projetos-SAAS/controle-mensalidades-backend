import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';

import connection from '../database/connection.js';
import AppError from '../shared/errors/AppError.js';

const uuidSchema = z.string().uuid();

export default async function verificarToken(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.token;

        if (!token) {
            throw new AppError('Autenticação necessária.', 401, 'TOKEN_AUSENTE');
        }

        const jwtSecret = process.env.JWT_SECRET;

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

        const organizacaoId = req.header('x-organizacao-id');

        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        const resultadoOrganizacaoId = uuidSchema.safeParse(organizacaoId);

        if (!resultadoOrganizacaoId.success) {
            throw new AppError('Organização inválida.', 400, 'ORGANIZACAO_INVALIDA');
        }

        const vinculo = await connection('usuarios as u')
            .innerJoin('usuarios_organizacoes as uo', 'uo.usuario_id', 'u.id')
            .innerJoin('organizacoes as o', 'o.id', 'uo.organizacao_id')
            .select('u.id as usuario_id', 'u.nome', 'uo.organizacao_id', 'uo.perfil')
            .where('u.id', usuarioId)
            .andWhere('uo.organizacao_id', resultadoOrganizacaoId.data)
            .andWhere('u.ativo', true)
            .andWhere('uo.ativo', true)
            .andWhere('o.ativo', true)
            .first();

        if (!vinculo) {
            throw new AppError(
                'Usuário não autorizado nesta organização.',
                403,
                'ORGANIZACAO_NAO_AUTORIZADA',
            );
        }

        req.auth = {
            usuarioId: vinculo.usuario_id,
            organizacaoId: vinculo.organizacao_id,
            perfil: vinculo.perfil,
        };

        next();
    } catch (error) {
        next(error);
    }
}
