import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const MAXIMO_JANELA_MS = 31 * 24 * 60 * 60 * 1000;

const uuidSchema = z.uuid();
const statusSchema = z.enum(['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO']);
const dataHoraComFusoSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
    .refine((valor) => Number.isFinite(Date.parse(valor)));
const observacaoSchema = z.string().trim().max(5000);
const motivoCancelamentoSchema = z.string().trim().max(1000);

const criarAgendamentoSchema = z
    .object({
        cliente_id: uuidSchema,
        profissional_id: uuidSchema,
        servico_id: uuidSchema,
        inicio_em: dataHoraComFusoSchema,
        observacao: observacaoSchema.optional(),
    })
    .strict();

const atualizarAgendamentoSchema = z
    .object({
        inicio_em: dataHoraComFusoSchema.optional(),
        profissional_id: uuidSchema.optional(),
        servico_id: uuidSchema.optional(),
        observacao: z.union([observacaoSchema, z.null()]).optional(),
    })
    .strict()
    .refine((dados) => Object.values(dados).some((valor) => valor !== undefined));

const filtrosAgendamentosSchema = z
    .object({
        inicio: dataHoraComFusoSchema,
        fim: dataHoraComFusoSchema,
        profissionalId: uuidSchema.optional(),
        clienteId: uuidSchema.optional(),
        status: statusSchema.optional(),
    })
    .strict()
    .superRefine((dados, contexto) => {
        const inicio = Date.parse(dados.inicio);
        const fim = Date.parse(dados.fim);

        if (inicio >= fim || fim - inicio > MAXIMO_JANELA_MS) {
            contexto.addIssue({ code: 'custom', message: 'Janela de datas inválida.' });
        }
    });

const cancelarAgendamentoSchema = z
    .object({
        motivo_cancelamento: motivoCancelamentoSchema.optional(),
    })
    .strict();

export type StatusAgendamento = z.infer<typeof statusSchema>;
export type CriarAgendamentoInput = z.infer<typeof criarAgendamentoSchema>;
export type AtualizarAgendamentoInput = z.infer<typeof atualizarAgendamentoSchema>;
export type FiltrosAgendamentosInput = z.infer<typeof filtrosAgendamentosSchema>;
export type CancelarAgendamentoInput = z.infer<typeof cancelarAgendamentoSchema>;

export function validarAgendamentoId(valor: unknown) {
    const resultado = uuidSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Agendamento inválido.', 400, 'AGENDAMENTO_ID_INVALIDO');
    }

    return resultado.data;
}

export function validarCriacaoAgendamento(valor: unknown): CriarAgendamentoInput {
    const resultado = criarAgendamentoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do agendamento inválidos.', 400, 'DADOS_AGENDAMENTO_INVALIDOS');
    }

    return resultado.data;
}

export function validarAtualizacaoAgendamento(valor: unknown): AtualizarAgendamentoInput {
    const resultado = atualizarAgendamentoSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Dados do agendamento inválidos.', 400, 'DADOS_AGENDAMENTO_INVALIDOS');
    }

    return resultado.data;
}

export function validarFiltrosAgendamentos(valor: unknown): FiltrosAgendamentosInput {
    const resultado = filtrosAgendamentosSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError(
            'Filtros de agendamentos inválidos.',
            400,
            'FILTROS_AGENDAMENTOS_INVALIDOS',
        );
    }

    return resultado.data;
}

export function validarCancelamentoAgendamento(valor: unknown): CancelarAgendamentoInput {
    const resultado = cancelarAgendamentoSchema.safeParse(valor ?? {});

    if (!resultado.success) {
        throw new AppError('Dados do cancelamento inválidos.', 400, 'DADOS_CANCELAMENTO_INVALIDOS');
    }

    return resultado.data;
}
