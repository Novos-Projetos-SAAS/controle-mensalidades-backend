import type { Knex } from 'knex';

import {
    camposCpfPersistencia,
    exporCpfRegistro,
    indiceCpf,
    modoProtecaoCpf,
    novoIdComCpf,
    protecaoCpfAtiva,
} from '../../utils/cpf.crypto.js';

import connection from '../../database/connection.js';

type ExecutorBanco = Knex | Knex.Transaction;

type DadosNovoProfissional = {
    nome: string;
    cpf?: string;
    email?: string;
    telefone?: string;
    conselho?: string;
    numero_conselho?: string;
    uf_conselho?: string;
};

export type DadosAtualizacaoProfissional = {
    nome?: string;
    cpf?: string | null;
    email?: string | null;
    telefone?: string | null;
    conselho?: string | null;
    numero_conselho?: string | null;
    uf_conselho?: string | null;
};

type FiltrosListagemProfissionais = {
    busca?: string;
    buscaNumerica?: string;
    ativo?: boolean;
    areaNegocioId?: string;
};

type AreaProfissional = {
    id: string;
    nome: string;
};

type AreaProfissionalComVinculo = AreaProfissional & {
    profissionalId: string;
};

export type Profissional = {
    id: string;
    nome: string;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    conselho: string | null;
    numero_conselho: string | null;
    uf_conselho: string | null;
    ativo: boolean;
};

export type ProfissionalDetalhe = Profissional & {
    inativado_em: Date | null;
};

const camposPublicos = [
    'id',
    'nome',
    'cpf',
    'email',
    'telefone',
    'conselho',
    'numero_conselho',
    'uf_conselho',
    'ativo',
] as const;

class ProfissionaisRepository {
    async executarEmTransacao<T>(operacao: (transaction: Knex.Transaction) => Promise<T>) {
        return connection.transaction(operacao);
    }

    async buscarPorCpf(
        organizacaoId: string,
        cpf: string,
        transaction: Knex.Transaction,
        profissionalIdExcluir?: string,
    ) {
        const consulta = transaction('profissionais')
            .select('id')
            .where('organizacao_id', organizacaoId)
            .whereNull('deletado_em')
            .andWhere((builder) => {
                if (protecaoCpfAtiva()) {
                    builder.where('cpf_indice', indiceCpf('profissional', organizacaoId, cpf));
                    if (modoProtecaoCpf() === 'transition') {
                        builder.orWhere('cpf', cpf);
                    }
                } else {
                    builder.where('cpf', cpf);
                }
            });

        if (profissionalIdExcluir) {
            consulta.whereNot('id', profissionalIdExcluir);
        }

        return consulta.first();
    }

    async listarAreasValidas(
        organizacaoId: string,
        areasIds: string[],
        transaction: Knex.Transaction,
    ): Promise<AreaProfissional[]> {
        const areas = await transaction('areas_negocio')
            .select('id', 'nome')
            .where('organizacao_id', organizacaoId)
            .whereIn('id', areasIds)
            .andWhere('ativo', true)
            .whereNull('deletado_em');

        return areas as AreaProfissional[];
    }

    async buscarAreaAtivaPorId(
        organizacaoId: string,
        areaNegocioId: string,
    ): Promise<AreaProfissional | undefined> {
        const area = await connection('areas_negocio')
            .select('id', 'nome')
            .where({
                id: areaNegocioId,
                organizacao_id: organizacaoId,
                ativo: true,
            })
            .whereNull('deletado_em')
            .first();

        return area as AreaProfissional | undefined;
    }

    async criarProfissional(
        organizacaoId: string,
        dados: DadosNovoProfissional,
        transaction: Knex.Transaction,
    ): Promise<Profissional> {
        const id = novoIdComCpf();
        const camposCpf = protecaoCpfAtiva()
            ? camposCpfPersistencia('profissional', organizacaoId, id, dados.cpf ?? null)
            : { cpf: dados.cpf ?? null };

        const [profissional] = await transaction('profissionais')
            .insert({
                id,
                organizacao_id: organizacaoId,
                usuario_id: null,
                nome: dados.nome,
                ...camposCpf,
                email: dados.email ?? null,
                telefone: dados.telefone ?? null,
                conselho: dados.conselho ?? null,
                numero_conselho: dados.numero_conselho ?? null,
                uf_conselho: dados.uf_conselho ?? null,
                ativo: true,
            })
            .returning([
                ...camposPublicos,
                ...(protecaoCpfAtiva() ? ['cpf_cifrado', 'cpf_indice'] : []),
            ]);

        return exporCpfRegistro('profissional', organizacaoId, profissional) as Profissional;
    }

    async criarVinculosAreas(
        profissionalId: string,
        areasIds: string[],
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('profissionais_areas').insert(
            areasIds.map((areaNegocioId) => ({
                profissional_id: profissionalId,
                area_negocio_id: areaNegocioId,
                ativo: true,
            })),
        );
    }

    async listarPorOrganizacao(
        organizacaoId: string,
        filtros: FiltrosListagemProfissionais,
    ): Promise<Profissional[]> {
        const consulta = connection('profissionais as p')
            .select(
                'p.id',
                'p.nome',
                'p.cpf',
                ...(protecaoCpfAtiva() ? ['p.cpf_cifrado', 'p.cpf_indice'] : []),
                'p.email',
                'p.telefone',
                'p.conselho',
                'p.numero_conselho',
                'p.uf_conselho',
                'p.ativo',
            )
            .where('p.organizacao_id', organizacaoId)
            .whereNull('p.deletado_em');

        if (filtros.ativo !== undefined) {
            consulta.andWhere('p.ativo', filtros.ativo);
        }

        if (filtros.areaNegocioId) {
            consulta.whereExists(function () {
                this.select(connection.raw('1'))
                    .from('profissionais_areas as pa')
                    .innerJoin('areas_negocio as a', 'a.id', 'pa.area_negocio_id')
                    .whereRaw('pa.profissional_id = p.id')
                    .andWhere('pa.area_negocio_id', filtros.areaNegocioId!)
                    .andWhere('pa.ativo', true)
                    .whereNull('pa.deletado_em')
                    .andWhere('a.organizacao_id', organizacaoId)
                    .andWhere('a.ativo', true)
                    .whereNull('a.deletado_em');
            });
        }

        if (filtros.busca) {
            consulta.andWhere((builder) => {
                builder
                    .whereILike('p.nome', `%${filtros.busca}%`)
                    .orWhereILike('p.email', `%${filtros.busca}%`)
                    .orWhereILike('p.conselho', `%${filtros.busca}%`)
                    .orWhereILike('p.numero_conselho', `%${filtros.busca}%`);

                if (filtros.buscaNumerica) {
                    builder.orWhere('p.telefone', 'like', `%${filtros.buscaNumerica}%`);
                    if (protecaoCpfAtiva()) {
                        if (filtros.buscaNumerica.length === 11) {
                            builder.orWhere(
                                'p.cpf_indice',
                                indiceCpf('profissional', organizacaoId, filtros.buscaNumerica),
                            );
                            if (modoProtecaoCpf() === 'transition') {
                                builder.orWhere('p.cpf', filtros.buscaNumerica);
                            }
                        }
                    } else {
                        builder.orWhere('p.cpf', 'like', `%${filtros.buscaNumerica}%`);
                    }
                }
            });
        }

        const profissionais = await consulta.orderBy('p.nome', 'asc').orderBy('p.id', 'asc');

        return profissionais.map((profissional) =>
            exporCpfRegistro('profissional', organizacaoId, profissional),
        ) as Profissional[];
    }

    async buscarPorId(
        organizacaoId: string,
        profissionalId: string,
        executor: ExecutorBanco = connection,
        bloquear = false,
    ): Promise<ProfissionalDetalhe | undefined> {
        const consulta = executor('profissionais as p')
            .select(
                'p.id',
                'p.nome',
                'p.cpf',
                ...(protecaoCpfAtiva() ? ['p.cpf_cifrado', 'p.cpf_indice'] : []),
                'p.email',
                'p.telefone',
                'p.conselho',
                'p.numero_conselho',
                'p.uf_conselho',
                'p.ativo',
                'p.inativado_em',
            )
            .where({
                'p.id': profissionalId,
                'p.organizacao_id': organizacaoId,
            })
            .whereNull('p.deletado_em');

        if (bloquear) {
            consulta.forUpdate('p');
        }

        const profissional = await consulta.first();

        return profissional
            ? (exporCpfRegistro('profissional', organizacaoId, profissional) as ProfissionalDetalhe)
            : undefined;
    }

    async listarAreasDosProfissionais(
        organizacaoId: string,
        profissionaisIds: string[],
        executor: ExecutorBanco = connection,
    ): Promise<AreaProfissionalComVinculo[]> {
        if (profissionaisIds.length === 0) {
            return [];
        }

        const areas = await executor('profissionais_areas as pa')
            .innerJoin('profissionais as p', 'p.id', 'pa.profissional_id')
            .innerJoin('areas_negocio as a', 'a.id', 'pa.area_negocio_id')
            .select('pa.profissional_id as profissionalId', 'a.id', 'a.nome')
            .whereIn('pa.profissional_id', profissionaisIds)
            .andWhere('p.organizacao_id', organizacaoId)
            .andWhere('a.organizacao_id', organizacaoId)
            .andWhere('pa.ativo', true)
            .andWhere('a.ativo', true)
            .whereNull('pa.deletado_em')
            .whereNull('p.deletado_em')
            .whereNull('a.deletado_em')
            .orderBy('a.nome', 'asc')
            .orderBy('a.id', 'asc');

        return areas as AreaProfissionalComVinculo[];
    }

    async atualizarProfissional(
        organizacaoId: string,
        profissionalId: string,
        dados: DadosAtualizacaoProfissional,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('profissionais')
            .where({
                id: profissionalId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update(
                dados.cpf !== undefined && protecaoCpfAtiva()
                    ? {
                          ...dados,
                          ...camposCpfPersistencia(
                              'profissional',
                              organizacaoId,
                              profissionalId,
                              dados.cpf,
                          ),
                      }
                    : dados,
            );
    }

    async inativarProfissional(
        organizacaoId: string,
        profissionalId: string,
        transaction: Knex.Transaction,
    ): Promise<void> {
        const alterados = await transaction('profissionais')
            .where({
                id: profissionalId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update({
                ativo: false,
                inativado_em: transaction.fn.now(),
            });

        // Inativar um profissional revoga suas permissões clínicas.
        // Uma futura reativação não restaura esses acessos.
        if (alterados > 0) {
            await transaction('profissionais_areas')
                .where('profissional_id', profissionalId)
                .update({
                    acesso_clinico_autorizado: false,
                });
        }
    }

    async reativarProfissional(
        organizacaoId: string,
        profissionalId: string,
        transaction: Knex.Transaction,
    ): Promise<void> {
        await transaction('profissionais')
            .where({
                id: profissionalId,
                organizacao_id: organizacaoId,
            })
            .whereNull('deletado_em')
            .update({
                ativo: true,
                inativado_em: null,
            });
    }

    async sincronizarAreas(
        organizacaoId: string,
        profissionalId: string,
        areasIds: string[],
        transaction: Knex.Transaction,
    ): Promise<void> {
        const vinculosExistentes = await transaction('profissionais_areas as pa')
            .innerJoin('profissionais as p', 'p.id', 'pa.profissional_id')
            .select('pa.area_negocio_id')
            .where('pa.profissional_id', profissionalId)
            .andWhere('p.organizacao_id', organizacaoId)
            .whereNull('p.deletado_em');

        const areasExistentes = new Set<string>(
            vinculosExistentes.map((vinculo) => vinculo.area_negocio_id),
        );

        // 1. Remover área também revoga autorização clínica.
        await transaction('profissionais_areas')
            .where('profissional_id', profissionalId)
            .whereNull('deletado_em')
            .whereNotIn('area_negocio_id', areasIds)
            .update({
                ativo: false,
                acesso_clinico_autorizado: false,
            });

        // 2. Reativar área não recupera permissões antigas.
        // Áreas continuamente ativas preservam sua autorização.
        await transaction('profissionais_areas')
            .where('profissional_id', profissionalId)
            .whereIn('area_negocio_id', areasIds)
            .update({
                ativo: true,
                deletado_em: null,
                acesso_clinico_autorizado: transaction.raw(`
                CASE
                    WHEN ativo = TRUE AND deletado_em IS NULL
                        THEN acesso_clinico_autorizado
                    ELSE FALSE
                END
            `),
            });

        // 3. Vínculos novos começam sem autorização clínica,
        // conforme o padrão definido na migration 059.
        const novasAreasIds = areasIds.filter((areaId) => !areasExistentes.has(areaId));

        if (novasAreasIds.length > 0) {
            await transaction('profissionais_areas').insert(
                novasAreasIds.map((areaNegocioId) => ({
                    profissional_id: profissionalId,
                    area_negocio_id: areaNegocioId,
                    ativo: true,
                })),
            );
        }
    }
}

export default new ProfissionaisRepository();
