import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import auditoriaService from '../auditoria/auditoria.service.js';

import organizacoesService from './organizacoes.service.js';
import { validarAtualizacaoOrganizacao } from './organizacoes.validator.js';

class OrganizacoesController {
    async obterAtual(req: Request, res: Response, next: NextFunction) {
        try {
            const organizacao = await organizacoesService.obterAtual(req.auth?.organizacaoId);

            return res.status(200).json({
                status: 'success',
                message: 'Organização atual consultada com sucesso.',
                data: organizacao,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizarAtual(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const dados = validarAtualizacaoOrganizacao(req.body);
            const resultado = await organizacoesService.atualizarAtual(
                req.auth.organizacaoId,
                dados,
            );

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    organizacaoId: req.auth.organizacaoId,
                    usuarioId: req.auth.usuarioId,
                    acao: 'ORGANIZACAO.ATUALIZADA',
                    recurso: 'ORGANIZACAO',
                    recursoId: req.auth.organizacaoId,
                    dadosContexto: {
                        anterior: resultado.anterior,
                        novo: resultado.novo,
                        requestId: req.requestId,
                    },
                    ...(ip ? { ip } : {}),
                    ...(userAgent ? { userAgent } : {}),
                });
            } catch (auditoriaError) {
                console.error(
                    `Falha ao registrar auditoria de atualização da organização. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            return res.status(200).json({
                status: 'success',
                message: 'Organização atualizada com sucesso.',
                data: resultado.organizacao,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new OrganizacoesController();
