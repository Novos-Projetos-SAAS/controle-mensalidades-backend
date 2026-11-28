import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function chaveBaileys(valor = process.env.WHATSAPP_BAILEYS_ENCRYPTION_KEY): Buffer {
    const chave = Buffer.from(valor ?? '', 'base64');
    if (chave.length !== 32 || chave.toString('base64') !== valor) {
        throw new Error('CHAVE_BAILEYS_INVALIDA');
    }
    return chave;
}
export function cifrarEstadoBaileys(estado: string, escopo: string, chave: Buffer): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', chave, nonce);
    cipher.setAAD(Buffer.from('orbe-baileys-v1:' + escopo));
    const dados = Buffer.concat([cipher.update(estado, 'utf8'), cipher.final()]);
    return ['v1', nonce.toString('hex'), cipher.getAuthTag().toString('hex'), dados.toString('base64')].join('.');
}
export function abrirEstadoBaileys(cifra: string, escopo: string, chave: Buffer): string {
    const [versao, nonce, tag, dados, ...extra] = cifra.split('.');
    if (versao !== 'v1' || !nonce || !tag || !dados || extra.length ||
        !/^[a-f0-9]{24}$/.test(nonce) || !/^[a-f0-9]{32}$/.test(tag)) {
        throw new Error('ESTADO_BAILEYS_INVALIDO');
    }
    const decipher = createDecipheriv('aes-256-gcm', chave, Buffer.from(nonce, 'hex'));
    decipher.setAAD(Buffer.from('orbe-baileys-v1:' + escopo));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()]).toString('utf8');
}
