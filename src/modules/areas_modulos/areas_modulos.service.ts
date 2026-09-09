import { z } from 'zod';

import AppError from '../../shared/errors/AppError.js';

import areasModulosRepository from './areas_modulos.repository.js';

const uuidSchema = z.uuid();

class AreasModulosService {
    async listarHabilitadosPorArea(organizacaoId: string | undefined, areaNegocioId: unknown) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        const resultadoAreaId = uuidSchema.safeParse(areaNegocioId);

        if (!resultadoAreaId.success) {
            throw new AppError('Área de negócio inválida.', 400, 'AREA_NEGOCIO_INVALIDA');
        }

        const areaId = resultadoAreaId.data;

        const area = await areasModulosRepository.buscarAreaPorOrganizacao(organizacaoId, areaId);

        if (!area) {
            throw new AppError(
                'Área de negócio não encontrada.',
                404,
                'AREA_NEGOCIO_NAO_ENCONTRADA',
            );
        }

        return areasModulosRepository.listarHabilitadosPorArea(organizacaoId, areaId);
    }
}

export default new AreasModulosService();
