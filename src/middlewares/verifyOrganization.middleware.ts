import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import connection from '../database/connection.js';
import AppError from '../shared/errors/AppError.js';

const uuidSchema = z.string().uuid();

export default async function verifyOrganization(req: Request, _res: Response, next: NextFunction) {
    try {
        if (!req.usuario) {
            throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
        }

        const organizacaoIdHeader = req.headers['x-organizacao-id'];

        if (!organizacaoIdHeader || Array.isArray(organizacaoIdHeader)) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        const resultadoOrganizacaoId = uuidSchema.safeParse(organizacaoIdHeader);

        if (!resultadoOrganizacaoId.success) {
            throw new AppError('Organização inválida.', 400, 'ORGANIZACAO_INVALIDA');
        }

        const vinculo = await connection('usuarios_organizacoes as uo')
            .innerJoin('organizacoes as o', 'o.id', 'uo.organizacao_id')
            .select('uo.organizacao_id', 'uo.perfil')
            .where('uo.usuario_id', req.usuario.id)
            .andWhere('uo.organizacao_id', resultadoOrganizacaoId.data)
            .andWhere('uo.ativo', true)
            .whereNull('uo.deletado_em')
            .andWhere('o.ativo', true)
            .whereNull('o.deletado_em')
            .first();

        if (!vinculo) {
            throw new AppError(
                'Usuário não autorizado nesta organização.',
                403,
                'ORGANIZACAO_NAO_AUTORIZADA',
            );
        }

        req.auth = {
            usuarioId: req.usuario.id,
            organizacaoId: vinculo.organizacao_id,
            perfil: vinculo.perfil,
        };

        next();
    } catch (error) {
        next(error);
    }
}
