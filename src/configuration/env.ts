import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().positive().max(65535).default(3333),
});

export function validarEnv(variaveis: NodeJS.ProcessEnv) {
    return envSchema.parse(variaveis);
}

export const env = validarEnv(process.env);
