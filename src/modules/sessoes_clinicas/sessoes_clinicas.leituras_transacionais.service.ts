import type { Knex } from 'knex';

import { aplicarTimeoutsTransacaoClinica } from '../../database/clinical-transaction-timeouts.js';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

import autorizacaoClinicaService from './autorizacao_clinica.service.js';
import auditoriaClinicaTransacional from './sessoes_clinicas.auditoria_transacional.js';
import sessoesClinicasRepository from './sessoes_clinicas.repository.js';

import type { MetadadosAuditoriaClinica } from './sessoes_clinicas.auditoria_transacional.js';
import type { FiltrosSessoesClinicasInput } from './sessoes_clinicas.validator.js';

type ContextoLeituraClinica = {
    usuarioId: string | undefined;
    organizacaoId: string | undefined;
    areaNegocioId: string | undefined;
};

function validarContexto(contexto: ContextoLeituraClinica) {
    if (!contexto.usuarioId) {
        throw new AppError('Autenticação necessária.', 401, 'AUTENTICACAO_NECESSARIA');
    }

    if (!contexto.organizacaoId) {
        throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
    }

    if (!contexto.areaNegocioId) {
        throw new AppError('Área de negócio não informada.', 400, 'AREA_NEGOCIO_NAO_INFORMADA');
    }

    return {
        usuarioId: contexto.usuarioId,
        organizacaoId: contexto.organizacaoId,
        areaNegocioId: contexto.areaNegocioId,
    };
}

function erroSessaoNaoEncontrada() {
    return new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
}

async function bloquearAreaAntesDaIdentidade(
    transaction: Knex.Transaction,
    organizacaoId: string,
    areaNegocioId: string,
) {
    // A revogação administrativa bloqueia área, profissional e vínculo,
    // nesta ordem. A leitura adota a mesma ordem para evitar deadlocks.
    await transaction('areas_negocio')
        .select('id')
        .where({
            id: areaNegocioId,
            organizacao_id: organizacaoId,
            ativo: true,
        })
        .whereNull('deletado_em')
        .forShare()
        .first();
}

class SessoesClinicasLeiturasTransacionaisService {
    async listar(
        contextoEntrada: ContextoLeituraClinica,
        filtros: FiltrosSessoesClinicasInput,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        const contexto = validarContexto(contextoEntrada);

        return connection.transaction(async (transaction) => {
            await aplicarTimeoutsTransacaoClinica(transaction);
            await bloquearAreaAntesDaIdentidade(
                transaction,
                contexto.organizacaoId,
                contexto.areaNegocioId,
            );

            const identidade = await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                transaction,
                true,
            );

            const sessoes = await sessoesClinicasRepository.listarAutorizadas(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                contexto.usuarioId,
                {
                    inicio: new Date(filtros.inicio),
                    fim: new Date(filtros.fim),
                    ...(filtros.clienteId !== undefined && {
                        clienteId: filtros.clienteId,
                    }),
                    // A identidade autenticada sempre prevalece sobre o filtro recebido.
                    profissionalId: identidade.profissionalId,
                },
                transaction,
            );

            await auditoriaClinicaTransacional.registrar(transaction, {
                organizacaoId: contexto.organizacaoId,
                areaNegocioId: contexto.areaNegocioId,
                usuarioId: contexto.usuarioId,
                acao: 'SESSAO_CLINICA.LISTADA',
                ...(metadados !== undefined && { metadados }),
            });

            return sessoes;
        });
    }

    async buscarPorId(
        contextoEntrada: ContextoLeituraClinica,
        sessaoClinicaId: string,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        const contexto = validarContexto(contextoEntrada);

        return connection.transaction(async (transaction) => {
            await aplicarTimeoutsTransacaoClinica(transaction);
            await bloquearAreaAntesDaIdentidade(
                transaction,
                contexto.organizacaoId,
                contexto.areaNegocioId,
            );

            await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                transaction,
                true,
            );

            const sessao = await sessoesClinicasRepository.buscarPorIdAutorizada(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                contexto.usuarioId,
                sessaoClinicaId,
                transaction,
            );

            if (!sessao) {
                throw erroSessaoNaoEncontrada();
            }

            await auditoriaClinicaTransacional.registrar(transaction, {
                organizacaoId: contexto.organizacaoId,
                areaNegocioId: contexto.areaNegocioId,
                usuarioId: contexto.usuarioId,
                sessaoClinicaId,
                acao: 'SESSAO_CLINICA.CONSULTADA',
                ...(metadados !== undefined && { metadados }),
            });

            return sessao;
        });
    }

    async listarHistoricoCorrecoes(
        contextoEntrada: ContextoLeituraClinica,
        sessaoClinicaId: string,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        const contexto = validarContexto(contextoEntrada);

        return connection.transaction(async (transaction) => {
            await aplicarTimeoutsTransacaoClinica(transaction);
            await bloquearAreaAntesDaIdentidade(
                transaction,
                contexto.organizacaoId,
                contexto.areaNegocioId,
            );

            await autorizacaoClinicaService.identificarProfissional(
                contexto.usuarioId,
                contexto.organizacaoId,
                contexto.areaNegocioId,
                transaction,
                true,
            );

            // O SQL do histórico vazio também precisa distinguir uma sessão
            // inexistente ou alheia de uma sessão sem correções.
            const sessao = await sessoesClinicasRepository.buscarPorIdAutorizada(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                contexto.usuarioId,
                sessaoClinicaId,
                transaction,
            );

            if (!sessao) {
                throw erroSessaoNaoEncontrada();
            }

            const historico = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
                contexto.organizacaoId,
                contexto.areaNegocioId,
                contexto.usuarioId,
                sessaoClinicaId,
                transaction,
            );

            await auditoriaClinicaTransacional.registrar(transaction, {
                organizacaoId: contexto.organizacaoId,
                areaNegocioId: contexto.areaNegocioId,
                usuarioId: contexto.usuarioId,
                sessaoClinicaId,
                acao: 'SESSAO_CLINICA.HISTORICO_CONSULTADO',
                ...(metadados !== undefined && { metadados }),
            });

            return historico;
        });
    }
}

export default new SessoesClinicasLeiturasTransacionaisService();
