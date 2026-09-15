import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import auditoriaService from '../auditoria/auditoria.service.js';

import servicosService from './servicos.service.js';
import {
    validarAtualizacaoServico,
    validarCriacaoServico,
    validarFiltrosServicos,
    validarServicoId,
} from './servicos.validator.js';

type AcaoAuditoriaServico =
    'SERVICO.CRIADO' | 'SERVICO.ATUALIZADO' | 'SERVICO.INATIVADO' | 'SERVICO.REATIVADO';

function obterContexto(req: Request) {
    if (!req.auth) {
        throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    }

    if (!req.auth.areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    return {
        usuarioId: req.auth.usuarioId,
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
    };
}

async function registrarAuditoria(
    req: Request,
    servicoId: string,
    acao: AcaoAuditoriaServico,
    camposAlterados?: string[],
) {
    const contexto = obterContexto(req);

    try {
        const userAgent = req.get('user-agent');
        const ip = req.ip;

        await auditoriaService.registrar({
            organizacaoId: contexto.organizacaoId,
            usuarioId: contexto.usuarioId,
            areaNegocioId: contexto.areaNegocioId,
            acao,
            recurso: 'SERVICO',
            recursoId: servicoId,
            dadosContexto: {
                servicoId,
                areaNegocioId: contexto.areaNegocioId,
                ...(camposAlterados && { camposAlterados }),
                requestId: req.requestId,
            },
            ...(ip ? { ip } : {}),
            ...(userAgent ? { userAgent } : {}),
        });
    } catch (auditoriaError) {
        console.error(
            `Falha ao registrar auditoria de serviço. Request ID: ${req.requestId}`,
            auditoriaError,
        );
    }
}

class ServicosController {
    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const filtros = validarFiltrosServicos(req.query);
            const servicos = await servicosService.listar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                filtros,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Serviços listados com sucesso.',
                data: servicos,
            });
        } catch (error) {
            next(error);
        }
    }

    async buscarPorId(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const servicoId = validarServicoId(req.params.servicoId);
            const servico = await servicosService.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Serviço encontrado com sucesso.',
                data: servico,
            });
        } catch (error) {
            next(error);
        }
    }

    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const dados = validarCriacaoServico(req.body);
            const servico = await servicosService.criar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                dados,
            );

            await registrarAuditoria(req, servico.id, 'SERVICO.CRIADO');

            return res.status(201).json({
                status: 'success',
                message: 'Serviço criado com sucesso.',
                data: servico,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const servicoId = validarServicoId(req.params.servicoId);
            const dados = validarAtualizacaoServico(req.body);
            const resultado = await servicosService.atualizar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                dados,
            );

            await registrarAuditoria(
                req,
                servicoId,
                'SERVICO.ATUALIZADO',
                resultado.camposAlterados,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Serviço atualizado com sucesso.',
                data: resultado.servico,
            });
        } catch (error) {
            next(error);
        }
    }

    async inativar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const servicoId = validarServicoId(req.params.servicoId);
            const servico = await servicosService.inativar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
            );

            await registrarAuditoria(req, servicoId, 'SERVICO.INATIVADO');

            return res.status(200).json({
                status: 'success',
                message: 'Serviço inativado com sucesso.',
                data: servico,
            });
        } catch (error) {
            next(error);
        }
    }

    async reativar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const servicoId = validarServicoId(req.params.servicoId);
            const servico = await servicosService.reativar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
            );

            await registrarAuditoria(req, servicoId, 'SERVICO.REATIVADO');

            return res.status(200).json({
                status: 'success',
                message: 'Serviço reativado com sucesso.',
                data: servico,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new ServicosController();
