import { z } from 'zod';
import AppError from '../../shared/errors/AppError.js';

const parametros = z.object({
    pagina: z.coerce.number<number>().int().min(1).max(100).default(1),
    limite: z.coerce.number<number>().int().min(1).max(50).default(20),
}).strict();

export function validarPaginacaoPacientesClinicos(valor: unknown) {
    const resultado = parametros.safeParse(valor);
    if (!resultado.success) {
        throw new AppError(
            'Paginação de pacientes inválida.',
            400,
            'PAGINACAO_PACIENTES_CLINICOS_INVALIDA',
        );
    }
    return resultado.data;
}
