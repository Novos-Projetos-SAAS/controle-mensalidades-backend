import jwt, { type SignOptions } from 'jsonwebtoken';

import { env } from '../../configuration/env.js';
import AppError from '../../shared/errors/AppError.js';
import { comparePassword } from '../../utils/senha.utils.js';

import authRepository from './auth.repository.js';
import { validarLogin } from './auth.validator.js';

const erroCredenciaisInvalidas = () =>
    new AppError('Email ou senha inválidos.', 401, 'CREDENCIAIS_INVALIDAS');

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
}

export default new AuthService();
