import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
    randomUUID,
} from 'node:crypto';

import { env } from '../configuration/env.js';

export type TipoRegistroCpf = 'cliente' | 'profissional';
export type ModoProtecaoCpf = 'legacy' | 'transition' | 'strict';

export type ChavesCpf = {
    criptografia: Buffer;
    indice: Buffer;
};

export type RegistroCpfCifrado = {
    id: string;
    cpf: string | null;
    cpf_cifrado?: string | null;
    cpf_indice?: string | null;
};

export function modoProtecaoCpf(): ModoProtecaoCpf {
    return env.CPF_CRYPTO_MODE;
}

export function protecaoCpfAtiva(): boolean {
    return modoProtecaoCpf() !== 'legacy';
}

export function obterChavesCpf(): ChavesCpf {
    const chaveCifra = env.CPF_ENCRYPTION_KEY;
    const chaveIndice = env.CPF_LOOKUP_KEY;

    if (
        !chaveCifra ||
        !chaveIndice ||
        !/^[a-f\d]{64}$/i.test(chaveCifra) ||
        !/^[a-f\d]{64}$/i.test(chaveIndice) ||
        chaveCifra.toLowerCase() === chaveIndice.toLowerCase()
    ) {
        throw new Error('Configuração de chaves de CPF ausente ou inválida.');
    }

    return {
        criptografia: Buffer.from(chaveCifra, 'hex'),
        indice: Buffer.from(chaveIndice, 'hex'),
    };
}

function somenteNumeros(cpf: string): string {
    return cpf.replace(/\D/g, '');
}

function contexto(tipo: TipoRegistroCpf, organizacaoId: string, registroId: string): Buffer {
    return Buffer.from('cpf:v1:' + tipo + ':' + organizacaoId + ':' + registroId, 'utf8');
}

export function indiceCpf(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    cpf: string,
    chaves: ChavesCpf = obterChavesCpf(),
): string {
    return createHmac('sha256', chaves.indice)
        .update('cpf:busca:v1:' + tipo + ':' + organizacaoId + ':' + somenteNumeros(cpf))
        .digest('hex');
}

/** AES-256-GCM com nonce aleatório, autenticação do registro e versão explícita. */
export function cifrarCpf(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    registroId: string,
    cpf: string,
    chaves: ChavesCpf = obterChavesCpf(),
): string {
    const iv = randomBytes(12);
    const cifrador = createCipheriv('aes-256-gcm', chaves.criptografia, iv);
    cifrador.setAAD(contexto(tipo, organizacaoId, registroId));
    const cifra = Buffer.concat([
        cifrador.update(somenteNumeros(cpf), 'utf8'),
        cifrador.final(),
    ]);
    const tag = cifrador.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), cifra.toString('base64url')]
        .join('.');
}

/** Falha fechada: dados adulterados/chave errada não retornam valor parcial. */
export function decifrarCpf(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    registroId: string,
    cifrado: string,
    chaves: ChavesCpf = obterChavesCpf(),
): string {
    const partes = cifrado.split('.');
    if (
        partes.length !== 4 ||
        partes[0] !== 'v1' ||
        !partes.slice(1).every((parte) => /^[A-Za-z\d_-]+$/.test(parte))
    ) {
        throw new Error('Formato de CPF cifrado não reconhecido.');
    }

    const iv = Buffer.from(partes[1]!, 'base64url');
    const tag = Buffer.from(partes[2]!, 'base64url');
    const corpo = Buffer.from(partes[3]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || corpo.length === 0) {
        throw new Error('Formato de CPF cifrado não reconhecido.');
    }
    try {
        const decifrador = createDecipheriv('aes-256-gcm', chaves.criptografia, iv);
        decifrador.setAAD(contexto(tipo, organizacaoId, registroId));
        decifrador.setAuthTag(tag);
        return Buffer.concat([decifrador.update(corpo), decifrador.final()]).toString('utf8');
    } catch {
        throw new Error('Não foi possível autenticar o CPF cifrado.');
    }
}

export function camposCpfPersistencia(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    registroId: string,
    cpf: string | null,
    chaves: ChavesCpf = obterChavesCpf(),
): { cpf: null; cpf_cifrado: string | null; cpf_indice: string | null } {
    if (cpf === null) return { cpf: null, cpf_cifrado: null, cpf_indice: null };
    return {
        cpf: null,
        cpf_cifrado: cifrarCpf(tipo, organizacaoId, registroId, cpf, chaves),
        cpf_indice: indiceCpf(tipo, organizacaoId, cpf, chaves),
    };
}

export function lerCpfRegistro(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    registro: RegistroCpfCifrado,
): string | null {
    if (registro.cpf_cifrado) {
        return decifrarCpf(tipo, organizacaoId, registro.id, registro.cpf_cifrado);
    }
    if (registro.cpf_indice) {
        throw new Error('Registro de CPF inconsistente: índice sem cifra.');
    }
    if (registro.cpf && modoProtecaoCpf() === 'strict') {
        throw new Error('CPF legado não migrado em modo estrito.');
    }
    return registro.cpf;
}

/** ID criado antes da cifragem para amarrar o AAD à linha, evitando troca de valores. */
export function novoIdComCpf(): string {
    return randomUUID();
}

/** Remova os valores cifrados do contrato HTTP após decifrar. */
export function exporCpfRegistro<T extends RegistroCpfCifrado>(
    tipo: TipoRegistroCpf,
    organizacaoId: string,
    registro: T,
): T {
    const cpf = lerCpfRegistro(tipo, organizacaoId, registro);
    const publico = { ...registro, cpf };
    delete publico.cpf_cifrado;
    delete publico.cpf_indice;
    return publico;
}
