import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import AppError from '../../shared/errors/AppError.js';

export function validarChaveEncriptacao(chave: string | undefined): Buffer {
    if (typeof chave !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(chave)) {
        throw new AppError(
            'Criptografia InfinitePay não configurada.',
            503,
            'INFINITEPAY_CHAVE_INVALIDA',
        );
    }
    const decoded = Buffer.from(chave, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== chave) {
        throw new AppError(
            'Criptografia InfinitePay não configurada.',
            503,
            'INFINITEPAY_CHAVE_INVALIDA',
        );
    }
    return decoded;
}

function aad(scope: string): Buffer {
    if (!scope) throw new Error('scope');
    return Buffer.from(`infinitepay:v1:${scope}`, 'utf8');
}

export function cifrarSegredo(value: string, chave: string | undefined, scope: string): string {
    const key = validarChaveEncriptacao(chave);
    try {
        if (!value) throw new Error('secret');
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(aad(scope));
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return [
            'v1',
            iv.toString('base64url'),
            cipher.getAuthTag().toString('base64url'),
            encrypted.toString('base64url'),
        ].join('.');
    } catch {
        throw new AppError(
            'Credencial InfinitePay indisponível.',
            503,
            'INFINITEPAY_CREDENCIAL_INVALIDA',
        );
    }
}

function decode(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('encoding');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('encoding');
    return decoded;
}

export function decifrarSegredo(value: string, chave: string | undefined, scope: string): string {
    try {
        const [version, iv, tag, ciphertext, ...extra] = value.split('.');
        if (version !== 'v1' || !iv || !tag || !ciphertext || extra.length > 0)
            throw new Error('envelope');
        const ivBytes = decode(iv);
        const tagBytes = decode(tag);
        if (ivBytes.length !== 12 || tagBytes.length !== 16) throw new Error('envelope');
        const decipher = createDecipheriv('aes-256-gcm', validarChaveEncriptacao(chave), ivBytes);
        decipher.setAAD(aad(scope));
        decipher.setAuthTag(tagBytes);
        return Buffer.concat([decipher.update(decode(ciphertext)), decipher.final()]).toString(
            'utf8',
        );
    } catch {
        throw new AppError(
            'Credencial InfinitePay indisponível.',
            503,
            'INFINITEPAY_CREDENCIAL_INVALIDA',
        );
    }
}
