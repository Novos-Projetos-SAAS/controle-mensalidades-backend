import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';
import auditoriaService from '../auditoria/auditoria.service.js';

import agendamentosService from './agendamentos.service.js';
import {
    validarAgendamentoId,
    validarAtualizacaoAgendamento,
    validarCancelamentoAgendamento,
    validarCriacaoAgendamento,
    validarFiltrosAgendamentos,
} from './agendamentos.validator.js';

type AcaoAuditoriaAgendamento =
    | 'AGENDAMENTO.CRIADO'
    | 'AGENDAMENTO.ATUALIZADO'
    | 'AGENDAMENTO.CONFIRMADO'
    | 'AGENDAMENTO.CONCLUIDO'
    | 'AGENDAMENTO.CANCELADO';

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
    agendamentoId: string,
    acao: AcaoAuditoriaAgendamento,
    metadata?: Record<string, unknown>,
) {
    const contexto = obterContexto(req);

    try {
        const ip = req.ip;
        const userAgent = req.get('user-agent');

        await auditoriaService.registrar({
            organizacaoId: contexto.organizacaoId,
            usuarioId: contexto.usuarioId,
            areaNegocioId: contexto.areaNegocioId,
            acao,
            recurso: 'AGENDAMENTO',
            recursoId: agendamentoId,
            dadosContexto: {
                agendamentoId,
                areaNegocioId: contexto.areaNegocioId,
                ...metadata,
                requestId: req.requestId,
            },
            ...(ip && { ip }),
            ...(userAgent && { userAgent }),
        });
    } catch (auditoriaError) {
        console.error(
            `Falha ao registrar auditoria de agendamento. Request ID: ${req.requestId}`,
            auditoriaError,
        );
    }
}

class AgendamentosController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const dados = validarCriacaoAgendamento(req.body);
            const agendamento = await agendamentosService.criar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                dados,
            );

            await registrarAuditoria(req, agendamento.id, 'AGENDAMENTO.CRIADO', {
                clienteId: agendamento.cliente_id,
                profissionalId: agendamento.profissional_id,
                servicoId: agendamento.servico_id,
            });

            return res.status(201).json({
                status: 'success',
                message: 'Agendamento criado com sucesso.',
                data: agendamento,
            });
        } catch (error) {
            next(error);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const filtros = validarFiltrosAgendamentos(req.query);
            const agendamentos = await agendamentosService.listar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                filtros,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Agendamentos listados com sucesso.',
                data: agendamentos,
            });
        } catch (error) {
            next(error);
        }
    }

    async buscarPorId(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const agendamentoId = validarAgendamentoId(req.params.agendamentoId);
            const agendamento = await agendamentosService.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Agendamento encontrado com sucesso.',
                data: agendamento,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const agendamentoId = validarAgendamentoId(req.params.agendamentoId);
            const dados = validarAtualizacaoAgendamento(req.body);
            const resultado = await agendamentosService.atualizar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
                dados,
            );

            await registrarAuditoria(req, agendamentoId, 'AGENDAMENTO.ATUALIZADO', {
                camposAlterados: resultado.camposAlterados,
            });

            return res.status(200).json({
                status: 'success',
                message: 'Agendamento atualizado com sucesso.',
                data: resultado.agendamento,
            });
        } catch (error) {
            next(error);
        }
    }

    async confirmar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const agendamentoId = validarAgendamentoId(req.params.agendamentoId);
            const agendamento = await agendamentosService.confirmar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
            );

            await registrarAuditoria(req, agendamentoId, 'AGENDAMENTO.CONFIRMADO');

            return res.status(200).json({
                status: 'success',
                message: 'Agendamento confirmado com sucesso.',
                data: agendamento,
            });
        } catch (error) {
            next(error);
        }
    }

    async concluir(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const agendamentoId = validarAgendamentoId(req.params.agendamentoId);
            const agendamento = await agendamentosService.concluir(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
            );

            await registrarAuditoria(req, agendamentoId, 'AGENDAMENTO.CONCLUIDO');

            return res.status(200).json({
                status: 'success',
                message: 'Agendamento concluído com sucesso.',
                data: agendamento,
            });
        } catch (error) {
            next(error);
        }
    }

    async cancelar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const agendamentoId = validarAgendamentoId(req.params.agendamentoId);
            const dados = validarCancelamentoAgendamento(req.body);
            const agendamento = await agendamentosService.cancelar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                contexto.usuarioId,
                agendamentoId,
                dados,
            );

            // Motivo livre é deliberadamente omitido da auditoria para evitar dados clínicos/PII.
            await registrarAuditoria(req, agendamentoId, 'AGENDAMENTO.CANCELADO');

            return res.status(200).json({
                status: 'success',
                message: 'Agendamento cancelado com sucesso.',
                data: agendamento,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AgendamentosController();
