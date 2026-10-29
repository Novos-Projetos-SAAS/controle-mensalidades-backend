import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const profissionalIdSchema = z.uuid();

const textoOpcional = (maximo: number) =>
    z.preprocess((valor) => {
        if (typeof valor !== 'string') {
            return valor;
        }

        const texto = valor.trim();

        return texto === '' ? undefined : texto;
    }, z.string().max(maximo).optional());

const textoNullable = (maximo: number) =>
    z.union([z.string().trim().min(1).max(maximo), z.null()]).optional();

const cpfSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const cpf = valor.replace(/\D/g, '');

    return cpf === '' ? undefined : cpf;
}, z.string().length(11).optional());

const cpfNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : valor),
        z.union([z.string().length(11), z.null()]),
    )
    .optional();

const telefoneSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const telefone = valor.replace(/\D/g, '');

    return telefone === '' ? undefined : telefone;
}, z.string().min(8).max(15).optional());

const telefoneNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : valor),
        z.union([z.string().min(8).max(15), z.null()]),
    )
    .optional();

const emailSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const email = valor.trim().toLowerCase();

    return email === '' ? undefined : email;
}, z.email().max(150).optional());

const emailNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor),
        z.union([z.email().max(150), z.null()]),
    )
    .optional();

const ufConselhoSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const uf = valor.trim().toUpperCase();

    return uf === '' ? undefined : uf;
}, z.string().length(2).optional());

const ufConselhoNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim().toUpperCase() : valor),
        z.union([z.string().length(2), z.null()]),
    )
    .optional();

const areasSchema = z
    .array(z.uuid())
    .min(1)
    .superRefine((areas, ctx) => {
        if (new Set(areas).size !== areas.length) {
            ctx.addIssue({
                code: 'custom',
                message: 'Áreas de negócio duplicadas não são permitidas.',
            });
        }
    });

const criarProfissionalSchema = z
    .object({
        nome: z.string().trim().min(1).max(150),
        cpf: cpfSchema,
        email: emailSchema,
        telefone: telefoneSchema,
        conselho: textoOpcional(30),
        numero_conselho: textoOpcional(50),
        uf_conselho: ufConselhoSchema,
        areas: areasSchema,
    })
    .strict();

const atualizarProfissionalSchema = z
    .object({
        nome: z.string().trim().min(1).max(150).optional(),
        cpf: cpfNullableSchema,
        email: emailNullableSchema,
        telefone: telefoneNullableSchema,
        conselho: textoNullable(30),
        numero_conselho: textoNullable(50),
        uf_conselho: ufConselhoNullableSchema,
        areas: areasSchema.optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const filtrosProfissionaisSchema = z
    .object({
        busca: z.string().trim().min(1).max(150).optional(),
        ativo: z
            .enum(['true', 'false'])
            .transform((valor) => valor === 'true')
            .optional(),
        areaNegocioId: z.uuid().optional(),
    })
    .strict();

export type CriarProfissionalInput = z.infer<typeof criarProfissionalSchema>;

export type AtualizarProfissionalInput = z.infer<typeof atualizarProfissionalSchema>;

export type FiltrosProfissionaisInput = z.infer<typeof filtrosProfissionaisSchema>;

export function validarProfissionalId(valor: unknown) {
    const resultado = profissionalIdSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Profissional inválido.', 400, 'PROFISSIONAL_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarCriacaoProfissional(valor: unknown): CriarProfissionalInput {
    const resultado = criarProfissionalSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do profissional inválidos.', 400, 'DADOS_PROFISSIONAL_INVALIDOS');
    }

    return resultado.data;
}

export function validarAtualizacaoProfissional(valor: unknown): AtualizarProfissionalInput {
    const resultado = atualizarProfissionalSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do profissional inválidos.', 400, 'DADOS_PROFISSIONAL_INVALIDOS');
    }

    return resultado.data;
}

export function validarFiltrosProfissionais(valor: unknown): FiltrosProfissionaisInput {
    const resultado = filtrosProfissionaisSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Filtros de profissionais inválidos.',
            400,
            'FILTROS_PROFISSIONAIS_INVALIDOS',
        );
    }

    return resultado.data;
}
