/**
 * Pré-homologação somente leitura para banco test ou development.
 *
 * Ex.: node --env-file=.env --import tsx src/diagnostics/auditar-cpf.ts --read-only --target=development
 *
 * Nunca exibe CPF, cifras, índices, chaves, IDs ou SQL de linhas.
 * O modo read-only é imposto também na transação PostgreSQL.
 */
import { env } from '../configuration/env.js';
import connection from '../database/connection.js';
import { avaliarRegistroCpf, type LinhaAuditoriaCpf, type SituacaoAuditoriaCpf } from '../utils/cpf.audit.js';
import { obterChavesCpf, type TipoRegistroCpf } from '../utils/cpf.crypto.js';

const tabelas = { cliente: 'clientes', profissional: 'profissionais' } as const;
type Contagens = Record<SituacaoAuditoriaCpf, number>;

function verificarDestino(): 'test' | 'development' {
    const argumentos = process.argv.slice(2);
    const destino = argumentos.includes('--target=test')
        ? 'test'
        : argumentos.includes('--target=development') ? 'development' : null;
    if (
        !destino ||
        env.NODE_ENV !== destino ||
        env.CPF_CRYPTO_MODE === 'legacy' ||
        !argumentos.includes('--read-only') ||
        argumentos.length !== 2
    ) {
        throw new Error('Informe --read-only e --target=test|development com modo CPF transition/strict.');
    }
    const urlString = destino === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
    if (!urlString) throw new Error('URL do banco não configurada.');
    let url: URL;
    try {
        url = new URL(urlString);
    } catch {
        throw new Error('URL do banco inválida.');
    }
    const banco = decodeURIComponent(url.pathname.slice(1));
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !banco) {
        throw new Error('Identificação do banco inválida.');
    }
    if (destino === 'test') {
        if (process.env.AMBIENTE_BANCO !== 'teste') {
            throw new Error('Exige ambiente exclusivo de testes.');
        }
        if (process.env.DATABASE_URL) {
            const outro = new URL(process.env.DATABASE_URL);
            if (outro.hostname === url.hostname && decodeURIComponent(outro.pathname.slice(1)) === banco) {
                throw new Error('Banco de testes coincide com desenvolvimento.');
            }
        }
    } else if (
        url.hostname !== process.env.CPF_DEV_EXPECTED_HOST ||
        banco !== process.env.CPF_DEV_EXPECTED_DATABASE
    ) {
        throw new Error('Hostname e nome do banco de desenvolvimento precisam de confirmação independente.');
    }
    return destino;
}

function contagensVazias(): Contagens {
    return { valido: 0, sem_cpf: 0, texto_claro: 0, inconsistente: 0, cifra_invalida: 0, indice_invalido: 0 };
}

async function executar(): Promise<void> {
    const destino = verificarDestino();
    const chaves = obterChavesCpf();
    const resultado = await connection.transaction(async (trx) => {
        await trx.raw('SET TRANSACTION READ ONLY');
        const saida: Record<TipoRegistroCpf, Contagens> = {
            cliente: contagensVazias(), profissional: contagensVazias(),
        };
        for (const tipo of ['cliente', 'profissional'] as const) {
            let cursor: string | null = null;
            while (true) {
                const consulta = trx(tabelas[tipo])
                    .select('id', 'organizacao_id', 'cpf', 'cpf_cifrado', 'cpf_indice')
                    .orderBy('id', 'asc')
                    .limit(200);
                if (cursor) consulta.where('id', '>', cursor);
                const linhas = await consulta as LinhaAuditoriaCpf[];
                for (const linha of linhas) {
                    saida[tipo][avaliarRegistroCpf(tipo, linha, chaves)] += 1;
                }
                if (linhas.length < 200) break;
                cursor = linhas[linhas.length - 1]!.id;
            }
        }
        return saida;
    });
    let violacoes = 0;
    let cifrados = 0;
    for (const tipo of ['cliente', 'profissional'] as const) {
        const resumo = resultado[tipo];
        cifrados += resumo.valido;
        violacoes += resumo.texto_claro + resumo.inconsistente +
            resumo.cifra_invalida + resumo.indice_invalido;
        console.info(
            tipo + ': cifrados_verificados=' + resumo.valido +
            ', sem_documento=' + resumo.sem_cpf +
            ', legados=' + resumo.texto_claro +
            ', inconsistentes=' + resumo.inconsistente +
            ', cifra_invalida=' + resumo.cifra_invalida +
            ', indice_invalido=' + resumo.indice_invalido,
        );
    }
    if (violacoes > 0) throw new Error('Pré-homologação reprovada: há documentos incompatíveis.');
    if (cifrados === 0) {
        throw new Error('Nenhum CPF cifrado: não foi possível confirmar as chaves deste banco.');
    }
    console.info('Pré-homologação somente leitura aprovada para ' + destino + '.');
}

executar()
    .catch((erro: unknown) => {
        // Nunca imprimir stack, query, row ou causa do driver PostgreSQL.
        const mensagensPublicas = [
            'Informe --read-only', 'URL do banco', 'Identificação do banco',
            'Exige ambiente exclusivo', 'Banco de testes coincide',
            'Hostname e nome do banco', 'Pré-homologação reprovada',
            'Nenhum CPF cifrado', 'Configuração de chaves',
        ];
        const mensagem = erro instanceof Error ? erro.message : '';
        console.error(
            mensagensPublicas.some((trecho) => mensagem.startsWith(trecho))
                ? mensagem
                : 'Falha na auditoria. Consulte o ambiente protegido sem expor dados.',
        );
        process.exitCode = 1;
    })
    .finally(() => connection.destroy());
