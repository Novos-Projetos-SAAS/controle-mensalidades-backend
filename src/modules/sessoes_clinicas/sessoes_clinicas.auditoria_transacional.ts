import type { Knex } from 'knex';

import AppError from '../../shared/errors/AppError.js';

export type MetadadosAuditoriaClinica = {
    requestId?: string;
    ip?: string;
    userAgent?: string;
};

type RegistroAuditoriaClinica = {
    organizacaoId: string;
    areaNegocioId: string;
    usuarioId?: string;
    sessaoClinicaId?: string;
    acao:
        | 'SESSAO_CLINICA.CRIADA'
        | 'SESSAO_CLINICA.CORRIGIDA'
        | 'SESSAO_CLINICA.LISTADA'
        | 'SESSAO_CLINICA.CONSULTADA'
        | 'SESSAO_CLINICA.HISTORICO_CONSULTADO';
    camposAlterados?: string[];
    metadados?: MetadadosAuditoriaClinica;
};

class AuditoriaClinicaTransacional {
    async registrar(transaction: Knex.Transaction, dados: RegistroAuditoriaClinica): Promise<void> {
        try {
            await transaction('registros_auditoria').insert({
                organizacao_id: dados.organizacaoId,
                area_negocio_id: dados.areaNegocioId,
                usuario_id: dados.usuarioId ?? null,
                acao: dados.acao,
                recurso: 'SESSAO_CLINICA',
                recurso_id: dados.sessaoClinicaId ?? null,
                dados_contexto: {
                    areaNegocioId: dados.areaNegocioId,
                    ...(dados.metadados?.requestId && {
                        requestId: dados.metadados.requestId,
                    }),
                    ...(dados.camposAlterados && {
                        camposAlterados: dados.camposAlterados,
                    }),
                },
                ip: dados.metadados?.ip?.slice(0, 64) ?? null,
                user_agent: dados.metadados?.userAgent?.slice(0, 500) ?? null,
            });
        } catch {
            // Não incluir dados clínicos nem mensagens SQL
            // potencialmente sensíveis no erro HTTP.
            throw new AppError(
                'Auditoria clínica temporariamente indisponível.',
                503,
                'AUDITORIA_CLINICA_INDISPONIVEL',
            );
        }
    }
}

export default new AuditoriaClinicaTransacional();
