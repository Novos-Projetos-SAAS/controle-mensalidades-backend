import { z } from 'zod';

import AppError from '../shared/errors/AppError.js';

export const senhaForteSchema = z
    .string()
    .min(8, 'A senha deve possuir pelo menos 8 caracteres.')
    .max(128, 'A senha deve possuir no máximo 128 caracteres.')
    .regex(/[a-z]/, 'A senha deve possuir uma letra minúscula.')
    .regex(/[A-Z]/, 'A senha deve possuir uma letra maiúscula.')
    .regex(/\d/, 'A senha deve possuir um número.')
    .regex(/[^A-Za-z0-9]/, 'A senha deve possuir um caractere especial.');

export function validarSenhaForte(valor: unknown) {
    const resultado = senhaForteSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            resultado.error.issues[0]?.message ?? 'Senha inválida.',
            400,
            'SENHA_FRACA',
        );
    }

    return resultado.data;
}
