import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const clienteIdSchema = z.uuid();

const textoOpcional = (maximo: number) =>
    z.preprocess((valor) => {
        if (typeof valor !== 'string') {
            return valor;
        }

        const texto = valor.trim();

        return texto === '' ? undefined : texto;
    }, z.string().max(maximo).optional());

const cpfSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const cpf = valor.replace(/\D/g, '');

    return cpf === '' ? undefined : cpf;
}, z.string().length(11).optional());

const telefoneSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const telefone = valor.replace(/\D/g, '');

    return telefone === '' ? undefined : telefone;
}, z.string().min(8).max(15).optional());

const emailSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const email = valor.trim().toLowerCase();

    return email === '' ? undefined : email;
}, z.email().max(150).optional());

const dataNascimentoSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const data = valor.trim();

    return data === '' ? undefined : data;
}, z.iso.date().optional());

const cepSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const cep = valor.replace(/\D/g, '');

    return cep === '' ? undefined : cep;
}, z.string().length(8).optional());

const ufSchema = z.preprocess((valor) => {
    if (typeof valor !== 'string') {
        return valor;
    }

    const uf = valor.trim().toUpperCase();

    return uf === '' ? undefined : uf;
}, z.string().length(2).optional());

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

const textoNullable = (maximo: number) =>
    z.union([z.string().trim().min(1).max(maximo), z.null()]).optional();

const cpfNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : valor),
        z.union([z.string().length(11), z.null()]),
    )
    .optional();

const telefoneNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : valor),
        z.union([z.string().min(8).max(15), z.null()]),
    )
    .optional();

const emailNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor),
        z.union([z.email().max(150), z.null()]),
    )
    .optional();

const dataNascimentoNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim() : valor),
        z.union([z.iso.date(), z.null()]),
    )
    .optional();

const cepNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.replace(/\D/g, '') : valor),
        z.union([z.string().length(8), z.null()]),
    )
    .optional();

const ufNullableSchema = z
    .preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim().toUpperCase() : valor),
        z.union([z.string().length(2), z.null()]),
    )
    .optional();

const criarClienteSchema = z
    .object({
        nome: z.string().trim().min(1).max(150),
        cpf: cpfSchema,
        data_nascimento: dataNascimentoSchema,
        telefone: telefoneSchema,
        email: emailSchema,
        sexo: textoOpcional(30),
        cep: cepSchema,
        logradouro: textoOpcional(150),
        numero: textoOpcional(20),
        complemento: textoOpcional(100),
        bairro: textoOpcional(100),
        cidade: textoOpcional(100),
        uf: ufSchema,
        observacao: textoOpcional(5000),
        areas: areasSchema,
    })
    .strict();

const atualizarClienteSchema = z
    .object({
        nome: z.string().trim().min(1).max(150).optional(),
        cpf: cpfNullableSchema,
        data_nascimento: dataNascimentoNullableSchema,
        telefone: telefoneNullableSchema,
        email: emailNullableSchema,
        sexo: textoNullable(30),
        cep: cepNullableSchema,
        logradouro: textoNullable(150),
        numero: textoNullable(20),
        complemento: textoNullable(100),
        bairro: textoNullable(100),
        cidade: textoNullable(100),
        uf: ufNullableSchema,
        observacao: textoNullable(5000),
        areas: areasSchema.optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const filtrosClientesSchema = z
    .object({
        busca: z.string().trim().min(1).max(150).optional(),
        ativo: z
            .enum(['true', 'false'])
            .transform((valor) => valor === 'true')
            .optional(),
        areaNegocioId: z.uuid().optional(),
    })
    .strict();

const consentimentoWhatsappSchema = z
    .object({
        origem: z.string().trim().min(1).max(50),
    })
    .strict();

export type CriarClienteInput = z.infer<typeof criarClienteSchema>;

export type AtualizarClienteInput = z.infer<typeof atualizarClienteSchema>;

export type FiltrosClientesInput = z.infer<typeof filtrosClientesSchema>;

export type ConsentimentoWhatsappInput = z.infer<typeof consentimentoWhatsappSchema>;

export function validarClienteId(valor: unknown) {
    const resultado = clienteIdSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Cliente inválido.', 400, 'CLIENTE_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarCriacaoCliente(valor: unknown): CriarClienteInput {
    const resultado = criarClienteSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do cliente inválidos.', 400, 'DADOS_CLIENTE_INVALIDOS');
    }

    return resultado.data;
}

export function validarAtualizacaoCliente(valor: unknown): AtualizarClienteInput {
    const resultado = atualizarClienteSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do cliente inválidos.', 400, 'DADOS_CLIENTE_INVALIDOS');
    }

    return resultado.data;
}

export function validarFiltrosClientes(valor: unknown): FiltrosClientesInput {
    const resultado = filtrosClientesSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Filtros de clientes inválidos.', 400, 'FILTROS_CLIENTES_INVALIDOS');
    }

    return resultado.data;
}

export function validarConsentimentoWhatsapp(valor: unknown): ConsentimentoWhatsappInput {
    const resultado = consentimentoWhatsappSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Dados do consentimento de WhatsApp inválidos.',
            400,
            'DADOS_CONSENTIMENTO_WHATSAPP_INVALIDOS',
        );
    }

    return resultado.data;
}
