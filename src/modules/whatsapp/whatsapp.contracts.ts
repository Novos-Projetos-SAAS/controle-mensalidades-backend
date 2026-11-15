export type TipoLembreteWhatsapp = 'D-1' | 'D0' | 'D+3';

export type StatusFinanceiroWhatsapp =
    'ABERTO' | 'PARCIAL' | 'QUITADO' | 'CANCELADO' | 'RECONCILIACAO_PENDENTE';

/** Snapshot fornecido pelo módulo financeiro; nunca é calculado pelo módulo WhatsApp. */
export type SnapshotMensalidadeWhatsapp = {
    mensalidadeId: string;
    organizacaoId: string;
    areaNegocioId: string;
    clienteId: string;
    competencia: string;
    valorTotal: string;
    valorPago: string;
    saldoAtual: string;
    vencimentoEm: string;
    situacao: StatusFinanceiroWhatsapp;
    checkoutUrl: string | null;
    checkoutValor: string | null;
    reconciliacaoPendente: boolean;
    versao: string;
};

export type EscopoMensalidadeWhatsapp = Pick<
    SnapshotMensalidadeWhatsapp,
    'mensalidadeId' | 'organizacaoId' | 'areaNegocioId'
>;

export type EventoFinanceiroWhatsapp =
    | { tipo: 'mensalidade.criada'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'cobranca.criada'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'mensalidade.quitada'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'mensalidade.cancelada'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'pagamento.confirmado'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'pagamento.estornado'; escopo: EscopoMensalidadeWhatsapp }
    | { tipo: 'cobranca.reconciliacao_pendente'; escopo: EscopoMensalidadeWhatsapp };

/** Implementação real ainda depende do contrato/eventos do módulo financeiro. */
export interface FinanceiroWhatsappProvider {
    obterMensalidadeAtual(
        escopo: EscopoMensalidadeWhatsapp,
    ): Promise<SnapshotMensalidadeWhatsapp | null>;
}

export type CredencialMetaReferencia = {
    referencia: string;
};

export type ConfiguracaoMetaWhatsapp = {
    organizacaoId: string;
    areaNegocioId: string | null;
    whatsappBusinessAccountId: string;
    phoneNumberId: string;
    numeroExibido: string;
    nomeNegocio: string;
    credencial: CredencialMetaReferencia | null;
};

export type ParametrosTemplateCobranca = {
    cliente: string;
    empresa: string;
    competencia: string;
    valor: string;
    saldo: string;
    vencimento: string;
    link_pagamento: string;
};

export type EnviarTemplateWhatsappInput = {
    configuracao: ConfiguracaoMetaWhatsapp;
    destinatarioE164: string;
    nomeTemplateMeta: string;
    idioma: string;
    parametros: ParametrosTemplateCobranca;
    idempotencyKey: string;
};

export type ResultadoEnvioWhatsapp = {
    aceito: boolean;
    simulado: boolean;
    identificadorExterno: string | null;
    status: 'ACEITO' | 'FALHOU' | 'RESULTADO_INCERTO';
    codigoErro?: string;
};

export interface WhatsAppProvider {
    readonly mode: 'SIMULADO' | 'META_DESABILITADO';
    validarConfiguracao(
        configuracao: ConfiguracaoMetaWhatsapp,
    ): Promise<{ valido: boolean; motivo?: string }>;
    listarTemplates(
        configuracao: ConfiguracaoMetaWhatsapp,
    ): Promise<Array<{ nome: string; idioma: string; status: string; categoria: string | null }>>;
    enviarTemplate(input: EnviarTemplateWhatsappInput): Promise<ResultadoEnvioWhatsapp>;
}

export type ConfiguracaoPublicaWhatsapp = {
    id: string;
    organizacao_id: string;
    area_negocio_id: string | null;
    provedor: 'META_CLOUD_API';
    whatsapp_business_account_id: string | null;
    phone_number_id: string | null;
    numero_exibido: string | null;
    nome_negocio: string | null;
    situacao_conexao: string;
    situacao_autorizacao: string;
    situacao_templates: string;
    ativo: boolean;
    ativada_em: Date | string | null;
    ultima_validacao_em: Date | string | null;
    motivo_indisponibilidade: string | null;
};
