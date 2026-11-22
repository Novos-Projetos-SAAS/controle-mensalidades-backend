/**
 * Converte CPFs legados em lotes transacionais. SOMENTE banco de desenvolvimento confirmado.
 * Não imprimir CPF, chave, payload de linha ou SQL com informações pessoais.
 *
 * Leitura:
 * node --env-file=.env --import tsx src/diagnostics/backfill-cpf-desenv.ts --dry-run
 *
 * Escrita:
 * node --env-file=.env --import tsx src/diagnostics/backfill-cpf-desenv.ts --apply --target=development --confirm=CPF-DESENV-ONLY
 */
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

/**
 * Para impedir confusão entre os ambientes, exige uma confirmação INDEPENDENTE
 * do host e nome do banco no .env, mesmo quando a URL está configurada.
 */
function verificarBancoDesenvolvimento(): void {
    if (env.NODE_ENV !== 'development') {
        throw new Error('Backfill de desenvolvimento exige NODE_ENV=development.');
    }
    const urlAtual = process.env.DATABASE_URL;
    const hostEsperado = process.env.CPF_DEV_EXPECTED_HOST;
    const bancoEsperado = process.env.CPF_DEV_EXPECTED_DATABASE;

    if (!urlAtual || !hostEsperado || !bancoEsperado) {
        throw new Error('Configuração de banco de desenvolvimento ou fingerprint incompleta.');
    }

    let url: URL;
    try {
        url = new URL(urlAtual);
    } catch {
        throw new Error('DATABASE_URL inválida.');
    }
    const bancoAtual = decodeURIComponent(url.pathname.slice(1));
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== hostEsperado ||
        bancoAtual !== bancoEsperado ||
        !bancoAtual
    ) {
        throw new Error('O banco não corresponde ao host/nome confirmados de desenvolvimento.');
    }

    const urlsOutrosAmbientes = [
        process.env.DATABASE_URL_TEST,
        process.env.DATABASE_URL_PRODUCTION,
    ].filter((valor): valor is string => Boolean(valor));

    for (const outra of urlsOutrosAmbientes) {
        try {
            const outraUrl = new URL(outra);
            if (
                outraUrl.hostname === url.hostname &&
                decodeURIComponent(outraUrl.pathname.slice(1)) === bancoAtual
            ) {
                throw new Error('DATABASE_URL de desenvolvimento coincide com outro ambiente.');
            }
        } catch (erro) {
            if (erro instanceof Error && erro.message.includes('coincide com outro ambiente')) {
                throw erro;
            }
            throw new Error('Uma URL de outro ambiente está inválida.');
        }
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
    verificarBancoDesenvolvimento();
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
        (!process.argv.includes('--target=development') ||
            !process.argv.includes('--confirm=CPF-DESENV-ONLY'))
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
