import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type CredenciaisAcessoMeta = {
    accessToken: string;
    expiresAt?: string | null;
};

export type ContextoCofreWhatsapp = {
    integracaoId: string;
    organizacaoId: string;
    areaNegocioId: string | null;
};

function validarCredenciais(credenciais: CredenciaisAcessoMeta): void {
    if (
        typeof credenciais.accessToken !== 'string' ||
        credenciais.accessToken.trim().length < 20 ||
        credenciais.accessToken.length > 4096
    ) {
        throw new Error('CREDENCIAL_META_INVALIDA');
    }
    if (
        credenciais.expiresAt !== undefined &&
        credenciais.expiresAt !== null &&
        Number.isNaN(Date.parse(credenciais.expiresAt))
    ) {
        throw new Error('EXPIRACAO_CREDENCIAL_META_INVALIDA');
    }
}

function contextoAutenticado(contexto: ContextoCofreWhatsapp): Buffer {
    return Buffer.from(
        [
            'orbe-whatsapp-meta-v1',
            contexto.organizacaoId,
            contexto.areaNegocioId ?? 'GLOBAL',
            contexto.integracaoId,
        ].join(':'),
    );
}

export class CofreCredenciaisWhatsapp {
    constructor(private readonly chave: Buffer) {
        if (chave.length !== 32) throw new Error('CHAVE_COFRE_WHATSAPP_INVALIDA');
    }

    criptografar(credenciais: CredenciaisAcessoMeta, contexto: ContextoCofreWhatsapp): string {
        validarCredenciais(credenciais);
        const nonce = randomBytes(12);
        const cifrador = createCipheriv('aes-256-gcm', this.chave, nonce);
        cifrador.setAAD(contextoAutenticado(contexto));
        const dados = Buffer.concat([
            cifrador.update(JSON.stringify(credenciais), 'utf8'),
            cifrador.final(),
        ]);
        return `v1.${nonce.toString('hex')}.${cifrador.getAuthTag().toString('hex')}.${dados.toString('base64')}`;
    }

    descriptografar(cifra: string, contexto: ContextoCofreWhatsapp): CredenciaisAcessoMeta {
        const [versao, nonceHex, tagHex, dadosBase64, ...extra] = cifra.split('.');
        if (
            versao !== 'v1' ||
            !nonceHex ||
            !tagHex ||
            extra.length > 0 ||
            !/^[a-f\d]{24}$/i.test(nonceHex) ||
            !/^[a-f\d]{32}$/i.test(tagHex) ||
            !dadosBase64
        ) {
            throw new Error('CIFRA_CREDENCIAL_META_INVALIDA');
        }

        const decifrador = createDecipheriv(
            'aes-256-gcm',
            this.chave,
            Buffer.from(nonceHex, 'hex'),
        );
        decifrador.setAAD(contextoAutenticado(contexto));
        decifrador.setAuthTag(Buffer.from(tagHex, 'hex'));
        const dados = Buffer.concat([
            decifrador.update(Buffer.from(dadosBase64, 'base64')),
            decifrador.final(),
        ]).toString('utf8');
        const credenciais = JSON.parse(dados) as CredenciaisAcessoMeta;
        validarCredenciais(credenciais);
        return credenciais;
    }
}

export function criarCofreCredenciaisWhatsapp(
    valorBase64 = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY,
) {
    if (!valorBase64) throw new Error('COFRE_WHATSAPP_NAO_CONFIGURADO');
    const normalizado = valorBase64.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizado)) {
        throw new Error('CHAVE_COFRE_WHATSAPP_INVALIDA');
    }
    const chave = Buffer.from(normalizado, 'base64');
    if (chave.length !== 32 || chave.toString('base64') !== normalizado) {
        throw new Error('CHAVE_COFRE_WHATSAPP_INVALIDA');
    }
    return new CofreCredenciaisWhatsapp(chave);
}
