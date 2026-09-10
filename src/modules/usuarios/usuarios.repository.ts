import type { Knex } from 'knex';

import connection from '../../database/connection.js';

type ExecutorBanco = Knex | Knex.Transaction;

type DadosAtualizacaoVinculo = {
    perfil?: 'ADMINISTRADOR' | 'OPERADOR';
    ativo?: boolean;
};

type DadosNovoUsuario = {
    nome: string;
    email: string;
    senhaHash: string;
};

class UsuariosRepository {
    async listarPorOrganizacao(organizacaoId: string) {
        return connection('usuarios_organizacoes as uo')
            .innerJoin('usuarios as u', 'u.id', 'uo.usuario_id')
            .select('u.id', 'u.nome', 'u.email', 'uo.perfil', 'uo.ativo')
            .where('uo.organizacao_id', organizacaoId)
            .whereNull('uo.deletado_em')
            .whereNull('u.deletado_em')
            .orderBy('u.nome', 'asc');
    }

    async executarEmTransacao<T>(operacao: (transaction: Knex.Transaction) => Promise<T>) {
        return connection.transaction(operacao);
    }

    async buscarUsuarioPorEmail(email: string, transaction: Knex.Transaction) {
        return transaction('usuarios as u')
            .select('u.id')
            .whereRaw('LOWER(u.email) = ?', [email])
            .whereNull('u.deletado_em')
            .first();
    }

    async criarUsuario(dados: DadosNovoUsuario, transaction: Knex.Transaction) {
        const [usuario] = await transaction('usuarios')
            .insert({
                nome: dados.nome,
                email: dados.email,
                senha_hash: dados.senhaHash,
                ativo: true,
            })
            .returning(['id', 'nome', 'email']);

        return usuario;
    }

    async criarVinculoOrganizacao(
        usuarioId: string,
        organizacaoId: string,
        perfil: 'ADMINISTRADOR' | 'OPERADOR',
        transaction: Knex.Transaction,
    ) {
        await transaction('usuarios_organizacoes').insert({
            usuario_id: usuarioId,
            organizacao_id: organizacaoId,
            perfil,
            ativo: true,
        });
    }

    async bloquearOrganizacao(organizacaoId: string, transaction: Knex.Transaction) {
        return transaction('organizacoes')
            .select('id')
            .where('id', organizacaoId)
            .whereNull('deletado_em')
            .forUpdate()
            .first();
    }

    async buscarVinculo(
        organizacaoId: string,
        usuarioId: string,
        executor: ExecutorBanco,
        bloquear = false,
    ) {
        const consulta = executor('usuarios_organizacoes as uo')
            .innerJoin('usuarios as u', 'u.id', 'uo.usuario_id')
            .select('u.id', 'u.nome', 'u.email', 'uo.perfil', 'uo.ativo')
            .where('uo.organizacao_id', organizacaoId)
            .andWhere('uo.usuario_id', usuarioId)
            .whereNull('uo.deletado_em')
            .whereNull('u.deletado_em');

        if (bloquear) {
            consulta.forUpdate('uo');
        }

        return consulta.first();
    }

    async bloquearAdministradoresAtivos(organizacaoId: string, transaction: Knex.Transaction) {
        return transaction('usuarios_organizacoes as uo')
            .innerJoin('usuarios as u', 'u.id', 'uo.usuario_id')
            .select('uo.usuario_id')
            .where('uo.organizacao_id', organizacaoId)
            .andWhere('uo.perfil', 'ADMINISTRADOR')
            .andWhere('uo.ativo', true)
            .andWhere('u.ativo', true)
            .whereNull('uo.deletado_em')
            .whereNull('u.deletado_em')
            .forUpdate('uo');
    }

    async atualizarVinculo(
        organizacaoId: string,
        usuarioId: string,
        dados: DadosAtualizacaoVinculo,
        transaction: Knex.Transaction,
    ) {
        await transaction('usuarios_organizacoes')
            .where({
                organizacao_id: organizacaoId,
                usuario_id: usuarioId,
            })
            .whereNull('deletado_em')
            .update(dados);
    }
}

export default new UsuariosRepository();
