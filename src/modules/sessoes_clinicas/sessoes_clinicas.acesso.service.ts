import AppError from '../../shared/errors/AppError.js';

import autorizacaoClinicaService from './autorizacao_clinica.service.js';
import sessoesClinicasLeiturasTransacionaisService from './sessoes_clinicas.leituras_transacionais.service.js';
import sessoesClinicasService from './sessoes_clinicas.service.js';

import type { MetadadosAuditoriaClinica } from './sessoes_clinicas.auditoria_transacional.js';

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
    async criar(
        contexto: ContextoClinico,
        dados: CriarSessaoClinicaInput,
        metadados?: MetadadosAuditoriaClinica,
    ) {
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
            metadados,
        );
    }

    async listar(
        contexto: ContextoClinico,
        filtros: FiltrosSessoesClinicasInput,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        return sessoesClinicasLeiturasTransacionaisService.listar(contexto, filtros, metadados);
    }

    async buscarPorId(
        contexto: ContextoClinico,
        sessaoClinicaId: string,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        return sessoesClinicasLeiturasTransacionaisService.buscarPorId(
            contexto,
            sessaoClinicaId,
            metadados,
        );
    }

    async listarHistoricoCorrecoes(
        contexto: ContextoClinico,
        sessaoClinicaId: string,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        return sessoesClinicasLeiturasTransacionaisService.listarHistoricoCorrecoes(
            contexto,
            sessaoClinicaId,
            metadados,
        );
    }

    async corrigir(
        contexto: ContextoClinico,
        sessaoClinicaId: string,
        dados: AtualizarSessaoClinicaInput,
        metadados?: MetadadosAuditoriaClinica,
    ) {
        // Primeira validação: autorização e titularidade.
        await autorizacaoClinicaService.exigirTitularidadeSessao(
            contexto.usuarioId,
            contexto.organizacaoId,
            contexto.areaNegocioId,
            sessaoClinicaId,
        );

        // O Service confirma novamente a autorização
        // dentro da transação de escrita.
        return sessoesClinicasService.corrigir(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            contexto.usuarioId,
            sessaoClinicaId,
            dados,
            metadados,
        );
    }
}

export default new SessoesClinicasAcessoService();
