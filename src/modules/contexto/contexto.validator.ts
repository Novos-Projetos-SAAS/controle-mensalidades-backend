import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

const areaNegocioIdSchema = z.uuid();

export function validarAreaNegocioId(valor: unknown) {
    const resultado = areaNegocioIdSchema.safeParse(valor);

    if (!resultado.success) {
        throw new AppError('Área de negócio inválida.', 400, 'AREA_NEGOCIO_INVALIDA');
    }

    return resultado.data;
}
