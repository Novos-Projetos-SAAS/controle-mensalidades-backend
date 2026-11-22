import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../configuration/env.js';
import AppError from '../../shared/errors/AppError.js';
import { criarCofreCredenciaisWhatsapp } from './whatsapp.credentials.js';
import whatsappOnboardingRepository from './whatsapp.onboarding.repository.js';
import {
    ClienteOnboardingMeta,
    ErroOnboardingMeta,
    type AtivosMetaVerificados,
} from './whatsapp.onboarding.meta.js';

export type ConfiguracaoSdkWhatsapp = {
    appId: string;
    configurationId: string;
    graphApiVersion: string;
    permissions: ['whatsapp_business_management', 'whatsapp_business_messaging'];
    responseType: 'code';
    overrideDefaultResponseType: true;
    sessionInfoVersion: 3;
    coexistenceEnabled: boolean;
    featureType?: 'whatsapp_business_app_onboarding';
};

export type ContextoOnboardingWhatsapp = {
    organizacaoId: string;
    areaNegocioId: string;
    usuarioId: string;
};

export type RespostaEmbeddedSignupWhatsapp =
    | { resultado: 'CANCELADO'; correlacaoId: string; state: string }
    | {
          resultado: 'AUTORIZADO';
          correlacaoId: string;
          state: string;
          codigo: string;
          wabaId: string;
          phoneNumberId: string;
          businessId?: string | undefined;
          modoOnboarding: 'CLOUD_API' | 'COEXISTENCIA';
          registrationPin?: string | undefined;
      };

export interface RepositorioOnboardingWhatsapp {
    iniciar(input: {
        organizacaoId: string;
        areaNegocioId: string;
        usuarioId: string;
        stateHash: string;
        expiraEm: Date;
    }): Promise<{ correlacaoId: string; expiraEm: Date }>;
    consumirCallback(input: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
        usuarioId: string;
        stateHash: string;
        codigoHash?: string;
        cancelado: boolean;
        agora: Date;
    }): Promise<{ status: 'CANCELADO' | 'PROCESSANDO' }>;
    registrarAutorizacao(input: {
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string };
        usuarioId: string;
        modo: 'CLOUD_API' | 'COEXISTENCIA';
        ativos: AtivosMetaVerificados;
        credenciais: { accessToken: string; expiresAt: string | null };
        auditoria?: { ip?: string; userAgent?: string };
    }): Promise<{ integracaoId: string; status: 'AUTORIZADO' }>;
    atualizarProvisionamento(input: {
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string };
        integracaoId: string;
        situacaoRegistro: string;
        situacaoWebhook: string;
        codigoErro: string | null;
    }): Promise<{ pronto: boolean; situacaoConexao: string }>;
    marcarFalhaAutorizacao(
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string },
        codigoErro: string,
    ): Promise<void>;
    obterStatus(escopo: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
    }): Promise<{
        correlacaoId: string;
        status: string;
        modoOnboarding: string | null;
        codigoErro: string | null;
        expiraEm: Date | string;
        concluidoEm: Date | string | null;
        integracao: Record<string, unknown> | null;
    }>;
    obterProvisionamento(escopo: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
    }): Promise<{
        onboarding: {
            status: string;
            integracao_whatsapp_id: string | null;
            modo_onboarding: string | null;
        };
        integracao: Record<string, unknown> | null;
        credenciais: { accessToken: string; expiresAt?: string | null } | null;
    }>;
    marcarProvisionamentoErro(
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string },
        codigoErro: string,
    ): Promise<void>;
}

export interface GatewayOnboardingWhatsapp {
    trocarCodigo(codigo: string): Promise<{ accessToken: string; expiresAt: string | null }>;
    validarAtivos(
        token: string,
        messagingAccountId: string,
        phoneNumberId: string,
    ): Promise<AtivosMetaVerificados>;
    confirmarCoexistencia(token: string, phoneNumberId: string): Promise<void>;
    registrarNumero(token: string, phoneNumberId: string, pin: string): Promise<void>;
    assinarWebhooks(token: string, messagingAccountId: string): Promise<void>;
}

type OpcoesServico = {
    repositorio?: RepositorioOnboardingWhatsapp;
    gateway?: GatewayOnboardingWhatsapp;
    appId?: string;
    configurationId?: string;
    appSecret?: string;
    graphApiVersion?: string;
    coexistenceEnabled?: boolean;
    agora?: () => Date;
};

function sha256(valor: string): string {
    return createHash('sha256').update(valor).digest('hex');
}

function erroMeta(erro: unknown): { status: number; codigo: string } {
    if (!(erro instanceof ErroOnboardingMeta)) {
        return { status: 502, codigo: 'META_INDISPONIVEL' };
    }
    if (erro.codigo === 'META_PERMISSAO_INSUFICIENTE') {
        return { status: 403, codigo: erro.codigo };
    }
    if (erro.codigo === 'META_TOKEN_INVALIDO') {
        return { status: 409, codigo: erro.codigo };
    }
    if (erro.codigo === 'META_CODIGO_AUTORIZACAO_INVALIDO') {
        return { status: 400, codigo: erro.codigo };
    }
    if (
        erro.codigo === 'META_CONTA_NAO_AUTORIZADA' ||
        erro.codigo === 'META_NUMERO_NAO_PERTENCE_A_CONTA'
    ) {
        return { status: 403, codigo: erro.codigo };
    }
    if (erro.codigo === 'ATIVO_META_DIVERGENTE') {
        return { status: 409, codigo: erro.codigo };
    }
    return { status: erro.retryable ? 503 : 502, codigo: erro.codigo };
}

export function criarServicoOnboardingWhatsapp(opcoes: OpcoesServico = {}) {
    const repositorio = opcoes.repositorio ?? whatsappOnboardingRepository;
    const coexistenceEnabled =
        opcoes.coexistenceEnabled ?? env.WHATSAPP_META_COEXISTENCE_ENABLED === 'true';
    const appId = opcoes.appId ?? env.WHATSAPP_META_APP_ID;
    const configurationId = opcoes.configurationId ?? env.WHATSAPP_META_CONFIGURATION_ID;
    const appSecret = opcoes.appSecret ?? env.WHATSAPP_META_APP_SECRET;
    const graphApiVersion = opcoes.graphApiVersion ?? env.WHATSAPP_META_GRAPH_API_VERSION;
    const agora = opcoes.agora ?? (() => new Date());
    const gateway =
        opcoes.gateway ??
        new ClienteOnboardingMeta({
            appId: appId ?? '',
            appSecret: appSecret ?? '',
            graphApiVersion,
        });

    function obterConfiguracaoSdk(): ConfiguracaoSdkWhatsapp {
        if (!appId || !configurationId) {
            throw new AppError(
                'Configuração Meta de Embedded Signup indisponível.',
                503,
                'META_EMBEDDED_SIGNUP_NAO_CONFIGURADO',
            );
        }
        return {
            appId,
            configurationId,
            graphApiVersion,
            permissions: ['whatsapp_business_management', 'whatsapp_business_messaging'],
            responseType: 'code',
            overrideDefaultResponseType: true,
            sessionInfoVersion: 3,
            coexistenceEnabled,
            ...(coexistenceEnabled
                ? { featureType: 'whatsapp_business_app_onboarding' as const }
                : {}),
        };
    }

    async function iniciar(contexto: ContextoOnboardingWhatsapp) {
        const sdk = obterConfiguracaoSdk();
        const state = randomBytes(32).toString('base64url');
        const expiraEm = new Date(agora().valueOf() + 10 * 60 * 1000);
        const inicio = await repositorio.iniciar({
            ...contexto,
            stateHash: sha256(state),
            expiraEm,
        });
        return {
            correlacaoId: inicio.correlacaoId,
            state,
            expiraEm: inicio.expiraEm,
            sdk,
        };
    }

    async function concluir(
        contexto: ContextoOnboardingWhatsapp,
        resposta: RespostaEmbeddedSignupWhatsapp,
        auditoria?: { ip?: string; userAgent?: string },
    ) {
        obterConfiguracaoSdk();
        if (resposta.resultado === 'CANCELADO') {
            const resultado = await repositorio.consumirCallback({
                ...contexto,
                correlacaoId: resposta.correlacaoId,
                stateHash: sha256(resposta.state),
                cancelado: true,
                agora: agora(),
            });
            return { status: resultado.status, correlacaoId: resposta.correlacaoId };
        }
        if (!appSecret || !process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY) {
            throw new AppError(
                'Segredos do servidor Meta indisponíveis.',
                503,
                'META_ONBOARDING_BACKEND_NAO_CONFIGURADO',
            );
        }
        try {
            criarCofreCredenciaisWhatsapp();
        } catch {
            throw new AppError(
                'Cofre de credenciais Meta indisponível.',
                503,
                'COFRE_META_NAO_CONFIGURADO',
            );
        }
        if (resposta.modoOnboarding === 'COEXISTENCIA' && !coexistenceEnabled) {
            throw new AppError(
                'Coexistência não está habilitada para este ambiente.',
                400,
                'COEXISTENCIA_NAO_HABILITADA',
            );
        }
        if (
            resposta.modoOnboarding === 'CLOUD_API' &&
            resposta.registrationPin &&
            !/^\d{6}$/.test(resposta.registrationPin)
        ) {
            throw new AppError(
                'PIN de registro deve conter seis dígitos.',
                400,
                'PIN_REGISTRO_INVALIDO',
            );
        }

        await repositorio.consumirCallback({
            ...contexto,
            correlacaoId: resposta.correlacaoId,
            stateHash: sha256(resposta.state),
            codigoHash: sha256(resposta.codigo),
            cancelado: false,
            agora: agora(),
        });

        let token: { accessToken: string; expiresAt: string | null };
        let ativos: AtivosMetaVerificados;
        try {
            token = await gateway.trocarCodigo(resposta.codigo);
            ativos = await gateway.validarAtivos(
                token.accessToken,
                resposta.wabaId,
                resposta.phoneNumberId,
            );
            if (
                resposta.businessId &&
                ativos.metaBusinessId &&
                resposta.businessId !== ativos.metaBusinessId
            ) {
                throw new ErroOnboardingMeta('ATIVO_META_DIVERGENTE');
            }
            if (resposta.modoOnboarding === 'COEXISTENCIA') {
                await gateway.confirmarCoexistencia(token.accessToken, resposta.phoneNumberId);
            }
        } catch (causa) {
            const resultado = erroMeta(causa);
            const codigo =
                causa instanceof ErroOnboardingMeta && causa.codigo === 'ATIVO_META_DIVERGENTE'
                    ? 'ATIVO_META_DIVERGENTE'
                    : resultado.codigo;
            await repositorio.marcarFalhaAutorizacao(
                {
                    correlacaoId: resposta.correlacaoId,
                    organizacaoId: contexto.organizacaoId,
                    areaNegocioId: contexto.areaNegocioId,
                },
                codigo,
            );
            throw new AppError(
                'A autorização Meta não pôde ser confirmada.',
                resultado.status,
                codigo,
            );
        }

        const escopo = {
            correlacaoId: resposta.correlacaoId,
            organizacaoId: contexto.organizacaoId,
            areaNegocioId: contexto.areaNegocioId,
        };
        let autorizacao: { integracaoId: string; status: 'AUTORIZADO' };
        try {
            autorizacao = await repositorio.registrarAutorizacao({
                escopo,
                usuarioId: contexto.usuarioId,
                modo: resposta.modoOnboarding,
                ativos,
                credenciais: token,
                ...(auditoria ? { auditoria } : {}),
            });
        } catch (causa) {
            if (causa instanceof AppError && causa.statusCode < 500) {
                await repositorio.marcarFalhaAutorizacao(
                    escopo,
                    causa.code ?? 'FALHA_AO_GRAVAR_AUTORIZACAO',
                );
            }
            throw causa;
        }
        const status = await continuarProvisionamento(
            contexto,
            resposta.correlacaoId,
            resposta.registrationPin,
        );
        return {
            ...status,
            correlacaoId: resposta.correlacaoId,
            integracaoId: autorizacao.integracaoId,
        };
    }

    async function continuarProvisionamento(
        contexto: ContextoOnboardingWhatsapp,
        correlacaoId: string,
        registrationPin?: string,
    ) {
        const registro = await repositorio.obterProvisionamento({ ...contexto, correlacaoId });
        if (registro.onboarding.status === 'CONCLUIDO') {
            return obterStatus(contexto, correlacaoId);
        }
        if (!registro.integracao || !registro.credenciais) {
            if (
                registro.onboarding.status === 'CANCELADO' ||
                registro.onboarding.status === 'EXPIRADO'
            ) {
                throw new AppError('Onboarding não está ativo.', 409, 'ONBOARDING_NAO_PROCESSAVEL');
            }
            throw new AppError(
                'Credencial do onboarding indisponível.',
                409,
                'CREDENCIAL_META_INDISPONIVEL',
            );
        }
        const integracao = registro.integracao as Record<string, unknown>;
        const token = registro.credenciais.accessToken;
        const modo = String(registro.onboarding.modo_onboarding);
        let situacaoRegistro = String(integracao.situacao_registro);
        let situacaoWebhook = String(integracao.situacao_webhook);

        if (modo === 'CLOUD_API' && situacaoRegistro === 'PENDENTE') {
            if (!registrationPin) {
                await repositorio.marcarProvisionamentoErro(
                    { ...contexto, correlacaoId },
                    'PIN_REGISTRO_NECESSARIO',
                );
                return obterStatus(contexto, correlacaoId);
            }
            if (!/^\d{6}$/.test(registrationPin)) {
                throw new AppError(
                    'PIN de registro deve conter seis dígitos.',
                    400,
                    'PIN_REGISTRO_INVALIDO',
                );
            }
            try {
                await gateway.registrarNumero(
                    token,
                    String(integracao.phone_number_id),
                    registrationPin,
                );
                situacaoRegistro = 'REGISTRADO';
                await repositorio.atualizarProvisionamento({
                    escopo: { ...contexto, correlacaoId },
                    integracaoId: String(registro.onboarding.integracao_whatsapp_id),
                    situacaoRegistro,
                    situacaoWebhook,
                    codigoErro: null,
                });
            } catch (causa) {
                const resultado = erroMeta(causa);
                await repositorio.marcarProvisionamentoErro(
                    { ...contexto, correlacaoId },
                    resultado.codigo,
                );
                return obterStatus(contexto, correlacaoId);
            }
        }

        if (situacaoWebhook !== 'ASSINADO') {
            try {
                await gateway.assinarWebhooks(
                    token,
                    String(
                        integracao.messaging_account_id ?? integracao.whatsapp_business_account_id,
                    ),
                );
                situacaoWebhook = 'ASSINADO';
            } catch (causa) {
                const resultado = erroMeta(causa);
                await repositorio.marcarProvisionamentoErro(
                    { ...contexto, correlacaoId },
                    resultado.codigo,
                );
                return obterStatus(contexto, correlacaoId);
            }
        }

        await repositorio.atualizarProvisionamento({
            escopo: { ...contexto, correlacaoId },
            integracaoId: String(registro.onboarding.integracao_whatsapp_id),
            situacaoRegistro,
            situacaoWebhook,
            codigoErro: null,
        });
        return obterStatus(contexto, correlacaoId);
    }

    async function obterStatus(contexto: ContextoOnboardingWhatsapp, correlacaoId: string) {
        const status = await repositorio.obterStatus({ ...contexto, correlacaoId });
        const integracao = status.integracao;
        const requisitosPendentes: string[] = [];
        if (!integracao) {
            if (status.status === 'FALHA' && status.codigoErro)
                requisitosPendentes.push(status.codigoErro);
            else if (status.status === 'INICIADO' || status.status === 'PROCESSANDO') {
                requisitosPendentes.push('AUTORIZACAO_EM_ANDAMENTO');
            } else if (status.status === 'CANCELADO') {
                requisitosPendentes.push('ONBOARDING_CANCELADO');
            } else if (status.status === 'EXPIRADO') {
                requisitosPendentes.push('INICIAR_NOVO_ONBOARDING');
            }
        } else {
            if (integracao.situacao_autorizacao !== 'AUTORIZADO') {
                requisitosPendentes.push('AUTORIZACAO_META_PENDENTE');
            }
            if (!['REGISTRADO', 'NAO_NECESSARIO'].includes(String(integracao.situacao_registro))) {
                requisitosPendentes.push(
                    status.codigoErro === 'PIN_REGISTRO_NECESSARIO'
                        ? 'PIN_REGISTRO_NECESSARIO'
                        : 'REGISTRO_DO_NUMERO_PENDENTE',
                );
            }
            if (integracao.situacao_webhook !== 'ASSINADO') {
                requisitosPendentes.push('ASSINATURA_DE_WEBHOOK_PENDENTE');
            }
            if (integracao.situacao_templates !== 'VALIDADO') {
                requisitosPendentes.push('TEMPLATES_META_NAO_VALIDADO');
            }
            requisitosPendentes.push('ATIVACAO_OPERACIONAL_NAO_LIBERADA');
        }
        return {
            correlacaoId: status.correlacaoId,
            status: status.status,
            modoOnboarding: status.modoOnboarding,
            erro: status.codigoErro,
            expiraEm: status.expiraEm,
            concluidoEm: status.concluidoEm,
            integracao: integracao
                ? {
                      metaBusinessId: integracao.meta_business_id ?? null,
                      whatsappAccountId: integracao.whatsapp_account_id ?? null,
                      messagingAccountId:
                          integracao.messaging_account_id ??
                          integracao.whatsapp_business_account_id,
                      wabaId: integracao.whatsapp_business_account_id,
                      phoneNumberId: integracao.phone_number_id,
                      numeroExibido: integracao.numero_exibido,
                      nomeNegocio: integracao.nome_negocio,
                      autorizacao: integracao.situacao_autorizacao,
                      registroNumero: integracao.situacao_registro,
                      webhook: integracao.situacao_webhook,
                      templates: integracao.situacao_templates,
                      conexao: integracao.situacao_conexao,
                      ativa: false,
                  }
                : null,
            requisitosPendentes,
            prontaParaEnvio: false,
        };
    }

    return {
        obterConfiguracaoSdk,
        iniciar,
        concluir,
        continuarProvisionamento,
        obterStatus,
    };
}

export default criarServicoOnboardingWhatsapp();
