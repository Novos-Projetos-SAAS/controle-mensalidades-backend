import type { Knex } from 'knex';

import connection from '../../database/connection.js';

type ExecutorBanco = Knex | Knex.Transaction;

type DadosNovoCliente = {
    nome: string;
    cpf?: string;
    dataNascimento?: string;
    telefone?: string;
    email?: string;
    sexo?: string;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    observacao?: string;
};

export type DadosAtualizacaoCliente = {
    nome?: string;
    cpf?: string | null;
    data_nascimento?: string | null;
    telefone?: string | null;
    email?: string | null;
    sexo?: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    observacao?: string | null;
};

type FiltrosListagemClientes = {
    busca?: string;
    buscaNumerica?: string;
    ativo?: boolean;
    areaNegocioId?: string;
};

type AreaCliente = {
    id: string;
    nome: string;
};

type AreaClienteComVinculo = AreaCliente & {
    clienteId: string;
};

type ClienteCriado = {
    id: string;
    nome: string;
    cpf: string | null;
    data_nascimento: string | null;
    telefone: string | null;
    email: string | null;
    sexo: string | null;
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    observacao: string | null;
    aceite_whatsapp: boolean;
    ativo: boolean;
};

type ClienteResumo = {
    id: string;
    nome: string;
    cpf: string | null;
    telefone: string | null;
    email: string | null;
    ativo: boolean;
};

export type ClienteDetalhe = ClienteCriado & {
    aceite_whatsapp_em: Date | null;
    origem_aceite_whatsapp: string | null;
    inativado_em: Date | null;
};

class ClientesRepository {
    async executarEmTransacao<T>(operacao: (transaction: Knex.Transaction) => Promise<T>) {
        return connection.transaction(operacao);
    }

    async buscarPorCpf(
        organizacaoId: string,
        cpf: string,
        transaction: Knex.Transaction,
        clienteIdExcluir?: string,
    ) {
        const consulta = transaction('clientes')
            .select('id')
            .where({
                organizacao_id: organizacaoId,
                cpf,
            })
            .whereNull('deletado_em');

        if (clienteIdExcluir) {
            consulta.whereNot('id', clienteIdExcluir);
        }

        return consulta.first();
    }

    async listarAreasValidas(
        organizacaoId: string,
        areasIds: string[],
        transaction: Knex.Transaction,
    ): Promise<AreaCliente[]> {
        const areas = await transaction('areas_negocio')
            .select('id', 'nome')
            .where('organizacao_id', organizacaoId)
            .whereIn('id', areasIds)
            .andWhere('ativo', true)
            .whereNull('deletado_em');

        return areas as AreaCliente[];
    }

    async buscarAreaAtivaPorId(
        organizacaoId: string,
        areaNegocioId: string,
    ): Promise<AreaCliente | undefined> {
        const area = await connection('areas_negocio')
            .select('id', 'nome')
            .where({
                id: areaNegocioId,
                organizacao_id: organizacaoId,
                ativo: true,
            })
            .whereNull('deletado_em')
            .first();

        return area as AreaCliente | undefined;
    }

    async criarCliente(
        organizacaoId: string,
        dados: DadosNovoCliente,
        transaction: Knex.Transaction,
    ): Promise<ClienteCriado> {
        const [cliente] = await transaction('clientes')
            .insert({
                organizacao_id: organizacaoId,
                nome: dados.nome,
                cpf: dados.cpf ?? null,
                data_nascimento: dados.dataNascimento ?? null,
                telefone: dados.telefone ?? null,
                email: dados.email ?? null,
                sexo: dados.sexo ?? null,
                cep: dados.cep ?? null,
                logradouro: dados.logradouro ?? null,
                numero: dados.numero ?? null,
                complemento: dados.complemento ?? null,
                bairro: dados.bairro ?? null,
                cidade: dados.cidade ?? null,
                uf: dados.uf ?? null,
                observacao: dados.observacao ?? null,
                ativo: true,
            })
            .returning([
                'id',
                'nome',
                'cpf',
                'data_nascimento',
                'telefone',
                'email',
                'sexo',
                'cep',
                'logradouro',
                'numero',
                'complemento',
                'bairro',
                'cidade',
                'uf',
                'observacao',
                'aceite_whatsapp',
                'ativo',
            ]);

        return cliente as ClienteCriado;
    }

    async criarVinculosAreas(clienteId: string, areasIds: string[], transaction: Knex.Transaction) {
        await transaction('clientes_areas').insert(
            areasIds.map((areaNegocioId) => ({
                cliente_id: clienteId,
                area_negocio_id: areaNegocioId,
                ativo: true,
            })),
        );
    }

    async listarPorOrganizacao(
        organizacaoId: string,
        filtros: FiltrosListagemClientes,
    ): Promise<ClienteResumo[]> {
        const consulta = connection('clientes as c')
            .select('c.id', 'c.nome', 'c.cpf', 'c.telefone', 'c.email', 'c.ativo')
            .where('c.organizacao_id', organizacaoId)
            .whereNull('c.deletado_em');

        if (filtros.ativo !== undefined) {
            consulta.andWhere('c.ativo', filtros.ativo);
        }

        if (filtros.areaNegocioId) {
            consulta.whereExists(function () {
                this.select(connection.raw('1'))
                    .from('clientes_areas as ca')
                    .whereRaw('ca.cliente_id = c.id')
                    .andWhere('ca.area_negocio_id', filtros.areaNegocioId!)
                    .andWhere('ca.ativo', true)
                    .whereNull('ca.deletado_em');
            });
        }

        if (filtros.busca) {
            consulta.andWhere((builder) => {
                builder
                    .whereILike('c.nome', `%${filtros.busca}%`)
                    .orWhereILike('c.email', `%${filtros.busca}%`);

                if (filtros.buscaNumerica) {
                    builder
                        .orWhere('c.cpf', 'like', `%${filtros.buscaNumerica}%`)
                        .orWhere('c.telefone', 'like', `%${filtros.buscaNumerica}%`);
                }
            });
        }

        const clientes = await consulta.orderBy('c.nome', 'asc').orderBy('c.id', 'asc');

        return clientes as ClienteResumo[];
    }

    async buscarPorId(
        organizacaoId: string,
        clienteId: string,
        executor: ExecutorBanco = connection,
        bloquear = false,
    ): Promise<ClienteDetalhe | undefined> {
        const consulta = executor('clientes as c')
            .select(
                'c.id',
                'c.nome',
                'c.cpf',
                'c.data_nascimento',
                'c.telefone',
                'c.email',
                'c.sexo',
                'c.cep',
                'c.logradouro',
                'c.numero',
                'c.complemento',
                'c.bairro',
                'c.cidade',
                'c.uf',
                'c.observacao',
                'c.aceite_whatsapp',
                'c.aceite_whatsapp_em',
                'c.origem_aceite_whatsapp',
                'c.ativo',
                'c.inativado_em',
            )
            .where({
                'c.id': clienteId,
                'c.organizacao_id': organizacaoId,
            })
            .whereNull('c.deletado_em');

        if (bloquear) {
            consulta.forUpdate('c');
        }

        const cliente = await consulta.first();

        return cliente as ClienteDetalhe | undefined;
    }

    async listarAreasDosClientes(
        clientesIds: string[],
        executor: ExecutorBanco = connection,
    ): Promise<AreaClienteComVinculo[]> {
        if (clientesIds.length === 0) {
            return [];
        }

        const areas = await executor('clientes_areas as ca')
            .innerJoin('areas_negocio as a', 'a.id', 'ca.area_negocio_id')
            .select('ca.cliente_id as clienteId', 'a.id', 'a.nome')
            .whereIn('ca.cliente_id', clientesIds)
            .andWhere('ca.ativo', true)
            .andWhere('a.ativo', true)
            .whereNull('ca.deletado_em')
            .whereNull('a.deletado_em')
            .orderBy('a.nome', 'asc');

        return areas as AreaClienteComVinculo[];
    }

    async atualizarCliente(
        organizacaoId: string,
        clienteId: string,
        dados: DadosAtualizacaoCliente,
        transaction: Knex.Transaction,
    ) {
        await transaction('clientes')
            .where({
                id: clienteId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update(dados);
    }

    async inativarCliente(organizacaoId: string, clienteId: string, transaction: Knex.Transaction) {
        await transaction('clientes')
            .where({
                id: clienteId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update({
                ativo: false,
                inativado_em: transaction.fn.now(),
            });
    }

    async reativarCliente(organizacaoId: string, clienteId: string, transaction: Knex.Transaction) {
        await transaction('clientes')
            .where({
                id: clienteId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update({
                ativo: true,
                inativado_em: null,
            });
    }

    async sincronizarAreas(clienteId: string, areasIds: string[], transaction: Knex.Transaction) {
        const vinculosExistentes = await transaction('clientes_areas')
            .select('area_negocio_id')
            .where('cliente_id', clienteId);
        const areasExistentes = new Set<string>(
            vinculosExistentes.map((vinculo) => vinculo.area_negocio_id),
        );

        await transaction('clientes_areas')
            .where('cliente_id', clienteId)
            .whereNull('deletado_em')
            .whereNotIn('area_negocio_id', areasIds)
            .update({ ativo: false });

        await transaction('clientes_areas')
            .where('cliente_id', clienteId)
            .whereIn('area_negocio_id', areasIds)
            .update({
                ativo: true,
                deletado_em: null,
            });

        const novasAreasIds = areasIds.filter((areaId) => !areasExistentes.has(areaId));

        if (novasAreasIds.length > 0) {
            await transaction('clientes_areas').insert(
                novasAreasIds.map((areaNegocioId) => ({
                    cliente_id: clienteId,
                    area_negocio_id: areaNegocioId,
                    ativo: true,
                })),
            );
        }
    }
}

export default new ClientesRepository();
