import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import auditoriaService from '../auditoria/auditoria.service.js';

import usuariosService from './usuarios.service.js';
import {
    validarAtualizacaoVinculo,
    validarCriacaoUsuario,
    validarUsuarioId,
} from './usuarios.validator.js';

class UsuariosController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const dados = validarCriacaoUsuario(req.body);
            const usuario = await usuariosService.criar(req.auth.organizacaoId, dados);

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    organizacaoId: req.auth.organizacaoId,
                    usuarioId: req.auth.usuarioId,
                    acao: 'USUARIO.CRIADO',
                    recurso: 'USUARIO',
                    recursoId: usuario.id,
                    dadosContexto: {
                        usuarioCriadoId: usuario.id,
                        perfil: usuario.perfil,
                        ativo: usuario.ativo,
                        requestId: req.requestId,
                    },
                    ...(ip ? { ip } : {}),
                    ...(userAgent ? { userAgent } : {}),
                });
            } catch (auditoriaError) {
                console.error(
                    `Falha ao registrar auditoria de criação de usuário. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            return res.status(201).json({
                status: 'success',
                message: 'Usuário criado com sucesso.',
                data: usuario,
            });
        } catch (error) {
            next(error);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const usuarios = await usuariosService.listarPorOrganizacao(req.auth?.organizacaoId);

            return res.status(200).json({
                status: 'success',
                message: 'Usuários da organização listados com sucesso.',
                data: usuarios,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizarVinculo(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const usuarioId = validarUsuarioId(req.params.usuarioId);
            const dados = validarAtualizacaoVinculo(req.body);
            const resultado = await usuariosService.atualizarVinculo(
                req.auth.organizacaoId,
                usuarioId,
                dados,
            );

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    organizacaoId: req.auth.organizacaoId,
                    usuarioId: req.auth.usuarioId,
                    acao: 'USUARIO.VINCULO_ATUALIZADO',
                    recurso: 'USUARIO_ORGANIZACAO',
                    recursoId: usuarioId,
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
                    `Falha ao registrar auditoria de vínculo de usuário. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            return res.status(200).json({
                status: 'success',
                message: 'Vínculo do usuário atualizado com sucesso.',
                data: resultado.usuario,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new UsuariosController();
