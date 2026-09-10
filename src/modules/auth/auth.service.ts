import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../../configuration/env.js';
import AppError from '../../shared/errors/AppError.js';
import { comparePassword } from '../../utils/senha.utils.js';

import authRepository from './auth.repository.js';
import { validarLogin } from './auth.validator.js';

const erroCredenciaisInvalidas = () =>
    new AppError('Email ou senha inválidos.', 401, 'CREDENCIAIS_INVALIDAS');

const uuidSchema = z.string().uuid();

class AuthService {
    async login(entrada: unknown) {
        const { email, senha } = validarLogin(entrada);

        const usuario = await authRepository.buscarUsuarioAtivoPorEmail(email);

        if (!usuario) {
            throw erroCredenciaisInvalidas();
        }

        const senhaValida = await comparePassword(senha, usuario.senha_hash);

        if (!senhaValida) {
            throw erroCredenciaisInvalidas();
        }

        const organizacoes = await authRepository.listarOrganizacoesAtivasDoUsuario(usuario.id);

        if (organizacoes.length === 0) {
            throw new AppError(
                'Usuário sem organização ativa.',
                403,
                'USUARIO_SEM_ORGANIZACAO_ATIVA',
            );
        }

        const jwtSecret = env.JWT_SECRET;

        if (!jwtSecret) {
            throw new Error('JWT_SECRET não definida.');
        }

        const opcoesJwt: SignOptions = {
            subject: String(usuario.id),
            expiresIn: env.JWT_EXPIRES_IN,
        };

        const token = jwt.sign({}, jwtSecret, opcoesJwt);

        await authRepository.atualizarUltimoLogin(usuario.id);

        return {
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
            },
            organizacoes,
        };
    }

    async me(usuarioId: string) {
        const usuario = await authRepository.buscarUsuarioAtivoPorId(usuarioId);

        if (!usuario) {
            throw new AppError('Autenticação inválida.', 401, 'AUTENTICACAO_INVALIDA');
        }

        const organizacoes = await authRepository.listarOrganizacoesAtivasDoUsuario(usuario.id);

        if (organizacoes.length === 0) {
            throw new AppError(
                'Usuário sem organização ativa.',
                403,
                'USUARIO_SEM_ORGANIZACAO_ATIVA',
            );
        }

        return {
            usuario,
            organizacoes,
        };
    }

    async identificarUsuarioPorToken(token: unknown) {
        if (typeof token !== 'string' || !token) {
            return undefined;
        }

        const jwtSecret = env.JWT_SECRET;

        if (!jwtSecret) {
            return undefined;
        }

        try {
            const payload = jwt.verify(token, jwtSecret);

            if (typeof payload === 'string' || !payload.sub) {
                return undefined;
            }

            const resultadoUsuarioId = uuidSchema.safeParse(payload.sub);

            if (!resultadoUsuarioId.success) {
                return undefined;
            }

            const usuario = await authRepository.buscarUsuarioAtivoPorId(resultadoUsuarioId.data);

            return usuario?.id;
        } catch {
            return undefined;
        }
    }
}

export default new AuthService();
