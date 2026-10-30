import type { Knex } from 'knex';

import connection from '../../database/connection.js';
import type { StatusAgendamento } from './agendamentos.validator.js';

type ExecutorBanco = Knex | Knex.Transaction;

export type Agendamento = {
    id: string;
    cliente_id: string;
    profissional_id: string;
    servico_id: string;
    inicio_em: Date;
    fim_em: Date;
    status: StatusAgendamento;
    observacao: string | null;
    cancelado_em: Date | null;
    cancelado_por_usuario_id: string | null;
    motivo_cancelamento: string | null;
    cliente_nome: string;
    profissional_nome: string;
    servico_nome: string;
};

export type AgendamentoPersistido = Agendamento & {
    organizacao_id: string;
    area_negocio_id: string;
};

export type DadosNovoAgendamento = {
    cliente_id: string;
    profissional_id: string;
    servico_id: string;
    inicio_em: Date;
    fim_em: Date;
    observacao?: string;
};

export type DadosAtualizacaoAgendamento = {
    inicio_em?: Date;
    fim_em?: Date;
    profissional_id?: string;
    servico_id?: string;
    observacao?: string | null;
};

type FiltrosListagem = {
    inicio: Date;
    fim: Date;
    profissionalId?: string;
    clienteId?: string;
    status?: StatusAgendamento;
};

export type ClienteAgendavel = { id: string; nome: string };
export type ProfissionalAgendavel = { id: string; nome: string };
export type ServicoAgendavel = { id: string; nome: string; duracao_minutos: number };
export type ConflitoAgendamento = { id: string; profissional_id: string; cliente_id: string };

const camposDetalhe = [
    'ag.id',
    'ag.organizacao_id',
    'ag.area_negocio_id',
    'ag.cliente_id',
    'ag.profissional_id',
    'ag.servico_id',
    'ag.inicio_em',
    'ag.fim_em',
    'ag.status',
    'ag.observacao',
    'ag.cancelado_em',
    'ag.cancelado_por_usuario_id',
    'ag.motivo_cancelamento',
    'c.nome as cliente_nome',
    'p.nome as profissional_nome',
    's.nome as servico_nome',
] as const;

function consultaDetalhe(executor: ExecutorBanco) {
    return executor('agendamentos as ag')
        .innerJoin('clientes as c', 'c.id', 'ag.cliente_id')
        .innerJoin('profissionais as p', 'p.id', 'ag.profissional_id')
        .innerJoin('servicos as s', 's.id', 'ag.servico_id')
        .select(...camposDetalhe);
}

class AgendamentosRepository {
    async executarEmTransacao<T>(operacao: (transaction: Knex.Transaction) => Promise<T>) {
        return connection.transaction(operacao);
    }

    async buscarClienteAgendavel(
        organizacaoId: string,
        areaNegocioId: string,
        clienteId: string,
        transaction: Knex.Transaction,
    ): Promise<ClienteAgendavel | undefined> {
        const cliente = await transaction('clientes as c')
            .innerJoin('clientes_areas as ca', function () {
                this.on('ca.cliente_id', 'c.id').andOnVal('ca.area_negocio_id', areaNegocioId);
            })
            .select('c.id', 'c.nome')
            .where({
                'c.id': clienteId,
                'c.organizacao_id': organizacaoId,
                'c.ativo': true,
                'ca.ativo': true,
            })
            .whereNull('c.deletado_em')
            .whereNull('ca.deletado_em')
            .first();

        return cliente as ClienteAgendavel | undefined;
    }

    async buscarProfissionalAgendavel(
        organizacaoId: string,
        areaNegocioId: string,
        profissionalId: string,
        transaction: Knex.Transaction,
    ): Promise<ProfissionalAgendavel | undefined> {
        const profissional = await transaction('profissionais as p')
            .innerJoin('profissionais_areas as pa', function () {
                this.on('pa.profissional_id', 'p.id').andOnVal('pa.area_negocio_id', areaNegocioId);
            })
            .select('p.id', 'p.nome')
            .where({
                'p.id': profissionalId,
                'p.organizacao_id': organizacaoId,
                'p.ativo': true,
                'pa.ativo': true,
            })
            .whereNull('p.deletado_em')
            .whereNull('pa.deletado_em')
            .first();

        return profissional as ProfissionalAgendavel | undefined;
    }

    async buscarServicoAgendavel(
        organizacaoId: string,
        areaNegocioId: string,
        servicoId: string,
        transaction: Knex.Transaction,
    ): Promise<ServicoAgendavel | undefined> {
        const servico = await transaction('servicos')
            .select('id', 'nome', 'duracao_minutos')
            .where({
                id: servicoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                ativo: true,
            })
            .whereNull('deletado_em')
            .andWhere('duracao_minutos', '>', 0)
            .first();

        return servico as ServicoAgendavel | undefined;
    }

    async buscarConflito(
        organizacaoId: string,
        profissionalId: string,
        clienteId: string,
        inicioEm: Date,
        fimEm: Date,
        transaction: Knex.Transaction,
        agendamentoIdIgnorar?: string,
    ): Promise<ConflitoAgendamento | undefined> {
        const consulta = transaction('agendamentos')
            .select('id', 'profissional_id', 'cliente_id')
            .where('organizacao_id', organizacaoId)
            .whereNull('deletado_em')
            .whereNot('status', 'CANCELADO')
            .andWhere('inicio_em', '<', fimEm)
            .andWhere('fim_em', '>', inicioEm)
            .andWhere(function () {
                this.where('profissional_id', profissionalId).orWhere('cliente_id', clienteId);
            });

        if (agendamentoIdIgnorar) {
            consulta.whereNot('id', agendamentoIdIgnorar);
        }

        const conflito = await consulta.first();

        return conflito as ConflitoAgendamento | undefined;
    }

    async criar(
        organizacaoId: string,
        areaNegocioId: string,
        dados: DadosNovoAgendamento,
        transaction: Knex.Transaction,
    ): Promise<string> {
        const [agendamento] = await transaction('agendamentos')
            .insert({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                ...dados,
                observacao: dados.observacao ?? null,
                status: 'AGENDADO',
            })
            .returning('id');

        return agendamento.id as string;
    }

    async listar(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: FiltrosListagem,
    ): Promise<AgendamentoPersistido[]> {
        const consulta = consultaDetalhe(connection)
            .where({
                'ag.organizacao_id': organizacaoId,
                'ag.area_negocio_id': areaNegocioId,
            })
            .whereNull('ag.deletado_em')
            .andWhere('ag.inicio_em', '<', filtros.fim)
            .andWhere('ag.fim_em', '>', filtros.inicio);

        if (filtros.profissionalId) {
            consulta.andWhere('ag.profissional_id', filtros.profissionalId);
        }
        if (filtros.clienteId) {
            consulta.andWhere('ag.cliente_id', filtros.clienteId);
        }
        if (filtros.status) {
            consulta.andWhere('ag.status', filtros.status);
        }

        const agendamentos = await consulta.orderBy([
            { column: 'ag.inicio_em', order: 'asc' },
            { column: 'ag.id', order: 'asc' },
        ]);

        return agendamentos as AgendamentoPersistido[];
    }

    async buscarPorId(
        organizacaoId: string,
        areaNegocioId: string,
        agendamentoId: string,
        executor: ExecutorBanco = connection,
        bloquear = false,
    ): Promise<AgendamentoPersistido | undefined> {
        const consulta = consultaDetalhe(executor)
            .where({
                'ag.id': agendamentoId,
                'ag.organizacao_id': organizacaoId,
                'ag.area_negocio_id': areaNegocioId,
            })
            .whereNull('ag.deletado_em');

        if (bloquear) {
            consulta.forUpdate('ag');
        }

        const agendamento = await consulta.first();

        return agendamento as AgendamentoPersistido | undefined;
    }

    async atualizar(
        organizacaoId: string,
        areaNegocioId: string,
        agendamentoId: string,
        dados: DadosAtualizacaoAgendamento,
        transaction: Knex.Transaction,
    ) {
        await transaction('agendamentos')
            .where({
                id: agendamentoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .update(dados);
    }

    async alterarStatus(
        organizacaoId: string,
        areaNegocioId: string,
        agendamentoId: string,
        status: StatusAgendamento,
        transaction: Knex.Transaction,
        cancelamento?: {
            cancelado_em: Date;
            cancelado_por_usuario_id: string;
            motivo_cancelamento?: string;
        },
    ) {
        await transaction('agendamentos')
            .where({
                id: agendamentoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .update({
                status,
                ...(cancelamento && {
                    cancelado_em: cancelamento.cancelado_em,
                    cancelado_por_usuario_id: cancelamento.cancelado_por_usuario_id,
                    motivo_cancelamento: cancelamento.motivo_cancelamento ?? null,
                }),
            });
    }
}

export default new AgendamentosRepository();
