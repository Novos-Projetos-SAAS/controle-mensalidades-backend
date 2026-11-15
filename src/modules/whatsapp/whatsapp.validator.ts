import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const uuidSchema = z.string().uuid();

const configuracaoSchema = z
    .object({
        areaNegocioId: uuidSchema.nullable().optional(),
        whatsappBusinessAccountId: z.string().trim().min(1).max(100),
        phoneNumberId: z.string().trim().min(1).max(100),
        numeroExibido: z.string().trim().min(1).max(30),
        nomeNegocio: z.string().trim().min(1).max(150),
    })
    .strict();

const listagemSchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        status: z
            .enum([
                'PENDENTE',
                'PROCESSANDO',
                'ENVIADA',
                'ENTREGUE',
                'FALHOU',
                'CANCELADA',
                'RESULTADO_INCERTO',
            ])
            .optional(),
    })
    .strict();

const idSchema = z.string().uuid();

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string, code: string): T {
    const resultado = schema.safeParse(input);
    if (!resultado.success) throw new AppError(message, 400, code);
    return resultado.data;
}

export type ConfiguracaoWhatsappInput = z.infer<typeof configuracaoSchema>;
export type ListagemWhatsappInput = z.infer<typeof listagemSchema>;

export function validarConfiguracaoWhatsapp(input: unknown) {
    return parse(
        configuracaoSchema,
        input,
        'Dados de configuração do WhatsApp inválidos.',
        'CONFIGURACAO_WHATSAPP_INVALIDA',
    );
}

export function validarListagemWhatsapp(input: unknown) {
    return parse(
        listagemSchema,
        input,
        'Filtros de mensagens inválidos.',
        'FILTROS_WHATSAPP_INVALIDOS',
    );
}

export function validarIdWhatsapp(input: unknown, nome: string) {
    return parse(
        idSchema,
        input,
        `Identificador de ${nome} inválido.`,
        'IDENTIFICADOR_WHATSAPP_INVALIDO',
    );
}
