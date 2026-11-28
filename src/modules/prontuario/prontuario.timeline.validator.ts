import { z } from 'zod';
import AppError from '../../shared/errors/AppError.js';

const uuid = z.uuid();

const parametros = z.object({
    pacienteId: uuid,
}).strict();

const query = z.object({
    limite: z.coerce.number<number>().int().min(1).max(100).default(50),
    deslocamento: z.coerce.number<number>().int().min(0).max(10000).default(0),
}).strict();

export function validarHistoricoPacienteId(valor: unknown): string {
    const r = parametros.safeParse({ pacienteId: valor });
    if (!r.success) {
        throw new AppError('Paciente inválido.', 400, 'PACIENTE_CLINICO_INVALIDO');
    }
    return r.data.pacienteId;
}

export function validarPaginacaoHistorico(valor: unknown): { limite: number; deslocamento: number } {
    const r = query.safeParse(valor);
    if (!r.success) {
        throw new AppError('Filtro de histórico inválido.', 400, 'FILTRO_HISTORICO_INVALIDO');
    }
    return r.data;
}

export function validarLimiteHistorico(valor: unknown): number {
    const r = query.safeParse(valor);
    if (!r.success) {
        throw new AppError('Filtro de histórico inválido.', 400, 'FILTRO_HISTORICO_INVALIDO');
    }
    return r.data.limite;
}
