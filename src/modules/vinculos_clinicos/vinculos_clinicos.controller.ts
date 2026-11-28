import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import AppError from '../../shared/errors/AppError.js';
import vinculosClinicosService from './vinculos_clinicos.service.js';

const uuid = z.uuid();
const criarSchema = z.object({
    cliente_id: uuid,
    profissional_id: uuid,
}).strict();
const revogarSchema = z.object({
    motivo: z.string().trim().min(10).max(500),
}).strict();

function contexto(req: Request) {
    if (!req.auth?.usuarioId || !req.auth.organizacaoId || !req.auth.areaNegocioId) {
        throw new AppError('Autenticação e área necessárias.', 401, 'AUTENTICACAO_NECESSARIA');
    }
    return {
        usuarioId: req.auth.usuarioId,
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
    };
}

function validar<T>(schema: z.ZodType<T>, valor: unknown): T {
    const v = schema.safeParse(valor);
    if (!v.success) {
        throw new AppError('Dados do vínculo clínico inválidos.', 400, 'VINCULO_CLINICO_INVALIDO');
    }
    return v.data;
}

class VinculosClinicosController {
    async conceder(req: Request, res: Response, next: NextFunction) {
        try {
            const ctx = contexto(req);
            const dados = validar(criarSchema, req.body);
            const registro = await vinculosClinicosService.conceder(ctx, {
                clienteId: dados.cliente_id,
                profissionalId: dados.profissional_id,
            });
            return res.status(201).json({ data: registro });
        } catch (error) { next(error); }
    }

    async revogar(req: Request, res: Response, next: NextFunction) {
        try {
            const ctx = contexto(req);
            const id = validar(uuid, req.params.vinculoId);
            const { motivo } = validar(revogarSchema, req.body);
            const resultado = await vinculosClinicosService.revogar(ctx, id, motivo);
            return res.status(200).json({ data: resultado });
        } catch (error) { next(error); }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const ctx = contexto(req);
            const clienteId = validar(uuid, req.params.clienteId);
            const registros = await vinculosClinicosService.listar(ctx, clienteId);
            return res.status(200).json({ data: registros });
        } catch (error) { next(error); }
    }
}

export default new VinculosClinicosController();
