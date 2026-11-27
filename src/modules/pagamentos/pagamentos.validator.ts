import { z } from 'zod';
import AppError from '../../shared/errors/AppError.js';

const identifier = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_.:-]+$/);
const configSchema = z
    .object({
        ativo: z.boolean().optional(),
        geracao_automatica: z.boolean().optional(),
        dias_antecedencia: z.union([z.literal(1), z.literal(2)]).optional(),
        handle: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_.-]{1,100}$/)
            .nullable()
            .optional(),
        api_key: z
            .string()
            .min(7)
            .max(512)
            .regex(/^inchk_[A-Za-z0-9_-]+$/)
            .optional(),
    })
    .strict();
const signalSchema = z
    .object({
        order_nsu: identifier.max(100),
        transaction_nsu: identifier.optional(),
        slug: identifier.optional(),
        invoice_slug: identifier.optional(),
        event_type: z
            .enum(['created', 'paid', 'settled', 'canceled', 'refunded', 'payment_failed'])
            .default('paid'),
    })
    .refine((v) => !(v.slug && v.invoice_slug && v.slug !== v.invoice_slug))
    .refine(
        (v) => v.event_type !== 'paid' || Boolean(v.transaction_nsu && (v.slug || v.invoice_slug)),
    )
    .transform((v) => ({
        order_nsu: v.order_nsu,
        transaction_nsu: v.transaction_nsu ?? '',
        slug: v.slug ?? v.invoice_slug ?? '',
        event_type: v.event_type,
    }));

function validar<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
        throw new AppError('Dados do pagamento inválidos.', 400, 'PAGAMENTO_DADOS_INVALIDOS');
    return result.data;
}
export const validarConfiguracaoPagamento = (v: unknown) => validar(configSchema, v);
export const validarSinalPagamento = (v: unknown) => validar(signalSchema, v);
export const validarTokenPagamento = (v: unknown) =>
    validar(z.string().regex(/^[A-Za-z0-9_-]{43}$/), v);
export type ConfiguracaoInput = z.infer<typeof configSchema>;
