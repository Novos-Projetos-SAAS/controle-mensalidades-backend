import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';
import auditoriaService from '../auditoria/auditoria.service.js';

import sessoesClinicasService from './sessoes_clinicas.service.js';
import {
    validarCriacaoSessaoClinica,
    validarFiltrosSessoesClinicas,
    validarSessaoClinicaId,
} from './sessoes_clinicas.validator.js';

type AcaoAuditoriaSessaoClinica =
    'SESSAO_CLINICA.CRIADA' | 'SESSAO_CLINICA.LISTADA' | 'SESSAO_CLINICA.CONSULTADA';

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
    acao: AcaoAuditoriaSessaoClinica,
    sessaoClinicaId?: string,
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
            recurso: 'SESSAO_CLINICA',
            ...(sessaoClinicaId && {
                recursoId: sessaoClinicaId,
            }),
            dadosContexto: {
                areaNegocioId: contexto.areaNegocioId,
                requestId: req.requestId,
            },
            ...(ip && { ip }),
            ...(userAgent && { userAgent }),
        });
    } catch (auditoriaError) {
        console.error(
            `Falha ao registrar auditoria de sessão clínica. Request ID: ${req.requestId}`,
            auditoriaError,
        );
    }
}

class SessoesClinicasController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);

            const dados = validarCriacaoSessaoClinica(req.body);

            const sessao = await sessoesClinicasService.criar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                dados,
            );

            await registrarAuditoria(req, 'SESSAO_CLINICA.CRIADA', sessao.id);

            return res.status(201).json({
                status: 'success',
                message: 'Sessão clínica criada com sucesso.',
                data: sessao,
            });
        } catch (error) {
            next(error);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);

            const filtros = validarFiltrosSessoesClinicas(req.query);

            const sessoes = await sessoesClinicasService.listar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                filtros,
            );

            await registrarAuditoria(req, 'SESSAO_CLINICA.LISTADA');

            return res.status(200).json({
                status: 'success',
                message: 'Sessões clínicas listadas com sucesso.',
                data: sessoes,
            });
        } catch (error) {
            next(error);
        }
    }

    async buscarPorId(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);

            const sessaoClinicaId = validarSessaoClinicaId(req.params.sessaoClinicaId);

            const sessao = await sessoesClinicasService.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                sessaoClinicaId,
            );

            await registrarAuditoria(req, 'SESSAO_CLINICA.CONSULTADA', sessaoClinicaId);

            return res.status(200).json({
                status: 'success',
                message: 'Sessão clínica encontrada com sucesso.',
                data: sessao,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new SessoesClinicasController();
