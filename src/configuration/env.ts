import dotenv from 'dotenv';
import { z } from 'zod';

const environment = process.env.NODE_ENV || 'development';

dotenv.config({
    path: environment === 'test' ? '.env.test' : '.env',
});

if (environment === 'test' && process.env.JWT_SECRET_TEST) {
    process.env.JWT_SECRET = process.env.JWT_SECRET_TEST;
}

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().positive().max(65535).default(3333),

    DATABASE_URL: z.string().min(1).optional(),

    DATABASE_URL_TEST: z.string().min(1).optional(),

    JWT_SECRET: z.string().min(1).optional(),

    JWT_SECRET_TEST: z.string().min(1).optional(),

    JWT_EXPIRES_IN: z.enum(['1h', '8h', '12h', '1d', '7d', '30d']).default('8h'),
});

export function validarEnv(variaveis: NodeJS.ProcessEnv) {
    const variaveisNormalizadas = { ...variaveis };

    if (variaveisNormalizadas.NODE_ENV === 'test' && variaveisNormalizadas.JWT_SECRET_TEST) {
        variaveisNormalizadas.JWT_SECRET = variaveisNormalizadas.JWT_SECRET_TEST;
    }

    return envSchema.parse(variaveisNormalizadas);
}

export const env = validarEnv(process.env);
