import AppError from "../../shared/errors/AppError.js";

import modulosRepository from "./modulos.repository.js";

class ModulosService {

    async listarHabilitadosPorOrganizacao(organizacaoId: string | undefined) {

        if (!organizacaoId) {
            throw new AppError(
                'Organização não informada.',
                400,
                'ORGANIZACAO_NAO_INFORMADA',
            );
        }

        return modulosRepository.listarHabilitadosPorOrganizacao(organizacaoId);
    }

}

export default new ModulosService();