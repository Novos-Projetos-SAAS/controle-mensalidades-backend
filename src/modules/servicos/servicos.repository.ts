import type { Knex } from 'knex';

import connection from '../../database/connection.js';

type ExecutorBanco = Knex | Knex.Transaction;

export type Servico = {
    id: string;
    nome: string;
    descricao: string | null;
    duracao_minutos: number;
    valor: string | null;
    ativo: boolean;
};

type FiltrosServicos = {
    ativo?: boolean;
};

type DadosNovoServico = {
    nome: string;
    descricao?: string;
    duracao_minutos: number;
    valor?: number;
};

export type DadosAtualizacaoServico = {
    nome?: string;
    descricao?: string | null;
    duracao_minutos?: number;
    valor?: number | null;
};

const camposPublicos = ['id', 'nome', 'descricao', 'duracao_minutos', 'valor', 'ativo'] as const;

class ServicosRepository {
    async executarEmTransacao<T>(operacao: (transaction: Knex.Transaction) => Promise<T>) {
        return connection.transaction(operacao);
    }

    async listar(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: FiltrosServicos,
    ): Promise<Servico[]> {
        const consulta = connection('servicos')
            .select(...camposPublicos)
            .where({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em');

        if (filtros.ativo !== undefined) {
            consulta.andWhere('ativo', filtros.ativo);
        }

        const servicos = await consulta.orderBy('nome', 'asc');

        return servicos as Servico[];
    }

    async buscarPorId(
        organizacaoId: string,
        areaNegocioId: string,
        servicoId: string,
        executor: ExecutorBanco = connection,
        bloquear = false,
    ): Promise<Servico | undefined> {
        const consulta = executor('servicos')
            .select(...camposPublicos)
            .where({
                id: servicoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em');

        if (bloquear) {
            consulta.forUpdate();
        }

        const servico = await consulta.first();

        return servico as Servico | undefined;
    }

    async criar(
        organizacaoId: string,
        areaNegocioId: string,
        dados: DadosNovoServico,
    ): Promise<Servico> {
        const [servico] = await connection('servicos')
            .insert({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                nome: dados.nome,
                descricao: dados.descricao ?? null,
                duracao_minutos: dados.duracao_minutos,
                valor: dados.valor ?? null,
            })
            .returning(camposPublicos);

        return servico as Servico;
    }

    async atualizar(
        organizacaoId: string,
        areaNegocioId: string,
        servicoId: string,
        dados: DadosAtualizacaoServico,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('servicos')
            .where({
                id: servicoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .update(dados);
    }

    async alterarAtivo(
        organizacaoId: string,
        areaNegocioId: string,
        servicoId: string,
        ativo: boolean,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('servicos')
            .where({
                id: servicoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .update({ ativo });
    }
}

export default new ServicosRepository();
