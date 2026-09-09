import AppError from '../../shared/errors/AppError.js';

import acessoModulosRepository from './acesso_modulos.repository.js';

class AcessoModulosService {
    async verificar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        codigoModulo: string,
    ) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        if (!areaNegocioId) {
            throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
        }

        const modulo = await acessoModulosRepository.buscarModuloHabilitado(
            organizacaoId,
            areaNegocioId,
            codigoModulo,
        );

        if (!modulo) {
            throw new AppError(
                'Módulo não habilitado para esta área.',
                403,
                'MODULO_NAO_HABILITADO',
            );
        }

        return modulo;
    }
}

export default new AcessoModulosService();
