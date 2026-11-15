import { randomUUID } from 'node:crypto';

import { env } from '../../configuration/env.js';
import type {
    ConfiguracaoMetaWhatsapp,
    EnviarTemplateWhatsappInput,
    ResolverCredencialMetaWhatsapp,
    ResultadoEnvioWhatsapp,
    WhatsAppProvider,
} from './whatsapp.contracts.js';
import { PROPOSTAS_TEMPLATES_WHATSAPP } from './whatsapp.templates.js';

type MetaJson = {
    id?: unknown;
    display_phone_number?: unknown;
    verified_name?: unknown;
    data?: unknown;
    messages?: unknown;
    error?: { code?: unknown; type?: unknown };
};

type OpcoesAdapterMeta = {
    realSendEnabled?: boolean;
    graphApiVersion?: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
};

function codigoErroMeta(status: number, payload: MetaJson | null): string {
    const codigo = payload?.error?.code;
    return typeof codigo === 'number' && Number.isInteger(codigo)
        ? `META_API_${codigo}`
        : `META_HTTP_${status}`;
}

function corpoJson(resposta: Response): Promise<MetaJson | null> {
    return resposta
        .json()
        .then((valor: unknown) =>
            valor !== null && typeof valor === 'object' ? (valor as MetaJson) : null,
        )
        .catch(() => null);
}

/** Adapter oficial, fechado por padrão e injetável para testes sem rede. */
export class MetaCloudApiProvider implements WhatsAppProvider {
    readonly mode: 'META' | 'META_DESABILITADO';
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;
    private readonly graphApiVersion: string;

    constructor(
        private readonly resolverCredencial: ResolverCredencialMetaWhatsapp,
        opcoes: OpcoesAdapterMeta = {},
    ) {
        const habilitado = opcoes.realSendEnabled ?? env.WHATSAPP_META_REAL_SEND_ENABLED === 'true';
        this.mode = habilitado ? 'META' : 'META_DESABILITADO';
        this.fetcher = opcoes.fetcher ?? fetch;
        this.timeoutMs = opcoes.timeoutMs ?? 10_000;
        this.graphApiVersion = opcoes.graphApiVersion ?? env.WHATSAPP_META_GRAPH_API_VERSION;
        if (!/^v\d+\.\d+$/.test(this.graphApiVersion)) {
            throw new Error('VERSAO_GRAPH_META_INVALIDA');
        }
    }

    async validarConfiguracao(configuracao: ConfiguracaoMetaWhatsapp) {
        if (this.mode !== 'META') {
            return { valido: false, motivo: 'ENVIO_REAL_META_DESABILITADO' };
        }
        const token = await this.obterToken(configuracao);
        if (!token) return { valido: false, motivo: 'CREDENCIAL_META_INDISPONIVEL' };

        try {
            const { resposta, dados } = await this.solicitar(
                `/${encodeURIComponent(configuracao.phoneNumberId)}?fields=id,display_phone_number,verified_name`,
                token,
            );
            return {
                valido: resposta.ok && dados?.id === configuracao.phoneNumberId,
                ...(resposta.ok ? {} : { motivo: codigoErroMeta(resposta.status, dados) }),
            };
        } catch {
            return { valido: false, motivo: 'META_VALIDACAO_INDISPONIVEL' };
        }
    }

    async listarTemplates(configuracao: ConfiguracaoMetaWhatsapp) {
        if (this.mode !== 'META') return [];
        const token = await this.obterToken(configuracao);
        if (!token) return [];
        try {
            const { resposta, dados } = await this.solicitar(
                `/${encodeURIComponent(configuracao.whatsappBusinessAccountId)}/message_templates?fields=name,language,status,category&limit=100`,
                token,
            );
            if (!resposta.ok || !Array.isArray(dados?.data)) return [];
            return dados.data.flatMap((item: unknown) => {
                if (!item || typeof item !== 'object') return [];
                const template = item as Record<string, unknown>;
                if (
                    typeof template.name !== 'string' ||
                    typeof template.language !== 'string' ||
                    typeof template.status !== 'string'
                ) {
                    return [];
                }
                return [
                    {
                        nome: template.name,
                        idioma: template.language,
                        status: template.status,
                        categoria: typeof template.category === 'string' ? template.category : null,
                    },
                ];
            });
        } catch {
            return [];
        }
    }

    async enviarTemplate(input: EnviarTemplateWhatsappInput): Promise<ResultadoEnvioWhatsapp> {
        if (this.mode !== 'META') {
            return this.falha('ENVIO_REAL_META_DESABILITADO');
        }
        const variaveis = input.variaveisTemplate ?? [];
        if (!variaveis.length) return this.falha('ESQUEMA_TEMPLATE_META_AUSENTE');
        const parametros = variaveis.map((variavel) => input.parametros[variavel]);
        if (parametros.some((valor) => typeof valor !== 'string' || !valor.trim())) {
            return this.falha('PARAMETROS_TEMPLATE_META_INVALIDOS');
        }

        const token = await this.obterToken(input.configuracao);
        if (!token) return this.falha('CREDENCIAL_META_INDISPONIVEL');
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.destinatarioE164.replace(/^\+/, ''),
            type: 'template',
            template: {
                name: input.nomeTemplateMeta,
                language: { code: input.idioma },
                components: [
                    {
                        type: 'body',
                        parameters: parametros.map((text) => ({ type: 'text', text })),
                    },
                ],
            },
        };

        try {
            const { resposta, dados } = await this.solicitar(
                `/${encodeURIComponent(input.configuracao.phoneNumberId)}/messages`,
                token,
                { method: 'POST', body: JSON.stringify(payload) },
            );
            if (!resposta.ok) {
                if (resposta.status >= 500 || resposta.status === 408) {
                    return {
                        aceito: false,
                        simulado: false,
                        identificadorExterno: null,
                        status: 'RESULTADO_INCERTO',
                        codigoErro: codigoErroMeta(resposta.status, dados),
                    };
                }
                return this.falha(codigoErroMeta(resposta.status, dados));
            }
            const mensagens = Array.isArray(dados?.messages) ? dados.messages : [];
            const primeiro = mensagens[0];
            const id =
                primeiro && typeof primeiro === 'object' && 'id' in primeiro
                    ? (primeiro as { id?: unknown }).id
                    : null;
            if (typeof id !== 'string' || !id) {
                return {
                    aceito: false,
                    simulado: false,
                    identificadorExterno: null,
                    status: 'RESULTADO_INCERTO',
                    codigoErro: 'META_RESPOSTA_SEM_ID',
                };
            }
            return { aceito: true, simulado: false, identificadorExterno: id, status: 'ACEITO' };
        } catch {
            // A requisição pode ter sido aceita antes da falha de transporte; não repetir.
            return {
                aceito: false,
                simulado: false,
                identificadorExterno: null,
                status: 'RESULTADO_INCERTO',
                codigoErro: 'META_RESULTADO_INCERTO',
            };
        }
    }

    private async obterToken(configuracao: ConfiguracaoMetaWhatsapp): Promise<string | null> {
        if (!configuracao.credencial?.referencia) return null;
        try {
            const credenciais = await this.resolverCredencial.obterCredenciaisMeta(configuracao);
            if (credenciais?.expiresAt && Date.parse(credenciais.expiresAt) <= Date.now()) {
                return null;
            }
            return credenciais?.accessToken || null;
        } catch {
            return null;
        }
    }

    private async solicitar(
        caminho: string,
        token: string,
        opcoes: { method?: 'GET' | 'POST'; body?: string } = {},
    ) {
        const url = `https://graph.facebook.com/${this.graphApiVersion}${caminho}`;
        const resposta = await this.fetcher(url, {
            method: opcoes.method ?? 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            ...(opcoes.body ? { body: opcoes.body } : {}),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        return { resposta, dados: await corpoJson(resposta) };
    }

    private falha(codigoErro: string): ResultadoEnvioWhatsapp {
        return {
            aceito: false,
            simulado: false,
            identificadorExterno: null,
            status: 'FALHOU',
            codigoErro,
        };
    }
}

/** Adapter sem rede: registra somente que o fluxo foi simulado. */
export class SimulatedWhatsAppProvider implements WhatsAppProvider {
    readonly mode = 'SIMULADO' as const;

    async validarConfiguracao(_configuracao: ConfiguracaoMetaWhatsapp) {
        return { valido: true };
    }

    async listarTemplates(_configuracao: ConfiguracaoMetaWhatsapp) {
        return PROPOSTAS_TEMPLATES_WHATSAPP.map((template) => ({
            nome: template.chave,
            idioma: template.idioma,
            status: template.statusMeta,
            categoria: null,
        }));
    }

    async enviarTemplate(_input: EnviarTemplateWhatsappInput): Promise<ResultadoEnvioWhatsapp> {
        return {
            aceito: true,
            simulado: true,
            identificadorExterno: `simulado:${randomUUID()}`,
            status: 'ACEITO',
        };
    }
}

/** Compatibilidade explícita com a etapa 01; nunca abre conexão externa. */
export class MetaCloudApiDisabledProvider implements WhatsAppProvider {
    readonly mode = 'META_DESABILITADO' as const;

    async validarConfiguracao(_configuracao: ConfiguracaoMetaWhatsapp) {
        return { valido: false, motivo: 'INTEGRACAO_META_AINDA_NAO_HABILITADA' };
    }

    async listarTemplates(_configuracao: ConfiguracaoMetaWhatsapp) {
        return [];
    }

    async enviarTemplate(_input: EnviarTemplateWhatsappInput): Promise<ResultadoEnvioWhatsapp> {
        return {
            aceito: false,
            simulado: false,
            identificadorExterno: null,
            status: 'FALHOU',
            codigoErro: 'ENVIO_META_DESABILITADO',
        };
    }
}
