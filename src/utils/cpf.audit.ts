import { timingSafeEqual } from 'node:crypto';

import { decifrarCpf, indiceCpf, type ChavesCpf, type TipoRegistroCpf } from './cpf.crypto.js';

export type LinhaAuditoriaCpf = {
    id: string;
    organizacao_id: string;
    cpf: string | null;
    cpf_cifrado: string | null;
    cpf_indice: string | null;
};

export type SituacaoAuditoriaCpf =
    | 'valido'
    | 'sem_cpf'
    | 'texto_claro'
    | 'inconsistente'
    | 'cifra_invalida'
    | 'indice_invalido';

/**
 * Confere a integridade e a chave HMAC sem retornar, registrar ou armazenar o CPF decifrado.
 * A validação matemática não é feita aqui: documentos legados podem ter dígitos incorretos.
 */
export function avaliarRegistroCpf(
    tipo: TipoRegistroCpf,
    registro: LinhaAuditoriaCpf,
    chaves: ChavesCpf,
): SituacaoAuditoriaCpf {
    if (registro.cpf !== null) return 'texto_claro';
    if (registro.cpf_cifrado === null && registro.cpf_indice === null) return 'sem_cpf';
    if (registro.cpf_cifrado === null || registro.cpf_indice === null) return 'inconsistente';
    if (!/^[a-f\d]{64}$/i.test(registro.cpf_indice)) return 'indice_invalido';

    try {
        const cpf = decifrarCpf(
            tipo, registro.organizacao_id, registro.id, registro.cpf_cifrado, chaves,
        );
        if (!/^\d{11}$/.test(cpf)) return 'cifra_invalida';
        const esperado = indiceCpf(tipo, registro.organizacao_id, cpf, chaves);
        return timingSafeEqual(
            Buffer.from(esperado, 'hex'),
            Buffer.from(registro.cpf_indice, 'hex'),
        )
            ? 'valido'
            : 'indice_invalido';
    } catch {
        return 'cifra_invalida';
    }
}
