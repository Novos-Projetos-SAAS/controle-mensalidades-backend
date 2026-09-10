import AppError from '../../shared/errors/AppError.js';
import { hashPassword } from '../../utils/senha.utils.js';

import usuariosRepository from './usuarios.repository.js';
import type { AtualizarVinculoInput, CriarUsuarioInput } from './usuarios.validator.js';

type EstadoVinculo = {
    perfil: 'ADMINISTRADOR' | 'OPERADOR';
    ativo: boolean;
};

function isViolacaoUnicidade(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function erroEmailJaCadastrado() {
    return new AppError(
        'Já existe um usuário cadastrado com este email.',
        409,
        'EMAIL_JA_CADASTRADO',
    );
}

class UsuariosService {
    async criar(organizacaoId: string | undefined, dados: CriarUsuarioInput) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        try {
            return await usuariosRepository.executarEmTransacao(async (transaction) => {
                const usuarioExistente = await usuariosRepository.buscarUsuarioPorEmail(
                    dados.email,
                    transaction,
                );

                if (usuarioExistente) {
                    throw erroEmailJaCadastrado();
                }

                const senhaHash = await hashPassword(dados.senha);
                const usuario = await usuariosRepository.criarUsuario(
                    {
                        nome: dados.nome,
                        email: dados.email,
                        senhaHash,
                    },
                    transaction,
                );

                await usuariosRepository.criarVinculoOrganizacao(
                    usuario.id,
                    organizacaoId,
                    dados.perfil,
                    transaction,
                );

                return {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    perfil: dados.perfil,
                    ativo: true,
                };
            });
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (isViolacaoUnicidade(error)) {
                throw erroEmailJaCadastrado();
            }

            throw error;
        }
    }

    async listarPorOrganizacao(organizacaoId: string | undefined) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        return usuariosRepository.listarPorOrganizacao(organizacaoId);
    }

    async atualizarVinculo(
        organizacaoId: string | undefined,
        usuarioId: string,
        dados: AtualizarVinculoInput,
    ) {
        if (!organizacaoId) {
            throw new AppError('Organização não informada.', 400, 'ORGANIZACAO_NAO_INFORMADA');
        }

        return usuariosRepository.executarEmTransacao(async (transaction) => {
            await usuariosRepository.bloquearOrganizacao(organizacaoId, transaction);

            const vinculo = await usuariosRepository.buscarVinculo(
                organizacaoId,
                usuarioId,
                transaction,
                true,
            );

            if (!vinculo) {
                throw new AppError(
                    'Usuário não encontrado na organização.',
                    404,
                    'USUARIO_NAO_ENCONTRADO',
                );
            }

            const anterior: EstadoVinculo = {
                perfil: vinculo.perfil,
                ativo: vinculo.ativo,
            };
            const novo: EstadoVinculo = {
                perfil: dados.perfil ?? anterior.perfil,
                ativo: dados.ativo ?? anterior.ativo,
            };
            const atualizacao: Partial<EstadoVinculo> = {};

            if (dados.perfil !== undefined) {
                atualizacao.perfil = dados.perfil;
            }

            if (dados.ativo !== undefined) {
                atualizacao.ativo = dados.ativo;
            }

            const removeAdministradorAtivo =
                anterior.perfil === 'ADMINISTRADOR' &&
                anterior.ativo &&
                (novo.perfil !== 'ADMINISTRADOR' || !novo.ativo);

            if (removeAdministradorAtivo) {
                const administradoresAtivos =
                    await usuariosRepository.bloquearAdministradoresAtivos(
                        organizacaoId,
                        transaction,
                    );
                const existeOutroAdministrador = administradoresAtivos.some(
                    (administrador) => administrador.usuario_id !== usuarioId,
                );

                if (!existeOutroAdministrador) {
                    throw new AppError(
                        'A organização deve possuir pelo menos um administrador ativo.',
                        409,
                        'ULTIMO_ADMINISTRADOR',
                    );
                }
            }

            await usuariosRepository.atualizarVinculo(
                organizacaoId,
                usuarioId,
                atualizacao,
                transaction,
            );

            return {
                usuario: {
                    id: vinculo.id,
                    nome: vinculo.nome,
                    email: vinculo.email,
                    ...novo,
                },
                anterior,
                novo,
            };
        });
    }
}

export default new UsuariosService();
