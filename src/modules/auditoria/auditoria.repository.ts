import connection from '../../database/connection.js';

type RegistroAuditoriaInput = {
    organizacaoId?: string;
    usuarioId?: string;
    areaNegocioId?: string;
    acao: string;
    recurso: string;
    recursoId?: string;
    dadosContexto?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
};

class AuditoriaRepository {
    async registrar(dados: RegistroAuditoriaInput) {
        await connection('registros_auditoria').insert({
            organizacao_id: dados.organizacaoId ?? null,

            usuario_id: dados.usuarioId ?? null,

            area_negocio_id: dados.areaNegocioId ?? null,

            acao: dados.acao,

            recurso: dados.recurso,

            recurso_id: dados.recursoId ?? null,

            dados_contexto: dados.dadosContexto ?? null,

            ip: dados.ip ?? null,

            user_agent: dados.userAgent ?? null,
        });
    }
}

export default new AuditoriaRepository();
