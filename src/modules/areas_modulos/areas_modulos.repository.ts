import connection from '../../database/connection.js';

class AreasModulosRepository {
    async buscarAreaPorOrganizacao(organizacaoId: string, areaNegocioId: string) {
        return connection('areas_negocio')
            .where({
                id: areaNegocioId,
                organizacao_id: organizacaoId,
                ativo: true,
            })
            .whereNull('deletado_em')
            .first();
    }

    async listarHabilitadosPorArea(organizacaoId: string, areaNegocioId: string) {
        return connection('areas_modulos as am')
            .innerJoin('areas_negocio as an', 'an.id', 'am.area_negocio_id')
            .innerJoin('modulos as m', 'm.id', 'am.modulo_id')
            .innerJoin('organizacoes_modulos as om', function () {
                this.on('om.modulo_id', '=', 'm.id').andOn(
                    'om.organizacao_id',
                    '=',
                    'an.organizacao_id',
                );
            })
            .select('m.id', 'm.codigo', 'm.nome', 'm.descricao')
            .where('an.organizacao_id', organizacaoId)
            .andWhere('an.id', areaNegocioId)
            .andWhere('an.ativo', true)
            .whereNull('an.deletado_em')
            .andWhere('m.ativo', true)
            .whereNull('m.deletado_em')
            .andWhere('om.habilitado', true)
            .whereNull('om.deletado_em')
            .andWhere('am.habilitado', true)
            .whereNull('am.deletado_em')
            .orderBy('m.nome', 'asc');
    }
}

export default new AreasModulosRepository();
