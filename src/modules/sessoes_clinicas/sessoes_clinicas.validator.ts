import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const uuidSchema = z.uuid();

const dataHoraSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
    .refine((valor) => Number.isFinite(Date.parse(valor)));

const textoClinicoSchema = z.string().trim().min(1).max(10000);

const criarSessaoClinicaSchema = z
    .object({
        cliente_id: uuidSchema,
        profissional_id: uuidSchema,
        agendamento_id: uuidSchema.optional(),
        data_sessao: dataHoraSchema,
        evolucao: textoClinicoSchema,
        diagnostico_fisioterapeutico: textoClinicoSchema.optional(),
        prognostico: textoClinicoSchema.optional(),
        plano_terapeutico: textoClinicoSchema.optional(),
        observacoes: textoClinicoSchema.optional(),
    })
    .strict();

const atualizarSessaoClinicaSchema = z
    .object({
        evolucao: textoClinicoSchema.optional(),
        diagnostico_fisioterapeutico: textoClinicoSchema.nullable().optional(),
        prognostico: textoClinicoSchema.nullable().optional(),
        plano_terapeutico: textoClinicoSchema.nullable().optional(),
        observacoes: textoClinicoSchema.nullable().optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const filtrosSessoesClinicasSchema = z
    .object({
        clienteId: uuidSchema.optional(),
        profissionalId: uuidSchema.optional(),
        inicio: dataHoraSchema,
        fim: dataHoraSchema,
    })
    .strict()
    .refine((dados) => Date.parse(dados.inicio) < Date.parse(dados.fim));

export type CriarSessaoClinicaInput = z.infer<typeof criarSessaoClinicaSchema>;

export type AtualizarSessaoClinicaInput = z.infer<typeof atualizarSessaoClinicaSchema>;

export type FiltrosSessoesClinicasInput = z.infer<typeof filtrosSessoesClinicasSchema>;

export function validarSessaoClinicaId(valor: unknown) {
    const resultado = uuidSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Sessão clínica inválida.', 400, 'SESSAO_CLINICA_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarCriacaoSessaoClinica(valor: unknown): CriarSessaoClinicaInput {
    const resultado = criarSessaoClinicaSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Dados da sessão clínica inválidos.',
            400,
            'DADOS_SESSAO_CLINICA_INVALIDOS',
        );
    }

    return resultado.data;
}

export function validarAtualizacaoSessaoClinica(valor: unknown): AtualizarSessaoClinicaInput {
    const resultado = atualizarSessaoClinicaSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Dados da sessão clínica inválidos.',
            400,
            'DADOS_SESSAO_CLINICA_INVALIDOS',
        );
    }

    return resultado.data;
}

export function validarFiltrosSessoesClinicas(valor: unknown): FiltrosSessoesClinicasInput {
    const resultado = filtrosSessoesClinicasSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Filtros de sessões clínicas inválidos.',
            400,
            'FILTROS_SESSOES_CLINICAS_INVALIDOS',
        );
    }

    return resultado.data;
}
