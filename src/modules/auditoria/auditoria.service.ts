import auditoriaRepository from './auditoria.repository.js';

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

class AuditoriaService {
    async registrar(dados: RegistroAuditoriaInput) {
        await auditoriaRepository.registrar(dados);
    }
}

export default new AuditoriaService();
