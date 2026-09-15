import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const VALOR_MAXIMO = 9_999_999_999.99;

function possuiNoMaximoDuasCasasDecimais(valor: number) {
    const centavos = valor * 100;
    const tolerancia = Number.EPSILON * Math.max(1, Math.abs(centavos)) * 4;

    return Math.abs(centavos - Math.round(centavos)) <= tolerancia;
}

const servicoIdSchema = z.uuid();

const nomeSchema = z.string().trim().min(1).max(150);

const descricaoSchema = z.string().trim().min(1).max(5000);

const duracaoMinutosSchema = z.number().int().positive().max(1440);

const valorSchema = z
    .number()
    .finite()
    .min(0)
    .max(VALOR_MAXIMO)
    .refine(possuiNoMaximoDuasCasasDecimais);

const criarServicoSchema = z
    .object({
        nome: nomeSchema,
        descricao: descricaoSchema.optional(),
        duracao_minutos: duracaoMinutosSchema,
        valor: valorSchema.optional(),
    })
    .strict();

const atualizarServicoSchema = z
    .object({
        nome: nomeSchema.optional(),
        descricao: z.union([descricaoSchema, z.null()]).optional(),
        duracao_minutos: duracaoMinutosSchema.optional(),
        valor: z.union([valorSchema, z.null()]).optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const filtrosServicosSchema = z
    .object({
        ativo: z
            .enum(['true', 'false'])
            .transform((valor) => valor === 'true')
            .optional(),
    })
    .strict();

export type CriarServicoInput = z.infer<typeof criarServicoSchema>;

export type AtualizarServicoInput = z.infer<typeof atualizarServicoSchema>;

export type FiltrosServicosInput = z.infer<typeof filtrosServicosSchema>;

export function validarServicoId(valor: unknown) {
    const resultado = servicoIdSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Serviço inválido.', 400, 'SERVICO_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarCriacaoServico(valor: unknown): CriarServicoInput {
    const resultado = criarServicoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do serviço inválidos.', 400, 'DADOS_SERVICO_INVALIDOS');
    }

    return resultado.data;
}

export function validarAtualizacaoServico(valor: unknown): AtualizarServicoInput {
    const resultado = atualizarServicoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do serviço inválidos.', 400, 'DADOS_SERVICO_INVALIDOS');
    }

    return resultado.data;
}

export function validarFiltrosServicos(valor: unknown): FiltrosServicosInput {
    const resultado = filtrosServicosSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Filtros de serviços inválidos.', 400, 'FILTROS_SERVICOS_INVALIDOS');
    }

    return resultado.data;
}
