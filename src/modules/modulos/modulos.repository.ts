import connection from '../../database/connection.js';

class ModulosRepository {
    async listarHabilitadosPorOrganizacao(organizacaoId: string) {
        return connection('modulos as m')
            .innerJoin('organizacoes_modulos as om', 'om.modulo_id', 'm.id')
            .select('m.id', 'm.codigo', 'm.nome', 'm.descricao')
            .where('om.organizacao_id', organizacaoId)
            .andWhere('om.habilitado', true)
            .andWhere('m.ativo', true)
            .orderBy('m.nome', 'asc');
    }
}

export default new ModulosRepository();
