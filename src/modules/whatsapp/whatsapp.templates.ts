import type { ParametrosTemplateCobranca, TipoLembreteWhatsapp } from './whatsapp.contracts.js';

export type PropostaTemplateWhatsapp = {
    chave: string;
    tipo: TipoLembreteWhatsapp;
    nome: string;
    conteudo: string;
    variaveis: readonly (keyof ParametrosTemplateCobranca)[];
    idioma: 'pt_BR';
    statusMeta: 'NAO_SUBMETIDO';
    aprovadoMeta: false;
};

export const PROPOSTAS_TEMPLATES_WHATSAPP: readonly PropostaTemplateWhatsapp[] = [
    {
        chave: 'cobranca_vespera',
        tipo: 'D-1',
        nome: 'Cobrança véspera',
        conteudo:
            'Olá, {{cliente}}! Sua mensalidade de {{empresa}}, no valor de {{valor}}, vence amanhã, {{vencimento}}. Para pagar: {{link_pagamento}}.',
        variaveis: ['cliente', 'empresa', 'valor', 'vencimento', 'link_pagamento'],
        idioma: 'pt_BR',
        statusMeta: 'NAO_SUBMETIDO',
        aprovadoMeta: false,
    },
    {
        chave: 'cobranca_vencimento',
        tipo: 'D0',
        nome: 'Cobrança vencimento',
        conteudo:
            'Olá, {{cliente}}! Sua mensalidade de {{empresa}} vence hoje. Valor em aberto: {{valor}}. Link para pagamento: {{link_pagamento}}.',
        variaveis: ['cliente', 'empresa', 'valor', 'link_pagamento'],
        idioma: 'pt_BR',
        statusMeta: 'NAO_SUBMETIDO',
        aprovadoMeta: false,
    },
    {
        chave: 'cobranca_atraso_3d',
        tipo: 'D+3',
        nome: 'Cobrança após 3 dias',
        conteudo:
            'Olá, {{cliente}}! Sua mensalidade de {{empresa}}, vencida em {{vencimento}}, ainda apresenta saldo de {{saldo}}. Para regularizar: {{link_pagamento}}.',
        variaveis: ['cliente', 'empresa', 'vencimento', 'saldo', 'link_pagamento'],
        idioma: 'pt_BR',
        statusMeta: 'NAO_SUBMETIDO',
        aprovadoMeta: false,
    },
];

const PLACEHOLDER = /{{([a-z_]+)}}/g;
const VARIAVEIS_PERMITIDAS = new Set<keyof ParametrosTemplateCobranca>([
    'cliente',
    'empresa',
    'competencia',
    'valor',
    'saldo',
    'vencimento',
    'link_pagamento',
]);

export function renderizarTemplateCobranca(
    conteudo: string,
    parametros: ParametrosTemplateCobranca,
): string {
    const usadas = new Set<string>();
    const renderizada = conteudo.replace(PLACEHOLDER, (_match, chave: string) => {
        if (!VARIAVEIS_PERMITIDAS.has(chave as keyof ParametrosTemplateCobranca)) {
            throw new Error('TEMPLATE_VARIAVEL_NAO_PERMITIDA');
        }
        const valor = parametros[chave as keyof ParametrosTemplateCobranca];
        if (typeof valor !== 'string' || !valor.trim()) {
            throw new Error('TEMPLATE_PARAMETRO_AUSENTE');
        }
        usadas.add(chave);
        return valor;
    });

    if (usadas.size === 0 || /{{|}}/.test(renderizada)) {
        throw new Error('TEMPLATE_INCOMPLETO');
    }

    return renderizada;
}

export function obterPropostaTemplate(tipo: TipoLembreteWhatsapp) {
    return PROPOSTAS_TEMPLATES_WHATSAPP.find((template) => template.tipo === tipo);
}
