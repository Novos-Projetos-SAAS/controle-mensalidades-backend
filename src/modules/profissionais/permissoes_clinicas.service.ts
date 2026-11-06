import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

type AlteracaoPermissaoClinica = {
    organizacaoId: string;
    areaNegocioId: string;
    administradorId: string;
    profissionalId: string;
    autorizado: boolean;
    requestId: string;
    ip?: string;
    userAgent?: string;
};

class PermissoesClinicasService {
    async alterar(dados: AlteracaoPermissaoClinica) {
        return connection.transaction(async (tx) => {
            // Revalida a autoridade administrativa dentro da transação.
            const administrador = await tx('usuarios_organizacoes as uo')
                .innerJoin('usuarios as u', 'u.id', 'uo.usuario_id')
                .innerJoin('organizacoes as o', 'o.id', 'uo.organizacao_id')
                .select('uo.usuario_id')
                .where({
                    'uo.usuario_id': dados.administradorId,
                    'uo.organizacao_id': dados.organizacaoId,
                    'uo.perfil': 'ADMINISTRADOR',
                    'uo.ativo': true,
                    'u.ativo': true,
                    'o.ativo': true,
                })
                .whereNull('uo.deletado_em')
                .whereNull('u.deletado_em')
                .whereNull('o.deletado_em')
                .forShare('uo')
                .first();

            if (!administrador) {
                throw new AppError(
                    'Administrador não autorizado.',
                    403,
                    'PERMISSAO_CLINICA_GESTOR_NEGADO',
                );
            }

            // A área precisa pertencer à organização e estar ativa.
            const area = await tx('areas_negocio')
                .select('id')
                .where({
                    id: dados.areaNegocioId,
                    organizacao_id: dados.organizacaoId,
                    ativo: true,
                })
                .whereNull('deletado_em')
                .forShare()
                .first();

            if (!area) {
                throw new AppError('Área não encontrada.', 404, 'AREA_NEGOCIO_NAO_ENCONTRADA');
            }

            // Bloqueia o profissional contra alterações concorrentes.
            const profissional = await tx('profissionais')
                .select('id', 'usuario_id', 'ativo')
                .where({
                    id: dados.profissionalId,
                    organizacao_id: dados.organizacaoId,
                })
                .whereNull('deletado_em')
                .forUpdate()
                .first();

            if (!profissional) {
                throw new AppError(
                    'Profissional não encontrado.',
                    404,
                    'PROFISSIONAL_NAO_ENCONTRADO',
                );
            }

            const vinculo = await tx('profissionais_areas')
                .select('ativo', 'deletado_em', 'acesso_clinico_autorizado')
                .where({
                    profissional_id: dados.profissionalId,
                    area_negocio_id: dados.areaNegocioId,
                })
                .forUpdate()
                .first();

            if (!vinculo) {
                throw new AppError(
                    'Vínculo não encontrado.',
                    404,
                    'VINCULO_PROFISSIONAL_AREA_NAO_ENCONTRADO',
                );
            }

            // Para conceder acesso, todos os vínculos devem estar ativos.
            // Para revogar, permitimos limpar uma autorização antiga
            // mesmo quando o profissional ou seu vínculo está inativo.
            if (dados.autorizado) {
                if (!profissional.ativo || !vinculo.ativo || vinculo.deletado_em) {
                    throw new AppError(
                        'Vínculo profissional inativo.',
                        409,
                        'VINCULO_CLINICO_INATIVO',
                    );
                }

                if (!profissional.usuario_id) {
                    throw new AppError(
                        'Profissional sem usuário vinculado.',
                        409,
                        'PROFISSIONAL_SEM_USUARIO_ATIVO',
                    );
                }

                const usuarioVinculado = await tx('usuarios as u')
                    .innerJoin('usuarios_organizacoes as uo', 'uo.usuario_id', 'u.id')
                    .select('u.id')
                    .where({
                        'u.id': profissional.usuario_id,
                        'u.ativo': true,
                        'uo.organizacao_id': dados.organizacaoId,
                        'uo.ativo': true,
                    })
                    .whereNull('u.deletado_em')
                    .whereNull('uo.deletado_em')
                    .forShare('u')
                    .first();

                if (!usuarioVinculado) {
                    throw new AppError(
                        'Usuário profissional inativo ou não vinculado.',
                        409,
                        'PROFISSIONAL_SEM_USUARIO_ATIVO',
                    );
                }
            }

            const anterior = Boolean(vinculo.acesso_clinico_autorizado);

            if (anterior === dados.autorizado) {
                throw new AppError(
                    'Permissão clínica já está neste estado.',
                    409,
                    'PERMISSAO_CLINICA_SEM_ALTERACAO',
                );
            }

            // Altera exclusivamente o vínculo profissional + área.
            await tx('profissionais_areas')
                .where({
                    profissional_id: dados.profissionalId,
                    area_negocio_id: dados.areaNegocioId,
                })
                .update({
                    acesso_clinico_autorizado: dados.autorizado,
                });

            // A auditoria acontece na mesma transação.
            // Se falhar, a atualização acima será desfeita.
            await tx('registros_auditoria').insert({
                organizacao_id: dados.organizacaoId,
                usuario_id: dados.administradorId,
                area_negocio_id: dados.areaNegocioId,
                acao: dados.autorizado
                    ? 'PERMISSAO_CLINICA.CONCEDIDA'
                    : 'PERMISSAO_CLINICA.REVOGADA',
                recurso: 'PROFISSIONAL',
                recurso_id: dados.profissionalId,
                dados_contexto: {
                    requestId: dados.requestId,
                    profissionalId: dados.profissionalId,
                    areaNegocioId: dados.areaNegocioId,
                    anterior,
                    novo: dados.autorizado,
                },
                ip: dados.ip?.slice(0, 64) ?? null,
                user_agent: dados.userAgent?.slice(0, 500) ?? null,
            });

            return {
                profissionalId: dados.profissionalId,
                areaNegocioId: dados.areaNegocioId,
                autorizado: dados.autorizado,
            };
        });
    }
}

export default new PermissoesClinicasService();
