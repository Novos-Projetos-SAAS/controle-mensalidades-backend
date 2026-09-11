import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import auditoriaService from '../auditoria/auditoria.service.js';

import clientesService from './clientes.service.js';
import {
    validarAtualizacaoCliente,
    validarClienteId,
    validarCriacaoCliente,
    validarFiltrosClientes,
} from './clientes.validator.js';

type AcaoLifecycleCliente = 'CLIENTE.INATIVADO' | 'CLIENTE.REATIVADO';

async function registrarAuditoriaLifecycle(
    req: Request,
    clienteId: string,
    acao: AcaoLifecycleCliente,
    estadoAnterior: 'ATIVO' | 'INATIVO',
    estadoNovo: 'ATIVO' | 'INATIVO',
) {
    if (!req.auth) {
        return;
    }

    try {
        const userAgent = req.get('user-agent');
        const ip = req.ip;

        await auditoriaService.registrar({
            organizacaoId: req.auth.organizacaoId,
            usuarioId: req.auth.usuarioId,
            acao,
            recurso: 'CLIENTE',
            recursoId: clienteId,
            dadosContexto: {
                clienteId,
                estadoAnterior,
                estadoNovo,
                requestId: req.requestId,
            },
            ...(ip ? { ip } : {}),
            ...(userAgent ? { userAgent } : {}),
        });
    } catch (auditoriaError) {
        console.error(
            `Falha ao registrar auditoria de lifecycle de cliente. Request ID: ${req.requestId}`,
            auditoriaError,
        );
    }
}

class ClientesController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const dados = validarCriacaoCliente(req.body);

            const cliente = await clientesService.criar(req.auth.organizacaoId, dados);

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    organizacaoId: req.auth.organizacaoId,
                    usuarioId: req.auth.usuarioId,
                    acao: 'CLIENTE.CRIADO',
                    recurso: 'CLIENTE',
                    recursoId: cliente.id,
                    dadosContexto: {
                        clienteId: cliente.id,
                        areas: cliente.areas.map((area) => area.id),
                        requestId: req.requestId,
                    },
                    ...(ip ? { ip } : {}),
                    ...(userAgent ? { userAgent } : {}),
                });
            } catch (auditoriaError) {
                console.error(
                    `Falha ao registrar auditoria de criação de cliente. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            return res.status(201).json({
                status: 'success',
                message: 'Cliente criado com sucesso.',
                data: cliente,
            });
        } catch (error) {
            next(error);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const filtros = validarFiltrosClientes(req.query);

            const clientes = await clientesService.listar(req.auth.organizacaoId, filtros);

            return res.status(200).json({
                status: 'success',
                message: 'Clientes listados com sucesso.',
                data: clientes,
            });
        } catch (error) {
            next(error);
        }
    }

    async buscarPorId(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const clienteId = validarClienteId(req.params.clienteId);

            const cliente = await clientesService.buscarPorId(req.auth.organizacaoId, clienteId);

            return res.status(200).json({
                status: 'success',
                message: 'Cliente encontrado com sucesso.',
                data: cliente,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const clienteId = validarClienteId(req.params.clienteId);
            const dados = validarAtualizacaoCliente(req.body);
            const resultado = await clientesService.atualizar(
                req.auth.organizacaoId,
                clienteId,
                dados,
            );

            try {
                const userAgent = req.get('user-agent');
                const ip = req.ip;

                await auditoriaService.registrar({
                    organizacaoId: req.auth.organizacaoId,
                    usuarioId: req.auth.usuarioId,
                    acao: 'CLIENTE.ATUALIZADO',
                    recurso: 'CLIENTE',
                    recursoId: clienteId,
                    dadosContexto: {
                        clienteId,
                        ...resultado.auditoria,
                        requestId: req.requestId,
                    },
                    ...(ip ? { ip } : {}),
                    ...(userAgent ? { userAgent } : {}),
                });
            } catch (auditoriaError) {
                console.error(
                    `Falha ao registrar auditoria de atualização de cliente. Request ID: ${req.requestId}`,
                    auditoriaError,
                );
            }

            return res.status(200).json({
                status: 'success',
                message: 'Cliente atualizado com sucesso.',
                data: resultado.cliente,
            });
        } catch (error) {
            next(error);
        }
    }

    async inativar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const clienteId = validarClienteId(req.params.clienteId);
            const cliente = await clientesService.inativar(req.auth.organizacaoId, clienteId);

            await registrarAuditoriaLifecycle(
                req,
                clienteId,
                'CLIENTE.INATIVADO',
                'ATIVO',
                'INATIVO',
            );

            return res.status(200).json({
                status: 'success',
                message: 'Cliente inativado com sucesso.',
                data: cliente,
            });
        } catch (error) {
            next(error);
        }
    }

    async reativar(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }

            const clienteId = validarClienteId(req.params.clienteId);
            const cliente = await clientesService.reativar(req.auth.organizacaoId, clienteId);

            await registrarAuditoriaLifecycle(
                req,
                clienteId,
                'CLIENTE.REATIVADO',
                'INATIVO',
                'ATIVO',
            );

            return res.status(200).json({
                status: 'success',
                message: 'Cliente reativado com sucesso.',
                data: cliente,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new ClientesController();
