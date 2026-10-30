import type { Knex } from 'knex';
import connection from '../../database/connection.js';

type ExecutorBanco = Knex | Knex.Transaction;

export type SessaoClinicaResumo = {
    id: string;
    cliente_id: string;
    profissional_id: string;
    agendamento_id: string | null;
    data_sessao: Date;
    corrigido_em: Date | null;
    cliente_nome: string;
    profissional_nome: string;
};

export type SessaoClinicaDetalhe = SessaoClinicaResumo & {
    evolucao: string | null;
    diagnostico_fisioterapeutico: string | null;
    prognostico: string | null;
    plano_terapeutico: string | null;
    observacoes: string | null;
    corrigido_por_usuario_id: string | null;
};

export type AgendamentoDaSessao = {
    id: string;
    cliente_id: string;
    profissional_id: string;
    status: string;
};

export type DadosNovaSessaoClinica = {
    cliente_id: string;
    profissional_id: string;
    agendamento_id?: string;
    data_sessao: Date;
    evolucao: string;
    diagnostico_fisioterapeutico?: string;
    prognostico?: string;
    plano_terapeutico?: string;
    observacoes?: string;
};

export type DadosCorrecaoSessaoClinica = {
    evolucao?: string;
    diagnostico_fisioterapeutico?: string | null;
    prognostico?: string | null;
    plano_terapeutico?: string | null;
    observacoes?: string | null;
};

export type HistoricoCorrecaoSessaoClinica = {
    id: string;
    sessao_clinica_id: string;
    corrigido_por_usuario_id: string;
    campos_alterados: string[];
    dados_anteriores: Record<string, string | null>;
    dados_novos: Record<string, string | null>;
    criado_em: Date;
};

type FiltrosListagem = {
    inicio: Date;
    fim: Date;
    clienteId?: string;
    profissionalId?: string;
};

const camposResumo = [
    'sc.id',
    'sc.cliente_id',
    'sc.profissional_id',
    'sc.agendamento_id',
    'sc.data_sessao',
    'sc.corrigido_em',
    'c.nome as cliente_nome',
    'p.nome as profissional_nome',
] as const;

const camposDetalhe = [
    'sc.evolucao',
    'sc.diagnostico_fisioterapeutico',
    'sc.prognostico',
    'sc.plano_terapeutico',
    'sc.observacoes',
    'sc.corrigido_por_usuario_id',
] as const;

function consultaBase(executor: ExecutorBanco) {
    return executor('sessoes_clinicas as sc')
        .innerJoin('clientes as c', function () {
            this.on('c.id', '=', 'sc.cliente_id').andOn(
                'c.organizacao_id',
                '=',
                'sc.organizacao_id',
            );
        })
        .innerJoin('profissionais as p', function () {
            this.on('p.id', '=', 'sc.profissional_id').andOn(
                'p.organizacao_id',
                '=',
                'sc.organizacao_id',
            );
        });
}

class SessoesClinicasRepository {
    async executarEmTransacao<T>(
        operacao: (transaction: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        return connection.transaction(operacao);
    }

    // Verifica se o cliente pertence à organização e está ativo na área.
    async buscarClienteElegivel(
        organizacaoId: string,
        areaNegocioId: string,
        clienteId: string,
        transaction: Knex.Transaction,
    ): Promise<{ id: string; nome: string } | undefined> {
        const cliente = await transaction('clientes as c')
            .innerJoin('clientes_areas as ca', function () {
                this.on('ca.cliente_id', '=', 'c.id').andOnVal('ca.area_negocio_id', areaNegocioId);
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

        return cliente;
    }

    // Verifica se o profissional pertence à organização e está ativo na área.
    async buscarProfissionalElegivel(
        organizacaoId: string,
        areaNegocioId: string,
        profissionalId: string,
        transaction: Knex.Transaction,
    ): Promise<{ id: string; nome: string } | undefined> {
        const profissional = await transaction('profissionais as p')
            .innerJoin('profissionais_areas as pa', function () {
                this.on('pa.profissional_id', '=', 'p.id').andOnVal(
                    'pa.area_negocio_id',
                    areaNegocioId,
                );
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

        return profissional;
    }

    // Consulta o agendamento para o Service validar seus participantes e status.
    async buscarAgendamentoParaSessao(
        organizacaoId: string,
        areaNegocioId: string,
        agendamentoId: string,
        transaction: Knex.Transaction,
    ): Promise<AgendamentoDaSessao | undefined> {
        const agendamento = await transaction('agendamentos')
            .select('id', 'cliente_id', 'profissional_id', 'status')
            .where({
                id: agendamentoId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .first();

        return agendamento as AgendamentoDaSessao | undefined;
    }

    // Evita reutilizar um agendamento que já possui sessão clínica.
    async buscarSessaoPorAgendamento(
        organizacaoId: string,
        areaNegocioId: string,
        agendamentoId: string,
        transaction: Knex.Transaction,
    ): Promise<{ id: string } | undefined> {
        const sessao = await transaction('sessoes_clinicas')
            .select('id')
            .where({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                agendamento_id: agendamentoId,
            })
            .whereNull('deletado_em')
            .first();

        return sessao as { id: string } | undefined;
    }

    // ROTA POST /sessoes-clinicas
    async criar(
        organizacaoId: string,
        areaNegocioId: string,
        dados: DadosNovaSessaoClinica,
        transaction: Knex.Transaction,
    ): Promise<string> {
        const [sessao] = await transaction('sessoes_clinicas')
            .insert({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                cliente_id: dados.cliente_id,
                profissional_id: dados.profissional_id,
                agendamento_id: dados.agendamento_id ?? null,
                data_sessao: dados.data_sessao,
                evolucao: dados.evolucao,
                diagnostico_fisioterapeutico: dados.diagnostico_fisioterapeutico ?? null,
                prognostico: dados.prognostico ?? null,
                plano_terapeutico: dados.plano_terapeutico ?? null,
                observacoes: dados.observacoes ?? null,
            })
            .returning('id');

        return sessao.id as string;
    }

    // ROTA GET /sessoes-clinicas
    // Retorna um resumo, sem os textos do prontuário.
    async listar(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: FiltrosListagem,
    ): Promise<SessaoClinicaResumo[]> {
        const consulta = consultaBase(connection)
            .select(...camposResumo)
            .where({
                'sc.organizacao_id': organizacaoId,
                'sc.area_negocio_id': areaNegocioId,
            })
            .whereNull('sc.deletado_em')
            .andWhere('sc.data_sessao', '>=', filtros.inicio)
            .andWhere('sc.data_sessao', '<', filtros.fim);

        if (filtros.clienteId) {
            consulta.andWhere('sc.cliente_id', filtros.clienteId);
        }

        if (filtros.profissionalId) {
            consulta.andWhere('sc.profissional_id', filtros.profissionalId);
        }

        const sessoes = await consulta.orderBy('sc.data_sessao', 'desc').orderBy('sc.id', 'asc');

        return sessoes as SessaoClinicaResumo[];
    }

    // ROTA GET /sessoes-clinicas/:sessaoClinicaId
    async buscarPorId(
        organizacaoId: string,
        areaNegocioId: string,
        sessaoClinicaId: string,
        executor: ExecutorBanco = connection,
        bloquear = false,
    ): Promise<SessaoClinicaDetalhe | undefined> {
        const consulta = consultaBase(executor)
            .select(...camposResumo, ...camposDetalhe)
            .where({
                'sc.id': sessaoClinicaId,
                'sc.organizacao_id': organizacaoId,
                'sc.area_negocio_id': areaNegocioId,
            })
            .whereNull('sc.deletado_em');

        if (bloquear) {
            consulta.forUpdate('sc');
        }

        const sessao = await consulta.first();

        return sessao as SessaoClinicaDetalhe | undefined;
    }

    async registrarHistoricoCorrecao(
        sessaoClinicaId: string,
        usuarioId: string,
        camposAlterados: string[],
        dadosAnteriores: Record<string, string | null>,
        dadosNovos: Record<string, string | null>,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('historico_correcoes_sessoes_clinicas').insert({
            sessao_clinica_id: sessaoClinicaId,
            corrigido_por_usuario_id: usuarioId,
            campos_alterados: camposAlterados,
            dados_anteriores: JSON.stringify(dadosAnteriores),
            dados_novos: JSON.stringify(dadosNovos),
        });
    }

    async listarHistoricoCorrecoes(
        organizacaoId: string,
        areaNegocioId: string,
        sessaoClinicaId: string,
    ): Promise<HistoricoCorrecaoSessaoClinica[]> {
        const historico = await connection('historico_correcoes_sessoes_clinicas as hc')
            .innerJoin('sessoes_clinicas as sc', 'sc.id', 'hc.sessao_clinica_id')
            .select(
                'hc.id',
                'hc.sessao_clinica_id',
                'hc.corrigido_por_usuario_id',
                'hc.campos_alterados',
                'hc.dados_anteriores',
                'hc.dados_novos',
                'hc.criado_em',
            )
            .where({
                'sc.id': sessaoClinicaId,
                'sc.organizacao_id': organizacaoId,
                'sc.area_negocio_id': areaNegocioId,
            })
            .whereNull('sc.deletado_em')
            .orderBy('hc.criado_em', 'asc')
            .orderBy('hc.id', 'asc');

        return historico as HistoricoCorrecaoSessaoClinica[];
    }

    // ROTA PATCH /sessoes-clinicas/:sessaoClinicaId
    async corrigir(
        organizacaoId: string,
        areaNegocioId: string,
        sessaoClinicaId: string,
        usuarioId: string,
        dados: DadosCorrecaoSessaoClinica,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('sessoes_clinicas')
            .where({
                id: sessaoClinicaId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
            })
            .whereNull('deletado_em')
            .update({
                ...dados,
                corrigido_em: transaction.fn.now(),
                corrigido_por_usuario_id: usuarioId,
            });
    }
}

export default new SessoesClinicasRepository();
