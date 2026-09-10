import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const loginSchema = z.object({
    email: z.preprocess(
        (valor) => (typeof valor === 'string' ? valor.trim().toLowerCase() : valor),
        z.email('Email inválido.'),
    ),
    senha: z.string().min(1, 'Senha é obrigatória.').max(128, 'Senha inválida.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export function validarLogin(valor: unknown): LoginInput {
    const resultado = loginSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            resultado.error.issues[0]?.message ?? 'Dados de login inválidos.',
            400,
            'DADOS_LOGIN_INVALIDOS',
        );
    }

    return resultado.data;
}
