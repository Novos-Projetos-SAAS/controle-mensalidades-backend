import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import sessoesClinicasAcessoService from './sessoes_clinicas.acesso.service.js';
import sessoesClinicasLeiturasTransacionaisService from './sessoes_clinicas.leituras_transacionais.service.js';

import type { MetadadosAuditoriaClinica } from './sessoes_clinicas.auditoria_transacional.js';

import {
    validarAtualizacaoSessaoClinica,
    validarCriacaoSessaoClinica,
    validarFiltrosSessoesClinicas,
    validarSessaoClinicaId,
} from './sessoes_clinicas.validator.js';

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

function obterMetadados(req: Request): MetadadosAuditoriaClinica {
    const userAgent = req.get('user-agent');

    return {
        requestId: req.requestId,
        ...(req.ip && { ip: req.ip }),
        ...(userAgent && { userAgent }),
    };
}

class SessoesClinicasController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const dados = validarCriacaoSessaoClinica(req.body);

            // A auditoria é inserida pelo Service na mesma
            // transação que cria a sessão clínica.
            const sessao = await sessoesClinicasAcessoService.criar(
                contexto,
                dados,
                obterMetadados(req),
            );

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

            const sessoes = await sessoesClinicasLeiturasTransacionaisService.listar(
                contexto,
                filtros,
                obterMetadados(req),
            );

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

            const sessao = await sessoesClinicasLeiturasTransacionaisService.buscarPorId(
                contexto,
                sessaoClinicaId,
                obterMetadados(req),
            );

            return res.status(200).json({
                status: 'success',
                message: 'Sessão clínica encontrada com sucesso.',
                data: sessao,
            });
        } catch (error) {
            next(error);
        }
    }

    async corrigir(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const sessaoClinicaId = validarSessaoClinicaId(req.params.sessaoClinicaId);
            const dados = validarAtualizacaoSessaoClinica(req.body);

            // O UPDATE, o histórico e a auditoria serão
            // confirmados ou revertidos juntos.
            const resultado = await sessoesClinicasAcessoService.corrigir(
                contexto,
                sessaoClinicaId,
                dados,
                obterMetadados(req),
            );

            return res.status(200).json({
                status: 'success',
                message: 'Sessão clínica corrigida com sucesso.',
                data: resultado.sessao,
            });
        } catch (error) {
            next(error);
        }
    }

    async listarHistoricoCorrecoes(req: Request, res: Response, next: NextFunction) {
        try {
            const contexto = obterContexto(req);
            const sessaoClinicaId = validarSessaoClinicaId(req.params.sessaoClinicaId);

            const historico =
                await sessoesClinicasLeiturasTransacionaisService.listarHistoricoCorrecoes(
                    contexto,
                    sessaoClinicaId,
                    obterMetadados(req),
                );

            return res.status(200).json({
                status: 'success',
                message: 'Histórico de correções consultado com sucesso.',
                data: historico,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new SessoesClinicasController();
