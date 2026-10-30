import AppError from '../../shared/errors/AppError.js';

import agendamentosRepository from './agendamentos.repository.js';
import type {
    AgendamentoPersistido,
    DadosAtualizacaoAgendamento,
} from './agendamentos.repository.js';
import type {
    AtualizarAgendamentoInput,
    CancelarAgendamentoInput,
    CriarAgendamentoInput,
    FiltrosAgendamentosInput,
    StatusAgendamento,
} from './agendamentos.validator.js';

type ErroPostgres = Error & { code?: string; constraint?: string };

const STATUS_TERMINAIS: StatusAgendamento[] = ['CONCLUIDO', 'CANCELADO'];

function validarContexto(organizacaoId: string | undefined, areaNegocioId: string | undefined) {
    if (!organizacaoId) {
        throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
    }

    if (!areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    return { organizacaoId, areaNegocioId };
}

function erroAgendamentoNaoEncontrado() {
    return new AppError('Agendamento não encontrado.', 404, 'AGENDAMENTO_NAO_ENCONTRADO');
}

function erroEstadoIncompativel() {
    return new AppError(
        'Estado do agendamento incompatível com a operação.',
        409,
        'AGENDAMENTO_ESTADO_INCOMPATIVEL',
    );
}

function erroHorarioOcupado(recurso?: 'CLIENTE' | 'PROFISSIONAL') {
    const sufixo = recurso === 'CLIENTE' ? ' pelo cliente' : recurso ? ' pelo profissional' : '';
    return new AppError(`Horário já ocupado${sufixo}.`, 409, 'AGENDAMENTO_HORARIO_OCUPADO');
}

function selecionarCamposPublicos(agendamento: AgendamentoPersistido) {
    const {
        organizacao_id: _organizacaoId,
        area_negocio_id: _areaNegocioId,
        ...camposPublicos
    } = agendamento;

    return camposPublicos;
}

function identificarConflitoBanco(error: unknown): 'CLIENTE' | 'PROFISSIONAL' | undefined {
    const erro = error as ErroPostgres;

    if (erro.code !== '23P01') {
        return undefined;
    }

    if (erro.constraint === 'ex_agendamentos_cliente_horario') {
        return 'CLIENTE';
    }

    if (erro.constraint === 'ex_agendamentos_profissional_horario') {
        return 'PROFISSIONAL';
    }

    return undefined;
}

async function traduzirConflito<T>(operacao: () => Promise<T>): Promise<T> {
    try {
        return await operacao();
    } catch (error) {
        const erro = error as ErroPostgres;

        if (erro.code === '23P01') {
            throw erroHorarioOcupado(identificarConflitoBanco(error));
        }

        throw error;
    }
}

class AgendamentosService {
    async criar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        dados: CriarAgendamentoInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return traduzirConflito(() =>
            agendamentosRepository.executarEmTransacao(async (transaction) => {
                const cliente = await agendamentosRepository.buscarClienteAgendavel(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dados.cliente_id,
                    transaction,
                );
                const profissional = await agendamentosRepository.buscarProfissionalAgendavel(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dados.profissional_id,
                    transaction,
                );
                const servico = await agendamentosRepository.buscarServicoAgendavel(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dados.servico_id,
                    transaction,
                );

                if (!cliente) {
                    throw new AppError(
                        'Cliente indisponível para agendamento nesta área.',
                        404,
                        'CLIENTE_NAO_DISPONIVEL',
                    );
                }
                if (!profissional) {
                    throw new AppError(
                        'Profissional indisponível para agendamento nesta área.',
                        404,
                        'PROFISSIONAL_NAO_DISPONIVEL',
                    );
                }
                if (!servico) {
                    throw new AppError(
                        'Serviço indisponível para agendamento nesta área.',
                        404,
                        'SERVICO_NAO_DISPONIVEL',
                    );
                }

                const inicioEm = new Date(dados.inicio_em);
                const fimEm = new Date(inicioEm.getTime() + servico.duracao_minutos * 60_000);
                const conflito = await agendamentosRepository.buscarConflito(
                    contexto.organizacaoId,
                    dados.profissional_id,
                    dados.cliente_id,
                    inicioEm,
                    fimEm,
                    transaction,
                );

                if (conflito) {
                    throw erroHorarioOcupado(
                        conflito.profissional_id === dados.profissional_id
                            ? 'PROFISSIONAL'
                            : 'CLIENTE',
                    );
                }

                const agendamentoId = await agendamentosRepository.criar(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    {
                        cliente_id: dados.cliente_id,
                        profissional_id: dados.profissional_id,
                        servico_id: dados.servico_id,
                        inicio_em: inicioEm,
                        fim_em: fimEm,
                        ...(dados.observacao !== undefined && { observacao: dados.observacao }),
                    },
                    transaction,
                );

                const agendamento = await agendamentosRepository.buscarPorId(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    agendamentoId,
                    transaction,
                );

                if (!agendamento) {
                    throw erroAgendamentoNaoEncontrado();
                }

                return selecionarCamposPublicos(agendamento);
            }),
        );
    }

    async listar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        filtros: FiltrosAgendamentosInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);
        const agendamentos = await agendamentosRepository.listar(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            {
                inicio: new Date(filtros.inicio),
                fim: new Date(filtros.fim),
                ...(filtros.profissionalId && { profissionalId: filtros.profissionalId }),
                ...(filtros.clienteId && { clienteId: filtros.clienteId }),
                ...(filtros.status && { status: filtros.status }),
            },
        );

        return agendamentos.map(selecionarCamposPublicos);
    }

    async buscarPorId(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        agendamentoId: string,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);
        const agendamento = await agendamentosRepository.buscarPorId(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            agendamentoId,
        );

        if (!agendamento) {
            throw erroAgendamentoNaoEncontrado();
        }

        return selecionarCamposPublicos(agendamento);
    }

    async atualizar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        agendamentoId: string,
        dados: AtualizarAgendamentoInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return traduzirConflito(() =>
            agendamentosRepository.executarEmTransacao(async (transaction) => {
                const agendamento = await agendamentosRepository.buscarPorId(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    agendamentoId,
                    transaction,
                    true,
                );

                if (!agendamento) {
                    throw erroAgendamentoNaoEncontrado();
                }
                if (STATUS_TERMINAIS.includes(agendamento.status)) {
                    throw erroEstadoIncompativel();
                }

                const alteraAlocacao =
                    dados.inicio_em !== undefined ||
                    dados.profissional_id !== undefined ||
                    dados.servico_id !== undefined;
                const atualizacao: DadosAtualizacaoAgendamento = {
                    ...(dados.observacao !== undefined && { observacao: dados.observacao }),
                };

                if (alteraAlocacao) {
                    const clienteId = agendamento.cliente_id;
                    const profissionalId = dados.profissional_id ?? agendamento.profissional_id;
                    const servicoId = dados.servico_id ?? agendamento.servico_id;
                    const cliente = await agendamentosRepository.buscarClienteAgendavel(
                        contexto.organizacaoId,
                        contexto.areaNegocioId,
                        clienteId,
                        transaction,
                    );
                    const profissional = await agendamentosRepository.buscarProfissionalAgendavel(
                        contexto.organizacaoId,
                        contexto.areaNegocioId,
                        profissionalId,
                        transaction,
                    );
                    const servico = await agendamentosRepository.buscarServicoAgendavel(
                        contexto.organizacaoId,
                        contexto.areaNegocioId,
                        servicoId,
                        transaction,
                    );

                    if (!cliente) {
                        throw new AppError(
                            'Cliente indisponível para agendamento nesta área.',
                            404,
                            'CLIENTE_NAO_DISPONIVEL',
                        );
                    }
                    if (!profissional) {
                        throw new AppError(
                            'Profissional indisponível para agendamento nesta área.',
                            404,
                            'PROFISSIONAL_NAO_DISPONIVEL',
                        );
                    }
                    if (!servico) {
                        throw new AppError(
                            'Serviço indisponível para agendamento nesta área.',
                            404,
                            'SERVICO_NAO_DISPONIVEL',
                        );
                    }

                    const inicioEm = dados.inicio_em
                        ? new Date(dados.inicio_em)
                        : new Date(agendamento.inicio_em);
                    const duracaoMs = dados.servico_id
                        ? servico.duracao_minutos * 60_000
                        : new Date(agendamento.fim_em).getTime() -
                          new Date(agendamento.inicio_em).getTime();
                    const fimEm = new Date(inicioEm.getTime() + duracaoMs);
                    const conflito = await agendamentosRepository.buscarConflito(
                        contexto.organizacaoId,
                        profissionalId,
                        clienteId,
                        inicioEm,
                        fimEm,
                        transaction,
                        agendamentoId,
                    );

                    if (conflito) {
                        throw erroHorarioOcupado(
                            conflito.profissional_id === profissionalId
                                ? 'PROFISSIONAL'
                                : 'CLIENTE',
                        );
                    }

                    Object.assign(atualizacao, {
                        inicio_em: inicioEm,
                        fim_em: fimEm,
                        ...(dados.profissional_id !== undefined && {
                            profissional_id: dados.profissional_id,
                        }),
                        ...(dados.servico_id !== undefined && { servico_id: dados.servico_id }),
                    });
                }

                await agendamentosRepository.atualizar(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    agendamentoId,
                    atualizacao,
                    transaction,
                );

                const atualizado = await agendamentosRepository.buscarPorId(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    agendamentoId,
                    transaction,
                );

                if (!atualizado) {
                    throw erroAgendamentoNaoEncontrado();
                }

                return {
                    agendamento: selecionarCamposPublicos(atualizado),
                    camposAlterados: Object.keys(dados),
                };
            }),
        );
    }

    async confirmar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        agendamentoId: string,
    ) {
        return this.alterarStatus(organizacaoId, areaNegocioId, agendamentoId, 'CONFIRMADO');
    }

    async concluir(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        agendamentoId: string,
    ) {
        return this.alterarStatus(organizacaoId, areaNegocioId, agendamentoId, 'CONCLUIDO');
    }

    async cancelar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        usuarioId: string,
        agendamentoId: string,
        dados: CancelarAgendamentoInput,
    ) {
        return this.alterarStatus(organizacaoId, areaNegocioId, agendamentoId, 'CANCELADO', {
            usuarioId,
            ...(dados.motivo_cancelamento !== undefined && {
                motivoCancelamento: dados.motivo_cancelamento,
            }),
        });
    }

    private async alterarStatus(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        agendamentoId: string,
        novoStatus: 'CONFIRMADO' | 'CONCLUIDO' | 'CANCELADO',
        cancelamento?: { usuarioId: string; motivoCancelamento?: string },
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return agendamentosRepository.executarEmTransacao(async (transaction) => {
            const agendamento = await agendamentosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
                transaction,
                true,
            );

            if (!agendamento) {
                throw erroAgendamentoNaoEncontrado();
            }

            const permitido =
                (agendamento.status === 'AGENDADO' &&
                    ['CONFIRMADO', 'CONCLUIDO', 'CANCELADO'].includes(novoStatus)) ||
                (agendamento.status === 'CONFIRMADO' &&
                    ['CONCLUIDO', 'CANCELADO'].includes(novoStatus));

            if (!permitido) {
                throw erroEstadoIncompativel();
            }

            await agendamentosRepository.alterarStatus(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
                novoStatus,
                transaction,
                cancelamento
                    ? {
                          cancelado_em: new Date(),
                          cancelado_por_usuario_id: cancelamento.usuarioId,
                          ...(cancelamento.motivoCancelamento !== undefined && {
                              motivo_cancelamento: cancelamento.motivoCancelamento,
                          }),
                      }
                    : undefined,
            );

            const atualizado = await agendamentosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                agendamentoId,
                transaction,
            );

            if (!atualizado) {
                throw erroAgendamentoNaoEncontrado();
            }

            return selecionarCamposPublicos(atualizado);
        });
    }
}

export default new AgendamentosService();
