import AppError from '../../shared/errors/AppError.js';

import servicosRepository from './servicos.repository.js';
import type { DadosAtualizacaoServico } from './servicos.repository.js';
import type {
    AtualizarServicoInput,
    CriarServicoInput,
    FiltrosServicosInput,
} from './servicos.validator.js';

function validarContexto(organizacaoId: string | undefined, areaNegocioId: string | undefined) {
    if (!organizacaoId) {
        throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
    }

    if (!areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    return { organizacaoId, areaNegocioId };
}

function erroServicoNaoEncontrado() {
    return new AppError('Serviço não encontrado.', 404, 'SERVICO_NAO_ENCONTRADO');
}

class ServicosService {
    async listar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        filtros: FiltrosServicosInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return servicosRepository.listar(contexto.organizacaoId, contexto.areaNegocioId, {
            ...(filtros.ativo !== undefined && { ativo: filtros.ativo }),
        });
    }

    async buscarPorId(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        servicoId: string,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        const servico = await servicosRepository.buscarPorId(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            servicoId,
        );

        if (!servico) {
            throw erroServicoNaoEncontrado();
        }

        return servico;
    }

    async criar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        dados: CriarServicoInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return servicosRepository.criar(contexto.organizacaoId, contexto.areaNegocioId, {
            nome: dados.nome,
            duracao_minutos: dados.duracao_minutos,
            ...(dados.descricao !== undefined && { descricao: dados.descricao }),
            ...(dados.valor !== undefined && { valor: dados.valor }),
        });
    }

    async atualizar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        servicoId: string,
        dados: AtualizarServicoInput,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return servicosRepository.executarEmTransacao(async (transaction) => {
            const servico = await servicosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                transaction,
                true,
            );

            if (!servico) {
                throw erroServicoNaoEncontrado();
            }

            const atualizacao: DadosAtualizacaoServico = {
                ...(dados.nome !== undefined && { nome: dados.nome }),
                ...(dados.descricao !== undefined && { descricao: dados.descricao }),
                ...(dados.duracao_minutos !== undefined && {
                    duracao_minutos: dados.duracao_minutos,
                }),
                ...(dados.valor !== undefined && { valor: dados.valor }),
            };

            await servicosRepository.atualizar(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                atualizacao,
                transaction,
            );

            const servicoAtualizado = await servicosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                transaction,
            );

            if (!servicoAtualizado) {
                throw erroServicoNaoEncontrado();
            }

            return {
                servico: servicoAtualizado,
                camposAlterados: Object.keys(atualizacao),
            };
        });
    }

    async inativar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        servicoId: string,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return servicosRepository.executarEmTransacao(async (transaction) => {
            const servico = await servicosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                transaction,
                true,
            );

            if (!servico) {
                throw erroServicoNaoEncontrado();
            }

            if (!servico.ativo) {
                throw new AppError('Serviço já está inativo.', 409, 'SERVICO_JA_INATIVO');
            }

            await servicosRepository.alterarAtivo(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                false,
                transaction,
            );

            return { ...servico, ativo: false };
        });
    }

    async reativar(
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        servicoId: string,
    ) {
        const contexto = validarContexto(organizacaoId, areaNegocioId);

        return servicosRepository.executarEmTransacao(async (transaction) => {
            const servico = await servicosRepository.buscarPorId(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                transaction,
                true,
            );

            if (!servico) {
                throw erroServicoNaoEncontrado();
            }

            if (servico.ativo) {
                throw new AppError('Serviço já está ativo.', 409, 'SERVICO_JA_ATIVO');
            }

            await servicosRepository.alterarAtivo(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                servicoId,
                true,
                transaction,
            );

            return { ...servico, ativo: true };
        });
    }
}

export default new ServicosService();
