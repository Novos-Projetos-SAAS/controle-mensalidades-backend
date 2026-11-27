import dotenv from 'dotenv';
import { z } from 'zod';

const environment = process.env.NODE_ENV || 'development';

dotenv.config({
    path: environment === 'test' ? '.env.test' : '.env',
});

if (environment === 'test' && process.env.JWT_SECRET_TEST) {
    process.env.JWT_SECRET = process.env.JWT_SECRET_TEST;
}

const envSchema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

        PORT: z.coerce.number().int().positive().max(65535).default(3333),

        DATABASE_URL: z.string().min(1).optional(),

        DATABASE_URL_TEST: z.string().min(1).optional(),

        DATABASE_URL_MIGRATIONS: z.string().min(1).optional(),

        DB_SSL: z.enum(['true', 'false']).optional(),

        CORS_ALLOWED_ORIGINS: z.string().optional(),

        INFINITEPAY_ENCRYPTION_KEY: z.string().optional(),

        CLINICAL_DB_STATEMENT_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .min(1000)
            .max(120000)
            .default(15000),

        CLINICAL_DB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(3000),

        CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce
            .number()
            .int()
            .min(1000)
            .max(300000)
            .default(30000),

        DATABASE_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(5000),

        DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(8000),

        JWT_SECRET: z.string().min(1).optional(),

        JWT_SECRET_TEST: z.string().min(1).optional(),

        JWT_EXPIRES_IN: z.enum(['1h', '8h', '12h', '1d', '7d', '30d']).default('8h'),

        CPF_CRYPTO_MODE: z.enum(['legacy', 'transition', 'strict']).default('legacy'),
        CPF_ENCRYPTION_KEY: z.string().optional(),
        CPF_LOOKUP_KEY: z.string().optional(),
        WHATSAPP_META_REAL_SEND_ENABLED: z.enum(['true', 'false']).default('false'),

        WHATSAPP_META_COEXISTENCE_ENABLED: z.enum(['true', 'false']).default('false'),

        WHATSAPP_META_APP_ID: z.preprocess(
            (valor) => (valor === '' ? undefined : valor),
            z.string().min(1).optional(),
        ),

        WHATSAPP_META_CONFIGURATION_ID: z.preprocess(
            (valor) => (valor === '' ? undefined : valor),
            z.string().min(1).optional(),
        ),

        WHATSAPP_META_GRAPH_API_VERSION: z
            .string()
            .regex(/^v\d+\.\d+$/)
            .default('v27.0'),

        WHATSAPP_META_WEBHOOK_VERIFY_TOKEN: z.preprocess(
            (valor) => (valor === '' ? undefined : valor),
            z.string().min(1).optional(),
        ),

        WHATSAPP_META_APP_SECRET: z.preprocess(
            (valor) => (valor === '' ? undefined : valor),
            z.string().min(1).optional(),
        ),

        WHATSAPP_CREDENTIALS_ENCRYPTION_KEY: z.preprocess(
            (valor) => (valor === '' ? undefined : valor),
            z.string().optional(),
        ),
    })
    .superRefine((valores, contexto) => {
        if (valores.CPF_CRYPTO_MODE !== 'legacy') {
            for (const chave of ['CPF_ENCRYPTION_KEY', 'CPF_LOOKUP_KEY'] as const) {
                if (!/^[a-f\d]{64}$/i.test(valores[chave] ?? '')) {
                    contexto.addIssue({
                        code: 'custom',
                        path: [chave],
                        message: 'Informe uma chave de 32 bytes em hexadecimal (64 caracteres).',
                    });
                }
            }
            if (
                valores.CPF_ENCRYPTION_KEY &&
                valores.CPF_LOOKUP_KEY &&
                valores.CPF_ENCRYPTION_KEY.toLowerCase() ===
                    valores.CPF_LOOKUP_KEY.toLowerCase()
            ) {
                contexto.addIssue({
                    code: 'custom',
                    path: ['CPF_LOOKUP_KEY'],
                    message: 'A chave HMAC deve ser diferente da chave de criptografia.',
                });
            }
        }

        if (valores.CLINICAL_DB_LOCK_TIMEOUT_MS >= valores.CLINICAL_DB_STATEMENT_TIMEOUT_MS) {
            contexto.addIssue({
                code: 'custom',
                path: ['CLINICAL_DB_LOCK_TIMEOUT_MS'],
                message: 'O lock timeout deve ser menor que o statement timeout.',
            });
        }

        if (
            valores.CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS <=
            valores.CLINICAL_DB_STATEMENT_TIMEOUT_MS
        ) {
            contexto.addIssue({
                code: 'custom',
                path: ['CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS'],
                message: 'O idle transaction timeout deve exceder o statement timeout.',
            });
        }
    });

export function validarEnv(variaveis: NodeJS.ProcessEnv) {
    const variaveisNormalizadas = { ...variaveis };

    if (variaveisNormalizadas.NODE_ENV === 'test' && variaveisNormalizadas.JWT_SECRET_TEST) {
        variaveisNormalizadas.JWT_SECRET = variaveisNormalizadas.JWT_SECRET_TEST;
    }

    return envSchema.parse(variaveisNormalizadas);
}

export const env = validarEnv(process.env);
