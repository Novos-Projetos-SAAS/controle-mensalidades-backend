import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const valorMonetario = z
    .string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, 'Valor monetário inválido.');

const criarPlanoSchema = z
    .object({
        nome: z.string().trim().min(1).max(150),
        descricao: z.string().trim().min(1).max(2000).optional(),
        valor_base: valorMonetario,
    })
    .strict();

const criarAssinaturaSchema = z
    .object({
        cliente_id: z.uuid(),
        plano_comercial_id: z.uuid(),
        dia_vencimento: z.number().int().min(1).max(31),
        inicio_em: z.iso.date(),
    })
    .strict();

const gerarMensalidadeSchema = z
    .object({
        competencia: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .transform((competencia) => `${competencia}-01`),
    })
    .strict();

const filtrosPaginados = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const listarAssinaturasSchema = filtrosPaginados.extend({
    status: z.enum(['ATIVA', 'CANCELADA', 'ENCERRADA']).optional(),
    clienteId: z.uuid().optional(),
});

const listarMensalidadesSchema = filtrosPaginados
    .extend({
        status: z.enum(['PENDENTE', 'PARCIAL', 'VENCIDA', 'PAGA', 'CANCELADA']).optional(),
        clienteId: z.uuid().optional(),
        competencia: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        vencimentoDe: z.iso.date().optional(),
        vencimentoAte: z.iso.date().optional(),
    })
    .strict()
    .refine(
        (filtros) =>
            !filtros.vencimentoDe ||
            !filtros.vencimentoAte ||
            filtros.vencimentoDe <= filtros.vencimentoAte,
        'Intervalo de vencimento inválido.',
    );

const instantePagamento = z.iso
    .datetime({ offset: true })
    .refine((instante) => !/\.\d{4,}(?:Z|[+-]\d{2}:\d{2})$/.test(instante));

const receberMensalidadeSchema = z
    .object({
        valor: valorMonetario,
        forma_pagamento: z.string().trim().min(1).max(30),
        pago_em: instantePagamento,
    })
    .strict();

const chaveIdempotenciaSchema = z.string().trim().min(1).max(150);

const resumoSchema = z
    .object({
        inicio: z.iso.date(),
        fim: z.iso.date(),
    })
    .strict()
    .refine((periodo) => periodo.inicio <= periodo.fim);

const idSchema = z.uuid();

function validar<T>(schema: z.ZodType<T>, value: unknown, code: string, message: string): T {
    const resultado = schema.safeParse(value);
    if (!resultado.success) throw new AppError(message, 400, code);
    return resultado.data;
}

export const validarCriacaoPlano = (value: unknown) =>
    validar(criarPlanoSchema, value, 'DADOS_PLANO_INVALIDOS', 'Dados do plano inválidos.');

export const validarCriacaoAssinatura = (value: unknown) =>
    validar(
        criarAssinaturaSchema,
        value,
        'DADOS_ASSINATURA_INVALIDOS',
        'Dados da assinatura inválidos.',
    );

export const validarGeracaoMensalidade = (value: unknown) =>
    validar(
        gerarMensalidadeSchema,
        value,
        'DADOS_MENSALIDADE_INVALIDOS',
        'Competência da mensalidade inválida.',
    );

export const validarListagemAssinaturas = (value: unknown) =>
    validar(
        listarAssinaturasSchema,
        value,
        'FILTROS_ASSINATURAS_INVALIDOS',
        'Filtros de assinaturas inválidos.',
    );

export const validarListagemMensalidades = (value: unknown) =>
    validar(
        listarMensalidadesSchema,
        value,
        'FILTROS_MENSALIDADES_INVALIDOS',
        'Filtros de mensalidades inválidos.',
    );

export const validarRecebimentoMensalidade = (value: unknown) =>
    validar(
        receberMensalidadeSchema,
        value,
        'DADOS_RECEBIMENTO_INVALIDOS',
        'Dados do recebimento inválidos.',
    );

export const validarChaveIdempotencia = (value: unknown) =>
    validar(
        chaveIdempotenciaSchema,
        value,
        'CHAVE_IDEMPOTENCIA_INVALIDA',
        'Informe uma chave de idempotência válida no header Idempotency-Key.',
    );

export const validarPeriodoResumo = (value: unknown) =>
    validar(resumoSchema, value, 'PERIODO_RESUMO_INVALIDO', 'Período do resumo inválido.');

export const validarIdFinanceiro = (value: unknown, recurso: string) =>
    validar(idSchema, value, `${recurso.toUpperCase()}_ID_INVALIDO`, `${recurso} inválido.`);

export function converterValorCentavos(value: string): bigint {
    const [inteiro, fracao = ''] = value.split('.');
    return BigInt(inteiro ?? '0') * 100n + BigInt(fracao.padEnd(2, '0'));
}

export function formatarCentavos(value: bigint): string {
    return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

export type CriarPlanoInput = z.infer<typeof criarPlanoSchema>;
export type CriarAssinaturaInput = z.infer<typeof criarAssinaturaSchema>;
export type GerarMensalidadeInput = z.infer<typeof gerarMensalidadeSchema>;
export type ListarAssinaturasInput = z.infer<typeof listarAssinaturasSchema>;
export type ListarMensalidadesInput = z.infer<typeof listarMensalidadesSchema>;
export type ReceberMensalidadeInput = z.infer<typeof receberMensalidadeSchema>;
export type PeriodoResumoInput = z.infer<typeof resumoSchema>;
