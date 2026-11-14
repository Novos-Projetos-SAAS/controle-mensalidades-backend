import type { NextFunction, Request, Response } from 'express';

import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

import { validarProfissionalId } from './profissionais.validator.js';

import vinculoUsuarioService from './vinculo_usuario.service.js';

const alterarVinculoSchema = z
    .object({
        usuarioId: z.uuid().nullable(),
    })
    .strict();

class VinculoUsuarioController {
    async consultar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth?.areaNegocioId) {
                throw new AppError(
                    'Área de negócio não informada.',
                    400,
                    'AREA_NEGOCIO_NAO_INFORMADA',
                );
            }

            const profissionalId = validarProfissionalId(req.params.profissionalId);
            const data = await vinculoUsuarioService.consultar({
                organizacaoId: req.auth.organizacaoId,
                areaNegocioId: req.auth.areaNegocioId,
                profissionalId,
            });

            return res.status(200).json({
                status: 'success',
                message: 'Vínculo do profissional consultado.',
                data,
            });
        } catch (error) {
            next(error);
        }
    }

    async alterar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            if (!req.auth.areaNegocioId) {
                throw new AppError(
                    'Área de negócio não informada.',
                    400,
                    'AREA_NEGOCIO_NAO_INFORMADA',
                );
            }

            if (req.auth.perfil !== 'ADMINISTRADOR') {
                throw new AppError(
                    'Usuário sem permissão para esta operação.',
                    403,
                    'PERFIL_NAO_AUTORIZADO',
                );
            }

            const profissionalId = validarProfissionalId(req.params.profissionalId);

            const validacao = alterarVinculoSchema.safeParse(req.body);

            if (!validacao.success) {
                throw new AppError(
                    'Dados de vínculo inválidos.',
                    400,
                    'DADOS_VINCULO_USUARIO_INVALIDOS',
                );
            }

            const userAgent = req.get('user-agent');

            const resultado = await vinculoUsuarioService.alterar({
                organizacaoId: req.auth.organizacaoId,
                areaNegocioId: req.auth.areaNegocioId,
                administradorId: req.auth.usuarioId,
                profissionalId,
                usuarioId: validacao.data.usuarioId,
                requestId: req.requestId,
                ...(req.ip && { ip: req.ip }),
                ...(userAgent && { userAgent }),
            });

            return res.status(200).json({
                status: 'success',
                message: 'Vínculo do profissional atualizado com sucesso.',
                data: resultado,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new VinculoUsuarioController();
