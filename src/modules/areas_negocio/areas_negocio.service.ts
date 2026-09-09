import AppError from '../../shared/errors/AppError.js';

import areasNegocioRepository from './areas_negocio.repository.js';

class AreasNegocioService {
    async listarPorOrganizacao(organizacaoId: string) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400);
        }

        return areasNegocioRepository.listarPorOrganizacao(organizacaoId);
    }
}

export default new AreasNegocioService();
