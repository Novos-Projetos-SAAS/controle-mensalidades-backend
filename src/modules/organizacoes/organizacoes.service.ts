import AppError from '../../shared/errors/AppError.js';

import organizacoesRepository from './organizacoes.repository.js';
import type { DadosAtualizacaoOrganizacao } from './organizacoes.repository.js';
import type { OrganizacaoAtual } from './organizacoes.repository.js';
import type { AtualizarOrganizacaoInput } from './organizacoes.validator.js';

function erroOrganizacaoNaoEncontrada() {
    return new AppError('Organização não encontrada.', 404, 'ORGANIZACAO_NAO_ENCONTRADA');
}

class OrganizacoesService {
    async obterAtual(organizacaoId: string | undefined) {
        if (!organizacaoId) {
            throw erroOrganizacaoNaoEncontrada();
        }

        const organizacao = await organizacoesRepository.buscarAtual(organizacaoId);

        if (!organizacao) {
            throw erroOrganizacaoNaoEncontrada();
        }

        return organizacao;
    }

    async atualizarAtual(organizacaoId: string | undefined, dados: AtualizarOrganizacaoInput) {
        if (!organizacaoId) {
            throw erroOrganizacaoNaoEncontrada();
        }

        const organizacaoAnterior = await organizacoesRepository.buscarAtual(organizacaoId);

        if (!organizacaoAnterior) {
            throw erroOrganizacaoNaoEncontrada();
        }

        const atualizacao: DadosAtualizacaoOrganizacao = {};
        const anterior: Partial<Omit<OrganizacaoAtual, 'id'>> = {};
        const novo: Partial<Omit<OrganizacaoAtual, 'id'>> = {};

        if (dados.nome !== undefined) {
            atualizacao.nome = dados.nome;
            anterior.nome = organizacaoAnterior.nome;
            novo.nome = dados.nome;
        }

        if (dados.nome_fantasia !== undefined) {
            atualizacao.nome_fantasia = dados.nome_fantasia;
            anterior.nome_fantasia = organizacaoAnterior.nome_fantasia;
            novo.nome_fantasia = dados.nome_fantasia;
        }

        if (dados.razao_social !== undefined) {
            atualizacao.razao_social = dados.razao_social;
            anterior.razao_social = organizacaoAnterior.razao_social;
            novo.razao_social = dados.razao_social;
        }

        if (dados.cpf_cnpj !== undefined) {
            atualizacao.cpf_cnpj = dados.cpf_cnpj;
            anterior.cpf_cnpj = organizacaoAnterior.cpf_cnpj;
            novo.cpf_cnpj = dados.cpf_cnpj;
        }

        if (dados.email !== undefined) {
            atualizacao.email = dados.email;
            anterior.email = organizacaoAnterior.email;
            novo.email = dados.email;
        }

        if (dados.telefone !== undefined) {
            atualizacao.telefone = dados.telefone;
            anterior.telefone = organizacaoAnterior.telefone;
            novo.telefone = dados.telefone;
        }

        const organizacao = await organizacoesRepository.atualizarAtual(organizacaoId, atualizacao);

        if (!organizacao) {
            throw erroOrganizacaoNaoEncontrada();
        }

        return {
            organizacao,
            anterior,
            novo,
        };
    }
}

export default new OrganizacoesService();
