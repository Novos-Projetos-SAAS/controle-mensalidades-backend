import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';
import whatsappService from './whatsapp.service.js';

function obterOrganizacao(req: Request): string {
    if (!req.auth) throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    return req.auth.organizacaoId;
}

function obterArea(req: Request): string {
    if (!req.auth?.areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }
    return req.auth.areaNegocioId;
}

class WhatsappController {
    async listarConfiguracoes(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await whatsappService.listarConfiguracoes(obterOrganizacao(req));
            return res.status(200).json({
                status: 'success',
                message: 'Configurações WhatsApp listadas.',
                data,
            });
        } catch (error) {
            next(error);
        }
    }

    async salvarConfiguracao(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.auth) {
                throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
            }
            const userAgent = req.get('user-agent');
            const data = await whatsappService.salvarConfiguracao(
                req.auth.organizacaoId,
                req.auth.usuarioId,
                req.body,
                { ...(req.ip ? { ip: req.ip } : {}), ...(userAgent ? { userAgent } : {}) },
            );
            return res.status(200).json({
                status: 'success',
                message: 'Configuração registrada como pendente de autorização Meta.',
                data,
            });
        } catch (error) {
            next(error);
        }
    }

    listarPropostasTemplates(_req: Request, res: Response, next: NextFunction) {
        try {
            return res.status(200).json({
                status: 'success',
                message: 'Propostas internas de templates.',
                data: whatsappService.listarPropostasTemplates(),
            });
        } catch (error) {
            next(error);
        }
    }

    async listarTarefas(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await whatsappService.listarTarefas(
                obterOrganizacao(req),
                obterArea(req),
                req.query,
            );
            return res
                .status(200)
                .json({ status: 'success', message: 'Lembretes listados.', data });
        } catch (error) {
            next(error);
        }
    }

    async listarMensagens(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await whatsappService.listarMensagens(
                obterOrganizacao(req),
                obterArea(req),
                req.query,
            );
            return res.status(200).json({ status: 'success', message: 'Histórico listado.', data });
        } catch (error) {
            next(error);
        }
    }

    async obterMetricas(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await whatsappService.obterMetricas(obterOrganizacao(req), obterArea(req));
            return res.status(200).json({
                status: 'success',
                message: 'Volume de mensagens WhatsApp.',
                data: { ...data, estimativa_custo: null },
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new WhatsappController();
