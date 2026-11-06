import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';
import { validarProfissionalId } from './profissionais.validator.js';
import permissoesClinicasService from './permissoes_clinicas.service.js';

const bodySchema = z
    .object({
        autorizado: z.boolean(),
    })
    .strict();

class PermissoesClinicasController {
    async alterar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth || !req.auth.areaNegocioId) {
                throw new AppError('Contexto obrigatório.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            if (req.auth.perfil !== 'ADMINISTRADOR') {
                throw new AppError('Perfil não autorizado.', 403, 'PERFIL_NAO_AUTORIZADO');
            }

            const profissionalId = validarProfissionalId(req.params.profissionalId);

            const validacao = bodySchema.safeParse(req.body);

            if (!validacao.success) {
                throw new AppError('Dados inválidos.', 400, 'DADOS_PERMISSAO_CLINICA_INVALIDOS');
            }

            const userAgent = req.get('user-agent');

            const resultado = await permissoesClinicasService.alterar({
                organizacaoId: req.auth.organizacaoId,
                areaNegocioId: req.auth.areaNegocioId,
                administradorId: req.auth.usuarioId,
                profissionalId,
                autorizado: validacao.data.autorizado,
                requestId: req.requestId,
                ...(req.ip && { ip: req.ip }),
                ...(userAgent && { userAgent }),
            });

            return res.status(200).json({
                status: 'success',
                message: 'Permissão clínica atualizada com sucesso.',
                data: resultado,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new PermissoesClinicasController();
