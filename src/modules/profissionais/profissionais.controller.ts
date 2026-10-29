import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import auditoriaService from '../auditoria/auditoria.service.js';

import profissionaisService from './profissionais.service.js';
import {
    validarAtualizacaoProfissional,
    validarCriacaoProfissional,
    validarFiltrosProfissionais,
    validarProfissionalId,
} from './profissionais.validator.js';

type AcaoAuditoriaProfissional =
    | 'PROFISSIONAL.CRIADO'
    | 'PROFISSIONAL.ATUALIZADO'
    | 'PROFISSIONAL.INATIVADO'
    | 'PROFISSIONAL.REATIVADO';

function obterContexto(req: Request) {
    if (!req.auth) {
        throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    }

    return {
        usuarioId: req.auth.usuarioId,
        organizacaoId: req.auth.organizacaoId,
    };
}

async function registrarAuditoria(
    req: Request,
    profissionalId: string,
    acao: AcaoAuditoriaProfissional,
    dadosContexto?: Record<string, unknown>,
) {
    const contexto = obterContexto(req);

    try {
        const userAgent = req.get('user-agent');
        const ip = req.ip;

        await auditoriaService.registrar({
            organizacaoId: contexto.organizacaoId,
            usuarioId: contexto.usuarioId,
            acao,
            recurso: 'PROFISSIONAL',
            recursoId: profissionalId,
            dadosContexto: {
                profissionalId,
                ...dadosContexto,
                requestId: req.requestId,
            },
            ...(ip ? { ip } : {}),
            ...(userAgent ? { userAgent } : {}),
        });
    } catch (auditoriaError) {
        console.error(
            `Falha ao registrar auditoria de profissional. Request ID: ${req.requestId}`,
            auditoriaError,
        );
    }
}

class ProfissionaisController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const dados = validarCriacaoProfissional(req.body);

            const profissional = await profissionaisService.criar(contexto.organizacaoId, dados);

            await registrarAuditoria(req, profissional.id, 'PROFISSIONAL.CRIADO', {
                areas: profissional.areas.map((area) => area.id),
            });

            return res.status(201).json({
                status: 'success',
                message: 'Profissional criado com sucesso.',
                data: profissional,
            });
        } catch (error) {
            next(error);
        }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const filtros = validarFiltrosProfissionais(req.query);

            const profissionais = await profissionaisService.listar(
                contexto.organizacaoId,
                filtros,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Profissionais listados com sucesso.',
                data: profissionais,
            });
        } catch (error) {
            next(error);
        }
    }

    async buscarPorId(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const profissionalId = validarProfissionalId(req.params.profissionalId);

            const profissional = await profissionaisService.buscarPorId(
                contexto.organizacaoId,
                profissionalId,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Profissional encontrado com sucesso.',
                data: profissional,
            });
        } catch (error) {
            next(error);
        }
    }

    async atualizar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const profissionalId = validarProfissionalId(req.params.profissionalId);
            const dados = validarAtualizacaoProfissional(req.body);

            const resultado = await profissionaisService.atualizar(
                contexto.organizacaoId,
                profissionalId,
                dados,
            );

            await registrarAuditoria(
                req,
                profissionalId,
                'PROFISSIONAL.ATUALIZADO',
                resultado.auditoria,
            );

            return res.status(200).json({
                status: 'success',
                message: 'Profissional atualizado com sucesso.',
                data: resultado.profissional,
            });
        } catch (error) {
            next(error);
        }
    }

    async inativar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const profissionalId = validarProfissionalId(req.params.profissionalId);

            const profissional = await profissionaisService.inativar(
                contexto.organizacaoId,
                profissionalId,
            );

            await registrarAuditoria(req, profissionalId, 'PROFISSIONAL.INATIVADO', {
                estadoAnterior: 'ATIVO',
                estadoNovo: 'INATIVO',
            });

            return res.status(200).json({
                status: 'success',
                message: 'Profissional inativado com sucesso.',
                data: profissional,
            });
        } catch (error) {
            next(error);
        }
    }

    async reativar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const profissionalId = validarProfissionalId(req.params.profissionalId);

            const profissional = await profissionaisService.reativar(
                contexto.organizacaoId,
                profissionalId,
            );

            await registrarAuditoria(req, profissionalId, 'PROFISSIONAL.REATIVADO', {
                estadoAnterior: 'INATIVO',
                estadoNovo: 'ATIVO',
            });

            return res.status(200).json({
                status: 'success',
                message: 'Profissional reativado com sucesso.',
                data: profissional,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new ProfissionaisController();
