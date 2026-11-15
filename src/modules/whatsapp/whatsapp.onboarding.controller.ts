import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';
import whatsappOnboardingService from './whatsapp.onboarding.service.js';
import {
    validarCallbackOnboardingWhatsapp,
    validarContinuarOnboardingWhatsapp,
    validarCorrelacaoOnboardingWhatsapp,
} from './whatsapp.onboarding.validator.js';

function contexto(req: Request) {
    if (!req.auth) throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    if (!req.auth.areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }
    return {
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
        usuarioId: req.auth.usuarioId,
    };
}

class WhatsappOnboardingController {
    obterConfiguracaoSdk(_req: Request, res: Response, next: NextFunction) {
        try {
            return res.status(200).json({
                status: 'success',
                data: whatsappOnboardingService.obterConfiguracaoSdk(),
            });
        } catch (error) {
            return next(error);
        }
    }

    async iniciar(req: Request, res: Response, next: NextFunction) {
        try {
            return res.status(201).json({
                status: 'success',
                data: await whatsappOnboardingService.iniciar(contexto(req)),
            });
        } catch (error) {
            return next(error);
        }
    }

    async concluir(req: Request, res: Response, next: NextFunction) {
        try {
            const userAgent = req.get('user-agent');
            const data = await whatsappOnboardingService.concluir(
                contexto(req),
                validarCallbackOnboardingWhatsapp(req.body),
                { ...(req.ip ? { ip: req.ip } : {}), ...(userAgent ? { userAgent } : {}) },
            );
            return res.status(data.status === 'CONCLUIDO' ? 200 : 202).json({
                status: 'success',
                data,
            });
        } catch (error) {
            return next(error);
        }
    }

    async continuar(req: Request, res: Response, next: NextFunction) {
        try {
            const correlacaoId = validarCorrelacaoOnboardingWhatsapp(req.params.correlacaoId);
            const body = validarContinuarOnboardingWhatsapp(req.body);
            const data = await whatsappOnboardingService.continuarProvisionamento(
                contexto(req),
                correlacaoId,
                body.registrationPin,
            );
            return res.status(data.status === 'CONCLUIDO' ? 200 : 202).json({
                status: 'success',
                data,
            });
        } catch (error) {
            return next(error);
        }
    }

    async obterStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const correlacaoId = validarCorrelacaoOnboardingWhatsapp(req.params.correlacaoId);
            const data = await whatsappOnboardingService.obterStatus(contexto(req), correlacaoId);
            return res.status(200).json({ status: 'success', data });
        } catch (error) {
            return next(error);
        }
    }
}

export default new WhatsappOnboardingController();
