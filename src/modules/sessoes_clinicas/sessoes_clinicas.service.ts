import AppError from '../../shared/errors/AppError.js';

import sessoesClinicasRepository from './sessoes_clinicas.repository.js';

import autorizacaoClinicaService from './autorizacao_clinica.service.js';

import auditoriaClinicaTransacional from './sessoes_clinicas.auditoria_transacional.js';

import type { MetadadosAuditoriaClinica } from './sessoes_clinicas.auditoria_transacional.js';

import type {
    DadosCorrecaoSessaoClinica,
    DadosNovaSessaoClinica,
} from './sessoes_clinicas.repository.js';

import type {
    AtualizarSessaoClinicaInput,
    CriarSessaoClinicaInput,
} from './sessoes_clinicas.validator.js';

function validarContexto(organizacaoId: string | undefined, areaNegocioId: string | undefined) {
    if (!organizacaoId) {
        throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
    }

    if (!areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    return { organizacaoId, areaNegocioId };
}

function erroSessaoNaoEncontrada() {
    return new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
}

function erroSessaoJaRegistrada() {
    return new AppError(
        'Este agendamento já possui uma sessão clínica registrada.',
        409,
        'SESSAO_CLINICA_AGENDAMENTO_DUPLICADO',
    );
}

function isAgendamentoDuplicado(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    if (!('code' in error) || !('constraint' in error)) {
        return false;
    }

    return error.code === '23505' && error.constraint === 'uq_sessoes_clinicas_agendamento_ativo';
}

class SessoesClinicasService {
    async criar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        dados: CriarSessaoClinicaInput,
        usuarioId?: string,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        const dataSessao = new Date(dados.data_sessao);

        // Uma sessão clínica representa um atendimento realizado.
        if (dataSessao.getTime() > Date.now()) {
            throw new AppError(
                'A data da sessão clínica não pode ser futura.',
                400,
                'DATA_SESSAO_FUTURA',
            );
        }

        try {
            return await sessoesClinicasRepository.executarEmTransacao(async (transaction) => {
                if (usuarioId !== undefined) {
                    const identidade = await autorizacaoClinicaService.identificarProfissional(
                        usuarioId,
                        contexto.organizacaoId,
                        contexto.areaNegocioId,
                        transaction,
                        true,
                    );

                    if (identidade.profissionalId !== dados.profissional_id) {
                        throw new AppError(
                            'Não é permitido registrar uma sessão para outro profissional.',
                            403,
                            'PROFISSIONAL_CLINICO_NAO_AUTORIZADO',
                        );
                    }
                }

                const cliente = await sessoesClinicasRepository.buscarClienteElegivel(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dados.cliente_id,
                    transaction,
                );

                if (!cliente) {
                    throw new AppError(
                        'Cliente indisponível nesta área de negócio.',
                        404,
                        'CLIENTE_NAO_DISPONIVEL',
                    );
                }

                const profissional = await sessoesClinicasRepository.buscarProfissionalElegivel(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dados.profissional_id,
                    transaction,
                );

                if (!profissional) {
                    throw new AppError(
                        'Profissional indisponível nesta área de negócio.',
                        404,
                        'PROFISSIONAL_NAO_DISPONIVEL',
                    );
                }

                if (dados.agendamento_id) {
                    const agendamento = await sessoesClinicasRepository.buscarAgendamentoParaSessao(
                        contexto.organizacaoId,
                        contexto.areaNegocioId,
                        dados.agendamento_id,
                        transaction,
                    );

                    if (!agendamento) {
                        throw new AppError(
                            'Agendamento não encontrado.',
                            404,
                            'AGENDAMENTO_NAO_ENCONTRADO',
                        );
                    }

                    if (agendamento.status === 'CANCELADO') {
                        throw new AppError(
                            'Não é possível registrar uma sessão em um agendamento cancelado.',
                            409,
                            'AGENDAMENTO_CANCELADO',
                        );
                    }

                    if (
                        agendamento.cliente_id !== dados.cliente_id ||
                        agendamento.profissional_id !== dados.profissional_id
                    ) {
                        throw new AppError(
                            'Cliente ou profissional não corresponde ao agendamento.',
                            409,
                            'AGENDAMENTO_DADOS_DIVERGENTES',
                        );
                    }

                    const sessaoExistente =
                        await sessoesClinicasRepository.buscarSessaoPorAgendamento(
                            contexto.organizacaoId,
                            contexto.areaNegocioId,
                            dados.agendamento_id,
                            transaction,
                        );

                    if (sessaoExistente) {
                        throw erroSessaoJaRegistrada();
                    }
                }

                const dadosNovaSessao: DadosNovaSessaoClinica = {
                    cliente_id: dados.cliente_id,
                    profissional_id: dados.profissional_id,
                    data_sessao: dataSessao,
                    evolucao: dados.evolucao,
                    ...(dados.agendamento_id !== undefined && {
                        agendamento_id: dados.agendamento_id,
                    }),
                    ...(dados.diagnostico_fisioterapeutico !== undefined && {
                        diagnostico_fisioterapeutico: dados.diagnostico_fisioterapeutico,
                    }),
                    ...(dados.prognostico !== undefined && {
                        prognostico: dados.prognostico,
                    }),
                    ...(dados.plano_terapeutico !== undefined && {
                        plano_terapeutico: dados.plano_terapeutico,
                    }),
                    ...(dados.observacoes !== undefined && {
                        observacoes: dados.observacoes,
                    }),
                    ...(dados.objetivo_sessao !== undefined && {
                        objetivo_sessao: dados.objetivo_sessao,
                    }),
                    ...(dados.avaliacao_previa !== undefined && {
                        avaliacao_previa: dados.avaliacao_previa,
                    }),
                    ...(dados.procedimentos_realizados !== undefined && {
                        procedimentos_realizados: dados.procedimentos_realizados,
                    }),
                    ...(dados.exercicios_parametros !== undefined && {
                        exercicios_parametros: dados.exercicios_parametros,
                    }),
                    ...(dados.resposta_paciente !== undefined && {
                        resposta_paciente: dados.resposta_paciente,
                    }),
                    ...(dados.orientacoes !== undefined && {
                        orientacoes: dados.orientacoes,
                    }),
                    ...(dados.plano_proxima_sessao !== undefined && {
                        plano_proxima_sessao: dados.plano_proxima_sessao,
                    }),
                };

                const sessaoId = await sessoesClinicasRepository.criar(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    dadosNovaSessao,
                    transaction,
                );

                const sessao = await sessoesClinicasRepository.buscarPorId(
                    contexto.organizacaoId,
                    contexto.areaNegocioId,
                    sessaoId,
                    transaction,
                );

                if (!sessao) {
                    throw erroSessaoNaoEncontrada();
                }

                // A criação e a auditoria utilizam a MESMA transação.
                // Uma falha de auditoria desfaz o INSERT da sessão.

                await auditoriaClinicaTransacional.registrar(transaction, {
                    organizacaoId: contexto.organizacaoId,
                    areaNegocioId: contexto.areaNegocioId,
                    sessaoClinicaId: sessao.id,
                    acao: 'SESSAO_CLINICA.CRIADA',
                    ...(usuarioId !== undefined && { usuarioId }),
                    ...(metadados !== undefined && { metadados }),
                });

                return sessao;
            });
        } catch (error) {
            if (isAgendamentoDuplicado(error)) {
                throw erroSessaoJaRegistrada();
            }

            throw error;
        }
    }

    async corrigir(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        usuarioId: string | undefined,
        sessaoClinicaId: string,
        dados: AtualizarSessaoClinicaInput,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        if (!usuarioId) {
            throw new AppError(
                'Usuário responsável não informado.',
                401,
                'AUTENTICACAO_NECESSARIA',
            );
        }

        return sessoesClinicasRepository.executarEmTransacao(async (transaction) => {
            // Confirma a autorização clínica dentro da transação.
            // FOR SHARE mantém os vínculos consultados protegidos
            // contra alterações concorrentes durante a operação.
            await autorizacaoClinicaService.identificarProfissional(
                usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                transaction,
                true,
            );

            // 1. Busca e bloqueia a sessão para evitar
            // correções simultâneas sobre o mesmo registro.

            const sessaoExistente = await sessoesClinicasRepository.buscarPorIdAutorizada(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                usuarioId,
                sessaoClinicaId,
                transaction,
                true,
            );

            if (!sessaoExistente) {
                throw erroSessaoNaoEncontrada();
            }

            // 2. Monta somente os campos informados.
            const atualizacao: DadosCorrecaoSessaoClinica = {
                ...(dados.evolucao !== undefined && {
                    evolucao: dados.evolucao,
                }),
                ...(dados.diagnostico_fisioterapeutico !== undefined && {
                    diagnostico_fisioterapeutico: dados.diagnostico_fisioterapeutico,
                }),
                ...(dados.prognostico !== undefined && {
                    prognostico: dados.prognostico,
                }),
                ...(dados.plano_terapeutico !== undefined && {
                    plano_terapeutico: dados.plano_terapeutico,
                }),
                ...(dados.observacoes !== undefined && {
                    observacoes: dados.observacoes,
                }),
                ...(dados.objetivo_sessao !== undefined && {
                    objetivo_sessao: dados.objetivo_sessao,
                }),
                ...(dados.avaliacao_previa !== undefined && {
                    avaliacao_previa: dados.avaliacao_previa,
                }),
                ...(dados.procedimentos_realizados !== undefined && {
                    procedimentos_realizados: dados.procedimentos_realizados,
                }),
                ...(dados.exercicios_parametros !== undefined && {
                    exercicios_parametros: dados.exercicios_parametros,
                }),
                ...(dados.resposta_paciente !== undefined && {
                    resposta_paciente: dados.resposta_paciente,
                }),
                ...(dados.orientacoes !== undefined && {
                    orientacoes: dados.orientacoes,
                }),
                ...(dados.plano_proxima_sessao !== undefined && {
                    plano_proxima_sessao: dados.plano_proxima_sessao,
                }),
            };

            // 3. Define os campos clínicos que podem ser corrigidos.
            const camposClinicos = [
                'evolucao',
                'diagnostico_fisioterapeutico',
                'prognostico',
                'plano_terapeutico',
                'observacoes',
                'objetivo_sessao',
                'avaliacao_previa',
                'procedimentos_realizados',
                'exercicios_parametros',
                'resposta_paciente',
                'orientacoes',
                'plano_proxima_sessao',
            ] as const;

            const camposAlterados: string[] = [];
            const dadosAnteriores: Record<string, string | null> = {};
            const dadosNovos: Record<string, string | null> = {};

            // 4. Compara os valores antigos e novos.
            for (const campo of camposClinicos) {
                const novoValor = atualizacao[campo];
                const valorAnterior = sessaoExistente[campo];

                if (novoValor === undefined || novoValor === valorAnterior) {
                    continue;
                }

                camposAlterados.push(campo);
                dadosAnteriores[campo] = valorAnterior;
                dadosNovos[campo] = novoValor;
            }

            // 5. Não gera uma correção se nada mudou.
            if (camposAlterados.length === 0) {
                throw new AppError(
                    'Nenhuma alteração foi identificada.',
                    400,
                    'SESSAO_CLINICA_SEM_ALTERACOES',
                );
            }

            // 6. Atualiza a sessão clínica.
            await sessoesClinicasRepository.corrigir(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                sessaoClinicaId,
                usuarioId,
                atualizacao,
                transaction,
            );

            // 7. Preserva os valores anteriores e novos.
            await sessoesClinicasRepository.registrarHistoricoCorrecao(
                sessaoClinicaId,
                usuarioId,
                camposAlterados,
                dadosAnteriores,
                dadosNovos,
                transaction,
            );

            // 8. Retorna a sessão atualizada.
            const sessaoAtualizada = await sessoesClinicasRepository.buscarPorIdAutorizada(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                usuarioId,
                sessaoClinicaId,
                transaction,
            );

            if (!sessaoAtualizada) {
                throw erroSessaoNaoEncontrada();
            }

            await auditoriaClinicaTransacional.registrar(transaction, {
                organizacaoId: contexto.organizacaoId,
                areaNegocioId: contexto.areaNegocioId,
                usuarioId,
                sessaoClinicaId,
                acao: 'SESSAO_CLINICA.CORRIGIDA',
                camposAlterados,
                ...(metadados !== undefined && { metadados }),
            });

            return {
                sessao: sessaoAtualizada,
                camposAlterados,
            };
        });
    }
}

export default new SessoesClinicasService();
