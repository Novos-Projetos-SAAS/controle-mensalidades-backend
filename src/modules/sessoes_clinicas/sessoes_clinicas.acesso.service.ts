import AppError from '../../shared/errors/AppError.js';

import autorizacaoClinicaService from './autorizacao_clinica.service.js';
import sessoesClinicasService from './sessoes_clinicas.service.js';

import type {
    AtualizarSessaoClinicaInput,
    CriarSessaoClinicaInput,
    FiltrosSessoesClinicasInput,
} from './sessoes_clinicas.validator.js';

type ContextoClinico = {
    usuarioId: string | undefined;
    organizacaoId: string | undefined;
    areaNegocioId: string | undefined;
};

class SessoesClinicasAcessoService {
    // CRIAR SESSÃO CLÍNICA
    async criar(contexto: ContextoClinico, dados: CriarSessaoClinicaInput) {
        const identidade = await autorizacaoClinicaService.identificarProfissional(
            contexto.usuarioId,
            contexto.organizacaoId,
            contexto.areaNegocioId,
        );

        if (dados.profissional_id !== identidade.profissionalId) {
            throw new AppError(
                'Não é permitido registrar uma sessão para outro profissional.',
                403,
                'PROFISSIONAL_CLINICO_NAO_AUTORIZADO',
            );
        }

        return sessoesClinicasService.criar(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            dados,
            contexto.usuarioId,
        );
    }

    // LISTAR SESSÕES CLÍNICAS
    async listar(contexto: ContextoClinico, filtros: FiltrosSessoesClinicasInput) {
        const identidade = await autorizacaoClinicaService.identificarProfissional(
            contexto.usuarioId,
            contexto.organizacaoId,
            contexto.areaNegocioId,
        );

        return sessoesClinicasService.listarAutorizadas(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            contexto.usuarioId,
            {
                ...filtros,
                profissionalId: identidade.profissionalId,
            },
        );
    }

    // CONSULTAR SESSÃO CLÍNICA
    async buscarPorId(contexto: ContextoClinico, sessaoClinicaId: string) {
        await autorizacaoClinicaService.exigirTitularidadeSessao(
            contexto.usuarioId,
            contexto.organizacaoId,
            contexto.areaNegocioId,
            sessaoClinicaId,
        );

        return sessoesClinicasService.buscarPorIdAutorizada(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            contexto.usuarioId,
            sessaoClinicaId,
        );
    }

    // CONSULTAR HISTÓRICO DE CORREÇÕES
    async listarHistoricoCorrecoes(contexto: ContextoClinico, sessaoClinicaId: string) {
        return sessoesClinicasService.listarHistoricoCorrecoes(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            contexto.usuarioId,
            sessaoClinicaId,
        );
    }

    // CORRIGIR SESSÃO CLÍNICA
    async corrigir(
        contexto: ContextoClinico,
        sessaoClinicaId: string,
        dados: AtualizarSessaoClinicaInput,
    ) {
        // Primeira barreira:
        // verifica autorização e titularidade.
        await autorizacaoClinicaService.exigirTitularidadeSessao(
            contexto.usuarioId,
            contexto.organizacaoId,
            contexto.areaNegocioId,
            sessaoClinicaId,
        );

        // Segunda barreira:
        // o Service verifica novamente a autorização
        // e a titularidade dentro da transação.
        return sessoesClinicasService.corrigir(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            contexto.usuarioId,
            sessaoClinicaId,
            dados,
        );
    }
}

export default new SessoesClinicasAcessoService();
