import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const uuid = z.string().uuid();
const state = z.string().min(32).max(256);

const callbackSchema = z.discriminatedUnion('resultado', [
    z
        .object({
            resultado: z.literal('CANCELADO'),
            correlacaoId: uuid,
            state,
        })
        .strict(),
    z
        .object({
            resultado: z.literal('AUTORIZADO'),
            correlacaoId: uuid,
            state,
            codigo: z.string().trim().min(16).max(4096),
            wabaId: z.string().trim().min(1).max(100),
            phoneNumberId: z.string().trim().min(1).max(100),
            businessId: z.string().trim().min(1).max(100).optional(),
            modoOnboarding: z.enum(['CLOUD_API', 'COEXISTENCIA']),
            registrationPin: z
                .string()
                .regex(/^\d{6}$/)
                .optional(),
        })
        .strict(),
]);

const continuarSchema = z
    .object({
        registrationPin: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
    })
    .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown, code: string): T {
    const resultado = schema.safeParse(input);
    if (!resultado.success) throw new AppError('Dados do onboarding Meta inválidos.', 400, code);
    return resultado.data;
}

export function validarCallbackOnboardingWhatsapp(input: unknown) {
    return parse(callbackSchema, input, 'CALLBACK_ONBOARDING_INVALIDO');
}

export function validarContinuarOnboardingWhatsapp(input: unknown) {
    return parse(continuarSchema, input, 'DADOS_CONTINUACAO_ONBOARDING_INVALIDOS');
}

export function validarCorrelacaoOnboardingWhatsapp(input: unknown) {
    const resultado = uuid.safeParse(input);
    if (!resultado.success) {
        throw new AppError('Identificador de onboarding inválido.', 400, 'ONBOARDING_ID_INVALIDO');
    }
    return resultado.data;
}
