import AppError from '../../shared/errors/AppError.js';

import contextoRepository from './contexto.repository.js';
import { validarAreaNegocioId } from './contexto.validator.js';

class ContextoService {
    async resolverArea(organizacaoId: string | undefined, areaNegocioId: unknown) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        const areaId = validarAreaNegocioId(areaNegocioId);

        const area = await contextoRepository.buscarAreaPorOrganizacao(organizacaoId, areaId);

        if (!area) {
            throw new AppError(
                'Área de negócio não encontrada.',
                404,
                'AREA_NEGOCIO_NAO_ENCONTRADA',
            );
        }

        return area;
    }
}

export default new ContextoService();
