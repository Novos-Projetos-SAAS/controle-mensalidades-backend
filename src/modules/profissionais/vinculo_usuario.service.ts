import { aplicarTimeoutsTransacaoClinica } from '../../database/clinical-transaction-timeouts.js';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

type AlterarVinculoUsuarioInput = {
    organizacaoId: string;
    areaNegocioId: string;
    administradorId: string;
    profissionalId: string;
    usuarioId: string | null;
    requestId: string;
    ip?: string;
    userAgent?: string;
};

class VinculoUsuarioService {
    async alterar(dados: AlterarVinculoUsuarioInput) {
        return connection.transaction(async (tx) => {
            await aplicarTimeoutsTransacaoClinica(tx);
            // 1. Revalidar o administrador dentro da transação.
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
                    'VINCULO_USUARIO_GESTOR_NEGADO',
                );
            }

            // 2. Garantir que a área pertence à organização.
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
                throw new AppError(
                    'Área de negócio não encontrada.',
                    404,
                    'AREA_NEGOCIO_NAO_ENCONTRADA',
                );
            }

            // 3. Bloquear o profissional contra alterações concorrentes.
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

            const usuarioAnteriorId = (profissional.usuario_id as string | null) ?? null;

            // 4. Impedir operação sem mudança.
            if (usuarioAnteriorId === dados.usuarioId) {
                throw new AppError(
                    'O profissional já possui este vínculo.',
                    409,
                    'VINCULO_USUARIO_SEM_ALTERACAO',
                );
            }

            // 5. Não permitir troca direta de identidade.
            // Primeiro é necessário desvincular, depois vincular.
            if (usuarioAnteriorId && dados.usuarioId) {
                throw new AppError(
                    'Desvincule o usuário atual antes de vincular outro.',
                    409,
                    'TROCA_DIRETA_USUARIO_NAO_PERMITIDA',
                );
            }

            // 6. Proteger a titularidade do histórico clínico.
            // Inclui sessões com soft delete.
            const possuiSessoes = await tx('sessoes_clinicas')
                .select('id')
                .where({
                    profissional_id: dados.profissionalId,
                })
                .first();

            if (possuiSessoes) {
                throw new AppError(
                    'Não é permitido alterar o vínculo de um profissional com histórico clínico.',
                    409,
                    'PROFISSIONAL_COM_HISTORICO_CLINICO',
                );
            }

            // 7. Validar o novo usuário, se houver.
            if (dados.usuarioId !== null) {
                if (!profissional.ativo) {
                    throw new AppError(
                        'Não é permitido vincular um profissional inativo.',
                        409,
                        'PROFISSIONAL_INATIVO',
                    );
                }

                // Bloquear o usuário serializa tentativas simultâneas
                // de vinculá-lo a profissionais diferentes.
                const usuario = await tx('usuarios')
                    .select('id')
                    .where({
                        id: dados.usuarioId,
                        ativo: true,
                    })
                    .whereNull('deletado_em')
                    .forUpdate()
                    .first();

                if (!usuario) {
                    throw new AppError('Usuário indisponível.', 404, 'USUARIO_NAO_ENCONTRADO');
                }

                const membro = await tx('usuarios_organizacoes')
                    .select('usuario_id')
                    .where({
                        usuario_id: dados.usuarioId,
                        organizacao_id: dados.organizacaoId,
                        ativo: true,
                    })
                    .whereNull('deletado_em')
                    .forShare()
                    .first();

                if (!membro) {
                    throw new AppError(
                        'Usuário não disponível nesta organização.',
                        404,
                        'USUARIO_NAO_ENCONTRADO',
                    );
                }

                // Impedir que o mesmo usuário represente
                // dois profissionais da mesma organização.
                const outroProfissional = await tx('profissionais')
                    .select('id')
                    .where({
                        organizacao_id: dados.organizacaoId,
                        usuario_id: dados.usuarioId,
                    })
                    .whereNot('id', dados.profissionalId)
                    .whereNull('deletado_em')
                    .first();

                if (outroProfissional) {
                    throw new AppError(
                        'Este usuário já está vinculado a outro profissional.',
                        409,
                        'USUARIO_JA_VINCULADO_PROFISSIONAL',
                    );
                }
            }

            // 8. Atualizar somente a identidade do profissional.
            await tx('profissionais')
                .where({
                    id: dados.profissionalId,
                    organizacao_id: dados.organizacaoId,
                })
                .whereNull('deletado_em')
                .update({
                    usuario_id: dados.usuarioId,
                });

            // 9. Revogar TODAS as autorizações clínicas anteriores.
            // A nova identidade nunca herda permissões antigas.
            await tx('profissionais_areas')
                .where({
                    profissional_id: dados.profissionalId,
                })
                .update({
                    acesso_clinico_autorizado: false,
                });

            // 10. Registrar auditoria obrigatória na mesma transação.
            // Caso falhe, o vínculo e as revogações sofrem rollback.
            await tx('registros_auditoria').insert({
                organizacao_id: dados.organizacaoId,
                usuario_id: dados.administradorId,
                area_negocio_id: dados.areaNegocioId,
                acao:
                    dados.usuarioId === null
                        ? 'PROFISSIONAL.USUARIO_DESVINCULADO'
                        : 'PROFISSIONAL.USUARIO_VINCULADO',
                recurso: 'PROFISSIONAL',
                recurso_id: dados.profissionalId,
                dados_contexto: {
                    requestId: dados.requestId,
                    profissionalId: dados.profissionalId,
                    usuarioAnteriorId,
                    usuarioNovoId: dados.usuarioId,
                    autorizacoesClinicasRevogadas: true,
                },
                ip: dados.ip?.slice(0, 64) ?? null,
                user_agent: dados.userAgent?.slice(0, 500) ?? null,
            });

            return {
                profissionalId: dados.profissionalId,
                usuarioId: dados.usuarioId,
            };
        });
    }
}

export default new VinculoUsuarioService();
