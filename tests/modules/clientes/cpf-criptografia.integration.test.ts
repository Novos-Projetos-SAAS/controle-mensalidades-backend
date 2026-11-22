import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

import connection from '../../../src/database/connection.js';
import { env } from '../../../src/configuration/env.js';
import clientesRepository from '../../../src/modules/clientes/clientes.repository.js';
import profissionaisRepository from '../../../src/modules/profissionais/profissionais.repository.js';
import { indiceCpf, protecaoCpfAtiva } from '../../../src/utils/cpf.crypto.js';

after(async () => {
    await connection.destroy();
});

function exigirBancoTeste() {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Teste de CPF exige banco exclusivo de testes.');
    }
    if (
        !process.env.DATABASE_URL_TEST ||
        process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
    ) {
        throw new Error('DATABASE_URL_TEST deve ser diferente do banco de desenvolvimento.');
    }
}

function violacaoIndiceCpf(erro: unknown): boolean {
    if (typeof erro !== 'object' || erro === null) return false;
    const banco = erro as { code?: string; constraint?: string };
    return banco.code === '23505' &&
        ['uq_clientes_organizacao_cpf_indice', 'uq_profissionais_organizacao_cpf_indice']
            .includes(banco.constraint ?? '');
}


test(
    'CPF cifrado: CRUD, índice por organização, busca completa e ausência de texto puro',
    { skip: !protecaoCpfAtiva() },
    async () => {
        exigirBancoTeste();

        const organizacaoId = randomUUID();
        const outraOrganizacaoId = randomUUID();
        const clienteId: string[] = [];
        const profissionalId: string[] = [];
        const cpf = '52998224725';

        await connection('organizacoes').insert([
            { id: organizacaoId, nome: 'CPF Cifrado Teste A', ativo: true },
            { id: outraOrganizacaoId, nome: 'CPF Cifrado Teste B', ativo: true },
        ]);
        try {
            await connection.transaction(async (trx) => {
                const cliente = await clientesRepository.criarCliente(
                    organizacaoId, { nome: 'Pessoa de Teste', cpf }, trx,
                );
                clienteId.push(cliente.id);
                assert.equal(cliente.cpf, cpf);
                assert.equal('cpf_cifrado' in cliente, false);
                assert.equal('cpf_indice' in cliente, false);

                const profissional = await profissionaisRepository.criarProfissional(
                    organizacaoId, { nome: 'Profissional Teste', cpf }, trx,
                );
                profissionalId.push(profissional.id);
                assert.equal(profissional.cpf, cpf);
                assert.equal('cpf_cifrado' in profissional, false);
                assert.equal('cpf_indice' in profissional, false);

                const outro = await clientesRepository.criarCliente(
                    outraOrganizacaoId, { nome: 'Pessoa Outra Empresa', cpf }, trx,
                );
                clienteId.push(outro.id);
                assert.equal(outro.cpf, cpf);
            });

            await assert.rejects(
                () => connection.transaction(async (trx) => {
                    await clientesRepository.criarCliente(
                        organizacaoId, { nome: 'CPF Repetido', cpf }, trx,
                    );
                }),
                violacaoIndiceCpf,
            );
            await assert.rejects(
                () => connection.transaction(async (trx) => {
                    await profissionaisRepository.criarProfissional(
                        organizacaoId, { nome: 'Profissional Repetido', cpf }, trx,
                    );
                }),
                violacaoIndiceCpf,
            );

            const clienteDeOutroTenant = await clientesRepository.buscarPorId(
                outraOrganizacaoId, clienteId[0]!,
            );
            const profissionalDeOutroTenant = await profissionaisRepository.buscarPorId(
                outraOrganizacaoId, profissionalId[0]!,
            );
            assert.equal(clienteDeOutroTenant, undefined);
            assert.equal(profissionalDeOutroTenant, undefined);

            const clienteBanco = await connection('clientes')
                .select('id', 'cpf', 'cpf_cifrado', 'cpf_indice')
                .where({ id: clienteId[0], organizacao_id: organizacaoId }).first();
            const profissionalBanco = await connection('profissionais')
                .select('id', 'cpf', 'cpf_cifrado', 'cpf_indice')
                .where({ id: profissionalId[0], organizacao_id: organizacaoId }).first();
            assert.equal(clienteBanco.cpf, null);
            assert.equal(profissionalBanco.cpf, null);
            assert.ok(clienteBanco.cpf_cifrado.startsWith('v1.'));
            assert.ok(profissionalBanco.cpf_cifrado.startsWith('v1.'));
            assert.equal(clienteBanco.cpf_cifrado.includes(cpf), false);
            assert.equal(profissionalBanco.cpf_cifrado.includes(cpf), false);
            assert.equal(clienteBanco.cpf_indice, indiceCpf('cliente', organizacaoId, cpf));
            assert.equal(
                profissionalBanco.cpf_indice,
                indiceCpf('profissional', organizacaoId, cpf),
            );

            const resultado = await clientesRepository.listarPorOrganizacao(organizacaoId, {
                busca: '529.982.247-25', buscaNumerica: cpf,
            });
            assert.deepEqual(resultado.map((item) => item.id), [clienteId[0]]);
            assert.equal(resultado[0]?.cpf, cpf);
            assert.equal('cpf_cifrado' in resultado[0]!, false);

            const resultadoProf = await profissionaisRepository.listarPorOrganizacao(
                organizacaoId,
                { busca: '52998224725', buscaNumerica: cpf },
            );
            assert.deepEqual(resultadoProf.map((item) => item.id), profissionalId);

            await connection.transaction(async (trx) => {
                const encontrado = await clientesRepository.buscarPorCpf(
                    organizacaoId, cpf, trx,
                );
                assert.equal(encontrado?.id, clienteId[0]);
                const deOutroTenant = await clientesRepository.buscarPorCpf(
                    outraOrganizacaoId, cpf, trx,
                );
                assert.equal(deOutroTenant?.id, clienteId[1]);
                await clientesRepository.atualizarCliente(
                    organizacaoId,
                    clienteId[0]!,
                    { cpf: '11144477735' },
                    trx,
                );
            });
            const clienteAtualizado = await clientesRepository.buscarPorId(
                organizacaoId,
                clienteId[0]!,
            );
            assert.equal(clienteAtualizado?.cpf, '11144477735');
            assert.equal('cpf_cifrado' in clienteAtualizado!, false);
        } finally {
            await connection('profissionais').whereIn('id', profissionalId).del();
            await connection('clientes').whereIn('id', clienteId).del();
            await connection('organizacoes').whereIn('id', [organizacaoId, outraOrganizacaoId]).del();
        }
    },
);

test(
    'modo strict rejeita CPF legado e índice de CPF sem cifra',
    { skip: env.CPF_CRYPTO_MODE !== 'strict' },
    async () => {
        exigirBancoTeste();
        const organizacaoId = randomUUID();
        const legadoId = randomUUID();
        const inconsistenteId = randomUUID();
        await connection('organizacoes').insert({
            id: organizacaoId,
            nome: 'CPF Strict Validação',
            ativo: true,
        });
        try {
            await connection('clientes').insert([
                {
                    id: legadoId,
                    organizacao_id: organizacaoId,
                    nome: 'CPF legado QA',
                    cpf: '52998224725',
                },
                {
                    id: inconsistenteId,
                    organizacao_id: organizacaoId,
                    nome: 'CPF incompleto QA',
                    cpf: null,
                    cpf_cifrado: null,
                    cpf_indice: 'a'.repeat(64),
                },
            ]);
            await assert.rejects(
                () => clientesRepository.buscarPorId(organizacaoId, legadoId),
                /CPF legado não migrado em modo estrito/,
            );
            await assert.rejects(
                () => clientesRepository.buscarPorId(organizacaoId, inconsistenteId),
                /Registro de CPF inconsistente/,
            );
        } finally {
            await connection('clientes')
                .whereIn('id', [legadoId, inconsistenteId])
                .del();
            await connection('organizacoes').where({ id: organizacaoId }).del();
        }
    },
);
