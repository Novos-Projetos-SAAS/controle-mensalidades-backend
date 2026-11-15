import { randomUUID } from 'node:crypto';

import type {
    ConfiguracaoMetaWhatsapp,
    EnviarTemplateWhatsappInput,
    ResultadoEnvioWhatsapp,
    WhatsAppProvider,
} from './whatsapp.contracts.js';
import { PROPOSTAS_TEMPLATES_WHATSAPP } from './whatsapp.templates.js';

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

/** Bloqueio explícito até a etapa de autorização e homologação real da Meta. */
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
