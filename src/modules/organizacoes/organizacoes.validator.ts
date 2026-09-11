import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const textoNullableSchema = (tamanhoMaximo: number) =>
    z.union([z.string().trim().min(1).max(tamanhoMaximo), z.null()]).optional();

function fusoHorarioValido(valor: string) {
    try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: valor }).format();

        return true;
    } catch {
        return false;
    }
}

const atualizarOrganizacaoSchema = z
    .object({
        nome: z.string().trim().min(1).max(150).optional(),
        nome_fantasia: textoNullableSchema(150),
        razao_social: textoNullableSchema(150),
        cpf_cnpj: textoNullableSchema(20),
        email: z
            .preprocess(
                (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor),
                z.union([z.email().max(150), z.null()]),
            )
            .optional(),
        telefone: textoNullableSchema(20),
        fuso_horario: z.string().trim().min(1).max(50).refine(fusoHorarioValido).optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

export type AtualizarOrganizacaoInput = z.infer<typeof atualizarOrganizacaoSchema>;

export function validarAtualizacaoOrganizacao(valor: unknown): AtualizarOrganizacaoInput {
    const resultado = atualizarOrganizacaoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados da organização inválidos.', 400, 'DADOS_ORGANIZACAO_INVALIDOS');
    }

    return resultado.data;
}
