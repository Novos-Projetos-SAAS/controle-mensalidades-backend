import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';
import { senhaForteSchema } from '../../validators/senha.validator.js';

const usuarioIdSchema = z.uuid();

const atualizarVinculoSchema = z
    .object({
        perfil: z.enum(['ADMINISTRADOR', 'OPERADOR']).optional(),
        ativo: z.boolean().optional(),
    })
    .strict()
    .refine((dados) => dados.perfil !== undefined || dados.ativo !== undefined);

const criarUsuarioSchema = z
    .object({
        nome: z.string().trim().min(1).max(150),
        email: z.preprocess(
            (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor),
            z.email().max(150),
        ),
        senha: senhaForteSchema,
        perfil: z.enum(['ADMINISTRADOR', 'OPERADOR']),
    })
    .strict();

export type AtualizarVinculoInput = z.infer<typeof atualizarVinculoSchema>;
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

export function validarUsuarioId(valor: unknown) {
    const resultado = usuarioIdSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Usuário inválido.', 400, 'USUARIO_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarAtualizacaoVinculo(valor: unknown): AtualizarVinculoInput {
    const resultado = atualizarVinculoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do usuário inválidos.', 400, 'DADOS_USUARIO_INVALIDOS');
    }

    return resultado.data;
}

export function validarCriacaoUsuario(valor: unknown): CriarUsuarioInput {
    const resultado = criarUsuarioSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do usuário inválidos.', 400, 'DADOS_USUARIO_INVALIDOS');
    }

    return resultado.data;
}
