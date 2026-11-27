import type { NextFunction, Request, Response } from 'express';
import AppError from '../../shared/errors/AppError.js';
import documentosClinicosService from './documentos_clinicos.service.js';
import {
    validarClienteClinicoId,
    validarDocumentoClinicoId,
    validarNovoDocumentoClinico,
    validarRevisaoDocumentoClinico,
    validarFinalizacaoDocumentoClinico,
    validarVersaoLaudoPdf,
} from './documentos_clinicos.validator.js';

function contexto(req: Request) {
    if (!req.auth?.usuarioId || !req.auth.organizacaoId || !req.auth.areaNegocioId) {
        throw new AppError('Autenticação e contexto clínico necessários.', 401, 'AUTENTICACAO_NECESSARIA');
    }
    return {
        usuarioId: req.auth.usuarioId,
        organizacaoId: req.auth.organizacaoId,
        areaNegocioId: req.auth.areaNegocioId,
    };
}

function meta(req: Request) {
    return { requestId: req.requestId };
}

class DocumentosClinicosController {
    async criar(req: Request, res: Response, next: NextFunction) {
        try {
            const documento = await documentosClinicosService.criar(
                contexto(req), validarNovoDocumentoClinico(req.body), meta(req),
            );
            return res.status(201).json({ data: documento });
        } catch (error) { next(error); }
    }

    async listar(req: Request, res: Response, next: NextFunction) {
        try {
            const documentos = await documentosClinicosService.listar(
                contexto(req), validarClienteClinicoId(req.params.clienteId), meta(req),
            );
            return res.status(200).json({ data: documentos });
        } catch (error) { next(error); }
    }

    async consultar(req: Request, res: Response, next: NextFunction) {
        try {
            const documento = await documentosClinicosService.consultar(
                contexto(req), validarDocumentoClinicoId(req.params.documentoId), meta(req),
            );
            return res.status(200).json({ data: documento });
        } catch (error) { next(error); }
    }

    async pdfLaudo(req: Request, res: Response, next: NextFunction) {
        try {
            const pdf = await documentosClinicosService.emitirPdfLaudo(
                contexto(req), validarDocumentoClinicoId(req.params.documentoId),
                validarVersaoLaudoPdf(req.query), meta(req),
            );
            res.status(200).set({
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="laudo-fisioterapeutico.pdf"',
                'Content-Length': String(pdf.length),
                'Cache-Control': 'private, no-store, max-age=0',
                'Pragma': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            });
            return res.end(pdf);
        } catch (error) { return next(error); }
    }

    async revisar(req: Request, res: Response, next: NextFunction) {
        try {
            const documento = await documentosClinicosService.revisar(
                contexto(req), validarDocumentoClinicoId(req.params.documentoId),
                validarRevisaoDocumentoClinico(req.body), meta(req),
            );
            return res.status(200).json({ data: documento });
        } catch (error) { next(error); }
    }

    async finalizar(req: Request, res: Response, next: NextFunction) {
        try {
            const documento = await documentosClinicosService.finalizar(
                contexto(req), validarDocumentoClinicoId(req.params.documentoId),
                validarFinalizacaoDocumentoClinico(req.body), meta(req),
            );
            return res.status(200).json({ data: documento });
        } catch (error) { next(error); }
    }
}
export default new DocumentosClinicosController();
