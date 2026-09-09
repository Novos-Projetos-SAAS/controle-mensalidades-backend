import connection from '../../database/connection.js';

class ContextoRepository {
    async buscarAreaPorOrganizacao(organizacaoId: string, areaNegocioId: string) {
        return connection('areas_negocio')
            .select('id', 'nome', 'codigo')
            .where({
                id: areaNegocioId,
                organizacao_id: organizacaoId,
                ativo: true,
            })
            .first();
    }
}

export default new ContextoRepository();
