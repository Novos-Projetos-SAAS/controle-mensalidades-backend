/**
 * Converte CPFs legados em lotes transacionais. SOMENTE banco isolado de testes.
 * Não imprimir CPF, chave, payload de linha ou SQL com informações pessoais.
 *
 * Leitura:
 * node --env-file=.env.test --import tsx src/diagnostics/backfill-cpf.ts --dry-run
 *
 * Escrita:
 * node --env-file=.env.test --import tsx src/diagnostics/backfill-cpf.ts --apply --target=test --confirm=CPF-TEST-ONLY
 */
import dotenv from 'dotenv';

import { env } from '../configuration/env.js';
import connection from '../database/connection.js';
import {
    camposCpfPersistencia,
    decifrarCpf,
    indiceCpf,
    obterChavesCpf,
    type TipoRegistroCpf,
} from '../utils/cpf.crypto.js';

const tabelaPorTipo = {
    cliente: 'clientes',
    profissional: 'profissionais',
} as const;

function verificarBancoIsolado(): void {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Operação disponível somente em ambiente exclusivo de testes.');
    }
    if (!process.env.DATABASE_URL_TEST) {
        throw new Error('Configure DATABASE_URL_TEST no banco exclusivo de testes.');
    }
    const desenvolvimento: Record<string, string> = {};
    dotenv.config({ path: '.env', processEnv: desenvolvimento });
    if (
        process.env.DATABASE_URL_TEST === desenvolvimento.DATABASE_URL ||
        process.env.DATABASE_URL_TEST === desenvolvimento.DATABASE_URL_MIGRATIONS ||
        process.env.DATABASE_URL_TEST === process.env.DATABASE_URL_MIGRATIONS
    ) {
        throw new Error('DATABASE_URL_TEST não pode coincidir com o banco compartilhado.');
    }
}

async function contarLegados(tabela: string): Promise<number> {
    const resultado = await connection(tabela).whereNotNull('cpf').count<{ total: string }[]>(
        '* as total',
    );
    return Number(resultado[0]?.total ?? 0);
}

async function contarInconsistencias(tabela: string): Promise<number> {
    const resultado = await connection(tabela)
        .where((builder) => {
            builder
                .whereNotNull('cpf_cifrado')
                .whereNull('cpf_indice');
        })
        .orWhere((builder) => {
            builder
                .whereNull('cpf_cifrado')
                .whereNotNull('cpf_indice');
        })
        .count<{ total: string }[]>('* as total');
    return Number(resultado[0]?.total ?? 0);
}

async function migrarTabela(tipo: TipoRegistroCpf): Promise<number> {
    const tabela = tabelaPorTipo[tipo];
    const chaves = obterChavesCpf();
    let processados = 0;

    while (true) {
        const alterados = await connection.transaction(async (transaction) => {
            const linhas = await transaction(tabela)
                .select('id', 'organizacao_id', 'cpf', 'cpf_cifrado', 'cpf_indice')
                .whereNotNull('cpf')
                .orderBy('id', 'asc')
                .limit(100)
                .forUpdate();

            for (const linha of linhas) {
                const cpf = (linha.cpf as string).replace(/\D/g, '');
                if (cpf.length !== 11) {
                    throw new Error('CPF legado com tamanho inválido. Corrija em processo controlado.');
                }
                const dados = camposCpfPersistencia(
                    tipo,
                    linha.organizacao_id,
                    linha.id,
                    cpf,
                    chaves,
                );

                if (linha.cpf_cifrado || linha.cpf_indice) {
                    if (
                        !linha.cpf_cifrado ||
                        !linha.cpf_indice ||
                        decifrarCpf(
                            tipo,
                            linha.organizacao_id,
                            linha.id,
                            linha.cpf_cifrado,
                            chaves,
                        ) !== cpf ||
                        indiceCpf(tipo, linha.organizacao_id, cpf, chaves) !== linha.cpf_indice
                    ) {
                        throw new Error('CPF legado e CPF cifrado apresentam divergência.');
                    }
                    await transaction(tabela)
                        .where({ id: linha.id, organizacao_id: linha.organizacao_id })
                        .update({ cpf: null });
                } else {
                    await transaction(tabela)
                        .where({ id: linha.id, organizacao_id: linha.organizacao_id })
                        .update(dados);
                }
            }
            return linhas.length;
        });

        processados += alterados;
        if (alterados === 0) break;
    }

    return processados;
}

async function executar(): Promise<void> {
    verificarBancoIsolado();
    if (env.CPF_CRYPTO_MODE !== 'transition') {
        throw new Error('Configure CPF_CRYPTO_MODE=transition antes de migrar.');
    }
    obterChavesCpf();
    const aplica = process.argv.includes('--apply');
    const simulacao = process.argv.includes('--dry-run');

    if (aplica === simulacao) {
        throw new Error('Informe exatamente --dry-run ou --apply.');
    }
    if (
        aplica &&
        (!process.argv.includes('--target=test') ||
            !process.argv.includes('--confirm=CPF-TEST-ONLY'))
    ) {
        throw new Error('Confirmação explícita obrigatória para teste isolado.');
    }

    for (const tipo of ['cliente', 'profissional'] as const) {
        const tabela = tabelaPorTipo[tipo];
        const antes = await contarLegados(tabela);
        if (simulacao) {
            console.info(tipo + ': registros legados ainda em claro = ' + antes);
            continue;
        }
        const processados = await migrarTabela(tipo);
        const depois = await contarLegados(tabela);
        const inconsistencias = await contarInconsistencias(tabela);
        console.info(
            tipo +
                ': migrados=' +
                processados +
                ', restantes=' +
                depois +
                ', inconsistencias=' +
                inconsistencias,
        );
        if (depois > 0 || inconsistencias > 0) {
            throw new Error('Migração incompleta. Não habilite modo strict.');
        }
    }
}

executar()
    .catch((erro: unknown) => {
        const mensagem = erro instanceof Error ? erro.message : 'Falha não identificada.';
        // Não imprimir detalhes SQL: podem conter valores sensíveis no driver.
        if (/CPF legado|CPF cifrado|Config|Migração incompleta|Confirmação|Operação disponível|DATABASE_URL_TEST|Informe exatamente|somente/i.test(mensagem)) {
            console.error(mensagem);
        } else {
            console.error('A migração de CPF falhou. Consulte logs protegidos do banco.');
        }
        process.exitCode = 1;
    })
    .finally(() => connection.destroy());
