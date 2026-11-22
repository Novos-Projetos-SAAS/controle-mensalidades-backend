import AppError from '../../shared/errors/AppError.js';

import profissionaisRepository from './profissionais.repository.js';
import type { DadosAtualizacaoProfissional } from './profissionais.repository.js';
import type {
    AtualizarProfissionalInput,
    CriarProfissionalInput,
    FiltrosProfissionaisInput,
} from './profissionais.validator.js';

function validarOrganizacao(organizacaoId: string | undefined) {
    if (!organizacaoId) {
        throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
    }

    return organizacaoId;
}

function erroProfissionalNaoEncontrado() {
    return new AppError('Profissional não encontrado.', 404, 'PROFISSIONAL_NAO_ENCONTRADO');
}

function erroAreaNaoEncontrada() {
    return new AppError('Área de negócio não encontrada.', 404, 'AREA_NEGOCIO_NAO_ENCONTRADA');
}

function erroCpfJaCadastrado() {
    return new AppError(
        'Já existe um profissional cadastrado com este CPF.',
        409,
        'PROFISSIONAL_CPF_JA_CADASTRADO',
    );
}

function isCpfDuplicado(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        (error.constraint === 'uq_profissionais_organizacao_cpf' ||
            error.constraint === 'uq_profissionais_organizacao_cpf_indice')
    );
}

class ProfissionaisService {
    async criar(organizacaoId: string | undefined, dados: CriarProfissionalInput) {
        const organizacao = validarOrganizacao(organizacaoId);

        try {
            return await profissionaisRepository.executarEmTransacao(async (transaction) => {
                const areasValidas = await profissionaisRepository.listarAreasValidas(
                    organizacao,
                    dados.areas,
                    transaction,
                );

                if (areasValidas.length !== dados.areas.length) {
                    throw erroAreaNaoEncontrada();
                }

                if (dados.cpf) {
                    const profissionalExistente = await profissionaisRepository.buscarPorCpf(
                        organizacao,
                        dados.cpf,
                        transaction,
                    );

                    if (profissionalExistente) {
                        throw erroCpfJaCadastrado();
                    }
                }

                const profissional = await profissionaisRepository.criarProfissional(
                    organizacao,
                    {
                        nome: dados.nome,
                        ...(dados.cpf !== undefined && {
                            cpf: dados.cpf,
                        }),
                        ...(dados.email !== undefined && {
                            email: dados.email,
                        }),
                        ...(dados.telefone !== undefined && {
                            telefone: dados.telefone,
                        }),
                        ...(dados.conselho !== undefined && {
                            conselho: dados.conselho,
                        }),
                        ...(dados.numero_conselho !== undefined && {
                            numero_conselho: dados.numero_conselho,
                        }),
                        ...(dados.uf_conselho !== undefined && {
                            uf_conselho: dados.uf_conselho,
                        }),
                    },
                    transaction,
                );

                await profissionaisRepository.criarVinculosAreas(
                    profissional.id,
                    dados.areas,
                    transaction,
                );

                return {
                    ...profissional,
                    areas: areasValidas,
                };
            });
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (isCpfDuplicado(error)) {
                throw erroCpfJaCadastrado();
            }

            throw error;
        }
    }

    async listar(organizacaoId: string | undefined, filtros: FiltrosProfissionaisInput) {
        const organizacao = validarOrganizacao(organizacaoId);

        if (filtros.areaNegocioId) {
            const area = await profissionaisRepository.buscarAreaAtivaPorId(
                organizacao,
                filtros.areaNegocioId,
            );

            if (!area) {
                throw erroAreaNaoEncontrada();
            }
        }

        const buscaNumerica = filtros.busca?.replace(/\D/g, '');

        const profissionais = await profissionaisRepository.listarPorOrganizacao(organizacao, {
            ...(filtros.busca !== undefined && {
                busca: filtros.busca,
            }),
            ...(buscaNumerica && {
                buscaNumerica,
            }),
            ...(filtros.ativo !== undefined && {
                ativo: filtros.ativo,
            }),
            ...(filtros.areaNegocioId !== undefined && {
                areaNegocioId: filtros.areaNegocioId,
            }),
        });

        const areas = await profissionaisRepository.listarAreasDosProfissionais(
            organizacao,
            profissionais.map((profissional) => profissional.id),
        );

        const areasPorProfissional = new Map<string, Array<{ id: string; nome: string }>>();

        for (const area of areas) {
            const areasProfissional = areasPorProfissional.get(area.profissionalId) ?? [];

            areasProfissional.push({
                id: area.id,
                nome: area.nome,
            });

            areasPorProfissional.set(area.profissionalId, areasProfissional);
        }

        return profissionais.map((profissional) => ({
            ...profissional,
            areas: areasPorProfissional.get(profissional.id) ?? [],
        }));
    }

    async buscarPorId(organizacaoId: string | undefined, profissionalId: string) {
        const organizacao = validarOrganizacao(organizacaoId);

        const profissional = await profissionaisRepository.buscarPorId(organizacao, profissionalId);

        if (!profissional) {
            throw erroProfissionalNaoEncontrado();
        }

        const areas = await profissionaisRepository.listarAreasDosProfissionais(organizacao, [
            profissional.id,
        ]);

        return {
            ...profissional,
            areas: areas.map((area) => ({
                id: area.id,
                nome: area.nome,
            })),
        };
    }

    async atualizar(
        organizacaoId: string | undefined,
        profissionalId: string,
        dados: AtualizarProfissionalInput,
    ) {
        const organizacao = validarOrganizacao(organizacaoId);

        try {
            return await profissionaisRepository.executarEmTransacao(async (transaction) => {
                const profissionalExistente = await profissionaisRepository.buscarPorId(
                    organizacao,
                    profissionalId,
                    transaction,
                    true,
                );

                if (!profissionalExistente) {
                    throw erroProfissionalNaoEncontrado();
                }

                const areasAnteriores =
                    dados.areas !== undefined
                        ? await profissionaisRepository.listarAreasDosProfissionais(
                              organizacao,
                              [profissionalId],
                              transaction,
                          )
                        : [];

                if (dados.areas !== undefined) {
                    const areasValidas = await profissionaisRepository.listarAreasValidas(
                        organizacao,
                        dados.areas,
                        transaction,
                    );

                    if (areasValidas.length !== dados.areas.length) {
                        throw erroAreaNaoEncontrada();
                    }
                }

                if (dados.cpf !== undefined && dados.cpf !== null) {
                    const profissionalMesmoCpf = await profissionaisRepository.buscarPorCpf(
                        organizacao,
                        dados.cpf,
                        transaction,
                        profissionalId,
                    );

                    if (profissionalMesmoCpf) {
                        throw erroCpfJaCadastrado();
                    }
                }

                const atualizacao: DadosAtualizacaoProfissional = {
                    ...(dados.nome !== undefined && {
                        nome: dados.nome,
                    }),
                    ...(dados.cpf !== undefined && {
                        cpf: dados.cpf,
                    }),
                    ...(dados.email !== undefined && {
                        email: dados.email,
                    }),
                    ...(dados.telefone !== undefined && {
                        telefone: dados.telefone,
                    }),
                    ...(dados.conselho !== undefined && {
                        conselho: dados.conselho,
                    }),
                    ...(dados.numero_conselho !== undefined && {
                        numero_conselho: dados.numero_conselho,
                    }),
                    ...(dados.uf_conselho !== undefined && {
                        uf_conselho: dados.uf_conselho,
                    }),
                };

                if (Object.keys(atualizacao).length > 0) {
                    await profissionaisRepository.atualizarProfissional(
                        organizacao,
                        profissionalId,
                        atualizacao,
                        transaction,
                    );
                }

                if (dados.areas !== undefined) {
                    await profissionaisRepository.sincronizarAreas(
                        organizacao,
                        profissionalId,
                        dados.areas,
                        transaction,
                    );
                }

                const profissionalAtualizado = await profissionaisRepository.buscarPorId(
                    organizacao,
                    profissionalId,
                    transaction,
                );

                if (!profissionalAtualizado) {
                    throw erroProfissionalNaoEncontrado();
                }

                const areasAtuais = await profissionaisRepository.listarAreasDosProfissionais(
                    organizacao,
                    [profissionalId],
                    transaction,
                );

                return {
                    profissional: {
                        ...profissionalAtualizado,
                        areas: areasAtuais.map((area) => ({
                            id: area.id,
                            nome: area.nome,
                        })),
                    },
                    auditoria: {
                        camposAlterados: Object.keys(dados),
                        ...(dados.areas !== undefined && {
                            areasAnteriores: areasAnteriores.map((area) => area.id),
                            areasNovas: areasAtuais.map((area) => area.id),
                        }),
                    },
                };
            });
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (isCpfDuplicado(error)) {
                throw erroCpfJaCadastrado();
            }

            throw error;
        }
    }

    async inativar(organizacaoId: string | undefined, profissionalId: string) {
        const organizacao = validarOrganizacao(organizacaoId);

        return profissionaisRepository.executarEmTransacao(async (transaction) => {
            const profissional = await profissionaisRepository.buscarPorId(
                organizacao,
                profissionalId,
                transaction,
                true,
            );

            if (!profissional) {
                throw erroProfissionalNaoEncontrado();
            }

            if (!profissional.ativo) {
                throw new AppError('Profissional já está inativo.', 409, 'PROFISSIONAL_JA_INATIVO');
            }

            await profissionaisRepository.inativarProfissional(
                organizacao,
                profissionalId,
                transaction,
            );

            const profissionalAtualizado = await profissionaisRepository.buscarPorId(
                organizacao,
                profissionalId,
                transaction,
            );

            if (!profissionalAtualizado) {
                throw erroProfissionalNaoEncontrado();
            }

            return profissionalAtualizado;
        });
    }

    async reativar(organizacaoId: string | undefined, profissionalId: string) {
        const organizacao = validarOrganizacao(organizacaoId);

        return profissionaisRepository.executarEmTransacao(async (transaction) => {
            const profissional = await profissionaisRepository.buscarPorId(
                organizacao,
                profissionalId,
                transaction,
                true,
            );

            if (!profissional) {
                throw erroProfissionalNaoEncontrado();
            }

            if (profissional.ativo) {
                throw new AppError('Profissional já está ativo.', 409, 'PROFISSIONAL_JA_ATIVO');
            }

            await profissionaisRepository.reativarProfissional(
                organizacao,
                profissionalId,
                transaction,
            );

            const profissionalAtualizado = await profissionaisRepository.buscarPorId(
                organizacao,
                profissionalId,
                transaction,
            );

            if (!profissionalAtualizado) {
                throw erroProfissionalNaoEncontrado();
            }

            return profissionalAtualizado;
        });
    }
}

export default new ProfissionaisService();
