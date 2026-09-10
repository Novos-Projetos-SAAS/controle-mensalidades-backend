import connection from '../../database/connection.js';

class AuthRepository {
    async buscarUsuarioAtivoPorEmail(email: string) {
        return connection('usuarios as u')
            .select('u.id', 'u.nome', 'u.email', 'u.senha_hash')
            .whereRaw('LOWER(u.email) = ?', [email])
            .andWhere('u.ativo', true)
            .whereNull('u.deletado_em')
            .first();
    }

    async listarOrganizacoesAtivasDoUsuario(usuarioId: string) {
        return connection('usuarios_organizacoes as uo')
            .innerJoin('organizacoes as o', 'o.id', 'uo.organizacao_id')
            .select('o.id', 'o.nome', 'uo.perfil')
            .where('uo.usuario_id', usuarioId)
            .andWhere('uo.ativo', true)
            .whereNull('uo.deletado_em')
            .andWhere('o.ativo', true)
            .whereNull('o.deletado_em')
            .orderBy('o.nome', 'asc');
    }

    async atualizarUltimoLogin(usuarioId: string) {
        await connection('usuarios').where('id', usuarioId).whereNull('deletado_em').update({
            ultimo_login_em: connection.fn.now(),
        });
    }
}

export default new AuthRepository();
