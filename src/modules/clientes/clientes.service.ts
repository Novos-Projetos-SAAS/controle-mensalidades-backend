import type { Knex } from 'knex';

import AppError from '../../shared/errors/AppError.js';

import clientesRepository from './clientes.repository.js';
import type { DadosAtualizacaoCliente } from './clientes.repository.js';
import type {
    AtualizarClienteInput,
    CriarClienteInput,
    FiltrosClientesInput,
} from './clientes.validator.js';

function isCpfDuplicado(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'uq_clientes_organizacao_cpf'
    );
}

function erroCpfJaCadastrado() {
    return new AppError(
        'Já existe um cliente cadastrado com este CPF.',
        409,
        'CLIENTE_CPF_JA_CADASTRADO',
    );
}

function erroClienteNaoEncontrado() {
    return new AppError('Cliente não encontrado.', 404, 'CLIENTE_NAO_ENCONTRADO');
}

function erroAreaNaoEncontrada() {
    return new AppError('Área de negócio não encontrada.', 404, 'AREA_NEGOCIO_NAO_ENCONTRADA');
}

class ClientesService {
    async criar(organizacaoId: string | undefined, dados: CriarClienteInput) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        try {
            return await clientesRepository.executarEmTransacao(async (transaction) => {
                const areasValidas = await clientesRepository.listarAreasValidas(
                    organizacaoId,
                    dados.areas,
                    transaction,
                );

                if (areasValidas.length !== dados.areas.length) {
                    throw new AppError(
                        'Área de negócio não encontrada.',
                        404,
                        'AREA_NEGOCIO_NAO_ENCONTRADA',
                    );
                }

                if (dados.cpf) {
                    const clienteExistente = await clientesRepository.buscarPorCpf(
                        organizacaoId,
                        dados.cpf,
                        transaction,
                    );

                    if (clienteExistente) {
                        throw erroCpfJaCadastrado();
                    }
                }

                const cliente = await clientesRepository.criarCliente(
                    organizacaoId,
                    {
                        nome: dados.nome,
                        ...(dados.cpf !== undefined && {
                            cpf: dados.cpf,
                        }),
                        ...(dados.data_nascimento !== undefined && {
                            dataNascimento: dados.data_nascimento,
                        }),
                        ...(dados.telefone !== undefined && {
                            telefone: dados.telefone,
                        }),
                        ...(dados.email !== undefined && {
                            email: dados.email,
                        }),
                        ...(dados.sexo !== undefined && {
                            sexo: dados.sexo,
                        }),
                        ...(dados.cep !== undefined && {
                            cep: dados.cep,
                        }),
                        ...(dados.logradouro !== undefined && {
                            logradouro: dados.logradouro,
                        }),
                        ...(dados.numero !== undefined && {
                            numero: dados.numero,
                        }),
                        ...(dados.complemento !== undefined && {
                            complemento: dados.complemento,
                        }),
                        ...(dados.bairro !== undefined && {
                            bairro: dados.bairro,
                        }),
                        ...(dados.cidade !== undefined && {
                            cidade: dados.cidade,
                        }),
                        ...(dados.uf !== undefined && {
                            uf: dados.uf,
                        }),
                        ...(dados.observacao !== undefined && {
                            observacao: dados.observacao,
                        }),
                    },
                    transaction,
                );

                await clientesRepository.criarVinculosAreas(cliente.id, dados.areas, transaction);

                return {
                    ...cliente,
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

    async listar(organizacaoId: string | undefined, filtros: FiltrosClientesInput) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        if (filtros.areaNegocioId) {
            const area = await clientesRepository.buscarAreaAtivaPorId(
                organizacaoId,
                filtros.areaNegocioId,
            );

            if (!area) {
                throw new AppError(
                    'Área de negócio não encontrada.',
                    404,
                    'AREA_NEGOCIO_NAO_ENCONTRADA',
                );
            }
        }

        const buscaNumerica = filtros.busca?.replace(/\D/g, '');

        const clientes = await clientesRepository.listarPorOrganizacao(organizacaoId, {
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

        const areas = await clientesRepository.listarAreasDosClientes(
            clientes.map((cliente) => cliente.id),
        );

        const areasPorCliente = new Map<string, Array<{ id: string; nome: string }>>();

        for (const area of areas) {
            const areasCliente = areasPorCliente.get(area.clienteId) ?? [];

            areasCliente.push({
                id: area.id,
                nome: area.nome,
            });

            areasPorCliente.set(area.clienteId, areasCliente);
        }

        return clientes.map((cliente) => ({
            ...cliente,
            areas: areasPorCliente.get(cliente.id) ?? [],
        }));
    }

    async buscarPorId(organizacaoId: string | undefined, clienteId: string) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        const cliente = await clientesRepository.buscarPorId(organizacaoId, clienteId);

        if (!cliente) {
            throw new AppError('Cliente não encontrado.', 404, 'CLIENTE_NAO_ENCONTRADO');
        }

        const areas = await clientesRepository.listarAreasDosClientes([cliente.id]);

        return {
            ...cliente,
            areas: areas.map((area) => ({
                id: area.id,
                nome: area.nome,
            })),
        };
    }

    async atualizar(
        organizacaoId: string | undefined,
        clienteId: string,
        dados: AtualizarClienteInput,
    ) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        try {
            return await clientesRepository.executarEmTransacao(async (transaction) => {
                const clienteExistente = await clientesRepository.buscarPorId(
                    organizacaoId,
                    clienteId,
                    transaction,
                    true,
                );

                if (!clienteExistente) {
                    throw erroClienteNaoEncontrado();
                }

                const areasAnteriores =
                    dados.areas !== undefined
                        ? await clientesRepository.listarAreasDosClientes([clienteId], transaction)
                        : [];

                if (dados.areas !== undefined) {
                    const areasValidas = await clientesRepository.listarAreasValidas(
                        organizacaoId,
                        dados.areas,
                        transaction,
                    );

                    if (areasValidas.length !== dados.areas.length) {
                        throw erroAreaNaoEncontrada();
                    }
                }

                if (dados.cpf !== undefined && dados.cpf !== null) {
                    const clienteMesmoCpf = await clientesRepository.buscarPorCpf(
                        organizacaoId,
                        dados.cpf,
                        transaction,
                        clienteId,
                    );

                    if (clienteMesmoCpf) {
                        throw erroCpfJaCadastrado();
                    }
                }

                const atualizacao: DadosAtualizacaoCliente = {
                    ...(dados.nome !== undefined && { nome: dados.nome }),
                    ...(dados.cpf !== undefined && { cpf: dados.cpf }),
                    ...(dados.data_nascimento !== undefined && {
                        data_nascimento: dados.data_nascimento,
                    }),
                    ...(dados.telefone !== undefined && { telefone: dados.telefone }),
                    ...(dados.email !== undefined && { email: dados.email }),
                    ...(dados.sexo !== undefined && { sexo: dados.sexo }),
                    ...(dados.cep !== undefined && { cep: dados.cep }),
                    ...(dados.logradouro !== undefined && { logradouro: dados.logradouro }),
                    ...(dados.numero !== undefined && { numero: dados.numero }),
                    ...(dados.complemento !== undefined && { complemento: dados.complemento }),
                    ...(dados.bairro !== undefined && { bairro: dados.bairro }),
                    ...(dados.cidade !== undefined && { cidade: dados.cidade }),
                    ...(dados.uf !== undefined && { uf: dados.uf }),
                    ...(dados.observacao !== undefined && { observacao: dados.observacao }),
                };

                if (Object.keys(atualizacao).length > 0) {
                    await clientesRepository.atualizarCliente(
                        organizacaoId,
                        clienteId,
                        atualizacao,
                        transaction,
                    );
                }

                if (dados.areas !== undefined) {
                    await clientesRepository.sincronizarAreas(clienteId, dados.areas, transaction);
                }

                const clienteAtualizado = await clientesRepository.buscarPorId(
                    organizacaoId,
                    clienteId,
                    transaction,
                );

                if (!clienteAtualizado) {
                    throw erroClienteNaoEncontrado();
                }

                const areasAtuais = await clientesRepository.listarAreasDosClientes(
                    [clienteId],
                    transaction,
                );

                return {
                    cliente: {
                        ...clienteAtualizado,
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

    async inativar(organizacaoId: string | undefined, clienteId: string) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        return clientesRepository.executarEmTransacao(async (transaction) => {
            const cliente = await clientesRepository.buscarPorId(
                organizacaoId,
                clienteId,
                transaction,
                true,
            );

            if (!cliente) {
                throw erroClienteNaoEncontrado();
            }

            if (!cliente.ativo) {
                throw new AppError('Cliente já está inativo.', 409, 'CLIENTE_JA_INATIVO');
            }

            await clientesRepository.inativarCliente(organizacaoId, clienteId, transaction);

            return this.buscarEstadoFinalLifecycle(organizacaoId, clienteId, transaction);
        });
    }

    async reativar(organizacaoId: string | undefined, clienteId: string) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        return clientesRepository.executarEmTransacao(async (transaction) => {
            const cliente = await clientesRepository.buscarPorId(
                organizacaoId,
                clienteId,
                transaction,
                true,
            );

            if (!cliente) {
                throw erroClienteNaoEncontrado();
            }

            if (cliente.ativo) {
                throw new AppError('Cliente já está ativo.', 409, 'CLIENTE_JA_ATIVO');
            }

            await clientesRepository.reativarCliente(organizacaoId, clienteId, transaction);

            return this.buscarEstadoFinalLifecycle(organizacaoId, clienteId, transaction);
        });
    }

    private async buscarEstadoFinalLifecycle(
        organizacaoId: string,
        clienteId: string,
        transaction: Knex.Transaction,
    ) {
        const cliente = await clientesRepository.buscarPorId(organizacaoId, clienteId, transaction);

        if (!cliente) {
            throw erroClienteNaoEncontrado();
        }

        const areas = await clientesRepository.listarAreasDosClientes([clienteId], transaction);

        return {
            ...cliente,
            areas: areas.map((area) => ({
                id: area.id,
                nome: area.nome,
            })),
        };
    }
}

export default new ClientesService();
