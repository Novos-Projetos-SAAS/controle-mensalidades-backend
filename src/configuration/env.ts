import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().positive().max(65535).default(3333),

    DATABASE_URL: z.string().min(1).optional(),

    DATABASE_URL_TEST: z.string().min(1).optional(),
});

export function validarEnv(variaveis: NodeJS.ProcessEnv) {
    return envSchema.parse(variaveis);
}

export const env = validarEnv(process.env);
