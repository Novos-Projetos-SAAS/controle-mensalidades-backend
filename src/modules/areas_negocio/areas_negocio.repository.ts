import connection from '../../database/connection.js';

class AreasNegocioRepository {
    async listarPorOrganizacao(organizacaoId: string) {
        return connection('areas_negocio')
            .where({
                organizacao_id: organizacaoId,
                ativo: true,
            })
            .whereNull('deletado_em')
            .orderBy('nome', 'asc')
            .select('*');
    }
}

export default new AreasNegocioRepository();
