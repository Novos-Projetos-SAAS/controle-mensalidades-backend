import connection from '../../database/connection.js';

class AcessoModulosRepository {
    async buscarModuloHabilitado(
        organizacaoId: string,
        areaNegocioId: string,
        codigoModulo: string,
    ) {
        return connection('modulos as m')
            .innerJoin('organizacoes_modulos as om', 'om.modulo_id', 'm.id')
            .innerJoin('areas_modulos as am', 'am.modulo_id', 'm.id')
            .innerJoin('areas_negocio as an', 'an.id', 'am.area_negocio_id')
            .select('m.id', 'm.codigo', 'm.nome')
            .where('m.codigo', codigoModulo)
            .andWhere('m.ativo', true)
            .whereNull('m.deletado_em')
            .andWhere('om.organizacao_id', organizacaoId)
            .andWhere('om.habilitado', true)
            .whereNull('om.deletado_em')
            .andWhere('an.id', areaNegocioId)
            .andWhere('an.organizacao_id', organizacaoId)
            .andWhere('an.ativo', true)
            .whereNull('an.deletado_em')
            .andWhere('am.habilitado', true)
            .whereNull('am.deletado_em')
            .first();
    }
}

export default new AcessoModulosRepository();
