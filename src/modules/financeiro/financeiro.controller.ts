import type { NextFunction, Request, Response } from 'express';

import AppError from '../../shared/errors/AppError.js';

import financeiroService from './financeiro.service.js';
import {
    validarChaveIdempotencia,
    validarCriacaoAssinatura,
    validarCriacaoPlano,
    validarGeracaoMensalidade,
    validarIdFinanceiro,
    validarListagemAssinaturas,
    validarListagemMensalidades,
    validarPeriodoResumo,
    validarRecebimentoMensalidade,
} from './financeiro.validator.js';

function obterContexto(req: Request) {
    if (!req.auth) {
        throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    }
    if (!req.auth.areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    const userAgent = req.get('user-agent');
    return {
        usuarioId: req.auth.usuarioId,
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
        requestId: req.requestId,
        ...(req.ip ? { ip: req.ip } : {}),
        ...(userAgent ? { userAgent } : {}),
    };
}

class FinanceiroController {
    async listarPlanos(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await financeiroService.listarPlanos(obterContexto(req));
            return res.status(200).json({ status: 'success', message: 'Planos listados.', data });
        } catch (error) {
            next(error);
        }
    }

    async buscarPlano(req: Request, res: Response, next: NextFunction) {
        try {
            const id = validarIdFinanceiro(req.params.planoId, 'plano');
            const data = await financeiroService.buscarPlano(obterContexto(req), id);
            return res.status(200).json({ status: 'success', message: 'Plano encontrado.', data });
        } catch (error) {
            next(error);
        }
    }

    async criarPlano(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await financeiroService.criarPlano(
                obterContexto(req),
                validarCriacaoPlano(req.body),
            );
            return res.status(201).json({ status: 'success', message: 'Plano criado.', data });
        } catch (error) {
            next(error);
        }
    }

    async listarAssinaturas(req: Request, res: Response, next: NextFunction) {
        try {
            const filtros = validarListagemAssinaturas(req.query);
            const data = await financeiroService.listarAssinaturas(obterContexto(req), filtros);
            return res
                .status(200)
                .json({ status: 'success', message: 'Assinaturas listadas.', data });
        } catch (error) {
            next(error);
        }
    }

    async buscarAssinatura(req: Request, res: Response, next: NextFunction) {
        try {
            const id = validarIdFinanceiro(req.params.assinaturaId, 'assinatura');
            const data = await financeiroService.buscarAssinatura(obterContexto(req), id);
            return res
                .status(200)
                .json({ status: 'success', message: 'Assinatura encontrada.', data });
        } catch (error) {
            next(error);
        }
    }

    async criarAssinatura(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await financeiroService.criarAssinatura(
                obterContexto(req),
                validarCriacaoAssinatura(req.body),
            );
            return res.status(201).json({ status: 'success', message: 'Assinatura criada.', data });
        } catch (error) {
            next(error);
        }
    }

    async gerarMensalidade(req: Request, res: Response, next: NextFunction) {
        try {
            const assinaturaId = validarIdFinanceiro(req.params.assinaturaId, 'assinatura');
            const resultado = await financeiroService.gerarMensalidade(
                obterContexto(req),
                assinaturaId,
                validarGeracaoMensalidade(req.body),
            );
            return res.status(resultado.criada ? 201 : 200).json({
                status: 'success',
                message: resultado.criada ? 'Mensalidade gerada.' : 'Mensalidade já existente.',
                data: resultado,
            });
        } catch (error) {
            next(error);
        }
    }

    async listarMensalidades(req: Request, res: Response, next: NextFunction) {
        try {
            const filtros = validarListagemMensalidades(req.query);
            const data = await financeiroService.listarMensalidades(obterContexto(req), filtros);
            return res
                .status(200)
                .json({ status: 'success', message: 'Mensalidades listadas.', data });
        } catch (error) {
            next(error);
        }
    }

    async buscarMensalidade(req: Request, res: Response, next: NextFunction) {
        try {
            const id = validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade');
            const data = await financeiroService.buscarMensalidade(obterContexto(req), id);
            return res
                .status(200)
                .json({ status: 'success', message: 'Mensalidade encontrada.', data });
        } catch (error) {
            next(error);
        }
    }

    async registrarRecebimento(req: Request, res: Response, next: NextFunction) {
        try {
            const mensalidadeId = validarIdFinanceiro(req.params.mensalidadeId, 'mensalidade');
            const chave = validarChaveIdempotencia(req.get('Idempotency-Key'));
            const resultado = await financeiroService.registrarRecebimento(
                obterContexto(req),
                mensalidadeId,
                chave,
                validarRecebimentoMensalidade(req.body),
            );
            return res.status(resultado.repetido ? 200 : 201).json({
                status: 'success',
                message: resultado.repetido
                    ? 'Recebimento já registrado.'
                    : 'Recebimento registrado.',
                data: resultado,
            });
        } catch (error) {
            next(error);
        }
    }

    async obterResumo(req: Request, res: Response, next: NextFunction) {
        try {
            const periodo = validarPeriodoResumo(req.query);
            const data = await financeiroService.obterResumo(obterContexto(req), periodo);
            return res.status(200).json({ status: 'success', message: 'Resumo financeiro.', data });
        } catch (error) {
            next(error);
        }
    }
}

export default new FinanceiroController();
