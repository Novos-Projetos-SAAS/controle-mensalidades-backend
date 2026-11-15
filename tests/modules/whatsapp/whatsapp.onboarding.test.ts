import assert from 'node:assert/strict';
import test, { after } from 'node:test';

import AppError from '../../../src/shared/errors/AppError.js';
import {
    ClienteOnboardingMeta,
    ErroOnboardingMeta,
} from '../../../src/modules/whatsapp/whatsapp.onboarding.meta.js';
import {
    criarServicoOnboardingWhatsapp,
    type ContextoOnboardingWhatsapp,
    type GatewayOnboardingWhatsapp,
    type RepositorioOnboardingWhatsapp,
} from '../../../src/modules/whatsapp/whatsapp.onboarding.service.js';

const chaveAnterior = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 91).toString('base64');
after(() => {
    if (chaveAnterior === undefined) delete process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = chaveAnterior;
});

const contexto: ContextoOnboardingWhatsapp = {
    organizacaoId: 'org-a',
    areaNegocioId: 'area-a',
    usuarioId: 'user-a',
};
const ativos = {
    messagingAccountId: 'messaging-a',
    whatsappAccountId: null,
    metaBusinessId: 'business-a',
    phoneNumberId: 'phone-a',
    numeroExibido: '+5511999999999',
    nomeNegocio: 'Orbe Teste',
};

type OnboardingMemoria = {
    id: string;
    organizacaoId: string;
    areaNegocioId: string;
    usuarioId: string;
    stateHash: string;
    expiraEm: Date;
    status: string;
    codigoHash?: string;
    codigoErro: string | null;
    integracaoId: string | null;
    modo: string | null;
};

class RepositorioMemoria implements RepositorioOnboardingWhatsapp {
    onboardings = new Map<string, OnboardingMemoria>();
    codigos = new Set<string>();
    integracoes = new Map<string, Record<string, unknown> & { organizacao_id: string }>();
    tokens = new Map<string, string>();
    private proximoId = 0;

    async iniciar(input: {
        organizacaoId: string;
        areaNegocioId: string;
        usuarioId: string;
        stateHash: string;
        expiraEm: Date;
    }) {
        const correlacaoId = `correlacao-${++this.proximoId}`;
        this.onboardings.set(correlacaoId, {
            id: correlacaoId,
            ...input,
            status: 'INICIADO',
            codigoErro: null,
            integracaoId: null,
            modo: null,
        });
        return { correlacaoId, expiraEm: input.expiraEm };
    }

    async consumirCallback(input: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
        usuarioId: string;
        stateHash: string;
        codigoHash?: string;
        cancelado: boolean;
        agora: Date;
    }) {
        const item = this.onboardings.get(input.correlacaoId);
        if (
            !item ||
            item.organizacaoId !== input.organizacaoId ||
            item.areaNegocioId !== input.areaNegocioId ||
            item.usuarioId !== input.usuarioId ||
            item.stateHash !== input.stateHash
        ) {
            throw new AppError('Não encontrado.', 404, 'ONBOARDING_NAO_ENCONTRADO');
        }
        if (item.status !== 'INICIADO') {
            throw new AppError('Já consumido.', 409, 'ONBOARDING_JA_CONSUMIDO');
        }
        if (item.expiraEm <= input.agora) {
            item.status = 'EXPIRADO';
            throw new AppError('Expirado.', 410, 'ONBOARDING_EXPIRADO');
        }
        if (input.cancelado) {
            item.status = 'CANCELADO';
            return { status: 'CANCELADO' as const };
        }
        if (!input.codigoHash || this.codigos.has(input.codigoHash)) {
            throw new AppError('Código repetido.', 409, 'CODIGO_AUTORIZACAO_REUTILIZADO');
        }
        this.codigos.add(input.codigoHash);
        item.codigoHash = input.codigoHash;
        item.status = 'PROCESSANDO';
        return { status: 'PROCESSANDO' as const };
    }

    async registrarAutorizacao(input: {
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string };
        usuarioId: string;
        modo: 'CLOUD_API' | 'COEXISTENCIA';
        ativos: typeof ativos;
        credenciais: { accessToken: string; expiresAt: string | null };
        auditoria?: { ip?: string; userAgent?: string };
    }) {
        const onboarding = this.onboardings.get(input.escopo.correlacaoId)!;
        for (const integracao of this.integracoes.values()) {
            const mesmaOrganizacao = integracao.organizacao_id === input.escopo.organizacaoId;
            const telefoneConflitante = integracao.phone_number_id === input.ativos.phoneNumberId;
            const contaDeOutraOrganizacao =
                !mesmaOrganizacao &&
                integracao.messaging_account_id === input.ativos.messagingAccountId;
            if (telefoneConflitante || contaDeOutraOrganizacao) {
                throw new AppError(
                    'Ativo vinculado.',
                    409,
                    mesmaOrganizacao
                        ? 'NUMERO_META_JA_VINCULADO_NA_ORGANIZACAO'
                        : 'ATIVO_META_VINCULADO_OUTRA_ORGANIZACAO',
                );
            }
        }
        const integracaoId = `integracao-${input.escopo.correlacaoId}`;
        onboarding.integracaoId = integracaoId;
        onboarding.status = 'AUTORIZADO';
        onboarding.modo = input.modo;
        this.tokens.set(integracaoId, input.credenciais.accessToken);
        this.integracoes.set(integracaoId, {
            organizacao_id: input.escopo.organizacaoId,
            messaging_account_id: input.ativos.messagingAccountId,
            whatsapp_business_account_id: input.ativos.messagingAccountId,
            phone_number_id: input.ativos.phoneNumberId,
            meta_business_id: input.ativos.metaBusinessId,
            whatsapp_account_id: input.ativos.whatsappAccountId,
            numero_exibido: input.ativos.numeroExibido,
            nome_negocio: input.ativos.nomeNegocio,
            situacao_autorizacao: 'AUTORIZADO',
            situacao_registro: input.modo === 'COEXISTENCIA' ? 'NAO_NECESSARIO' : 'PENDENTE',
            situacao_webhook: 'PENDENTE',
            situacao_templates: 'NAO_VALIDADO',
            situacao_conexao: 'PENDENTE_REGISTRO',
        });
        return { integracaoId, status: 'AUTORIZADO' as const };
    }

    async atualizarProvisionamento(input: {
        escopo: { correlacaoId: string; organizacaoId: string; areaNegocioId: string };
        integracaoId: string;
        situacaoRegistro: string;
        situacaoWebhook: string;
        codigoErro: string | null;
    }) {
        const onboarding = this.onboardings.get(input.escopo.correlacaoId)!;
        const integracao = this.integracoes.get(input.integracaoId)!;
        integracao.situacao_registro = input.situacaoRegistro;
        integracao.situacao_webhook = input.situacaoWebhook;
        integracao.situacao_conexao = 'PENDENTE_TEMPLATES';
        onboarding.status = 'CONCLUIDO';
        onboarding.codigoErro = input.codigoErro;
        return { pronto: true, situacaoConexao: 'PENDENTE_TEMPLATES' };
    }

    async marcarFalhaAutorizacao(escopo: { correlacaoId: string }, codigoErro: string) {
        const onboarding = this.onboardings.get(escopo.correlacaoId)!;
        onboarding.status = 'FALHA';
        onboarding.codigoErro = codigoErro;
    }

    async obterStatus(escopo: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
    }) {
        const item = this.onboardings.get(escopo.correlacaoId);
        if (
            !item ||
            item.organizacaoId !== escopo.organizacaoId ||
            item.areaNegocioId !== escopo.areaNegocioId
        ) {
            throw new AppError('Não encontrado.', 404, 'ONBOARDING_NAO_ENCONTRADO');
        }
        const integracao = item.integracaoId ? this.integracoes.get(item.integracaoId) : null;
        return {
            correlacaoId: item.id,
            status: item.status,
            modoOnboarding: item.modo,
            codigoErro: item.codigoErro,
            expiraEm: item.expiraEm,
            concluidoEm: item.status === 'CANCELADO' || item.status === 'FALHA' ? new Date() : null,
            integracao: integracao ?? null,
        };
    }

    async obterProvisionamento(escopo: {
        correlacaoId: string;
        organizacaoId: string;
        areaNegocioId: string;
    }) {
        const item = this.onboardings.get(escopo.correlacaoId);
        if (
            !item ||
            item.organizacaoId !== escopo.organizacaoId ||
            item.areaNegocioId !== escopo.areaNegocioId
        ) {
            throw new AppError('Não encontrado.', 404, 'ONBOARDING_NAO_ENCONTRADO');
        }
        const integracao = item.integracaoId
            ? (this.integracoes.get(item.integracaoId) ?? null)
            : null;
        return {
            onboarding: {
                status: item.status,
                integracao_whatsapp_id: item.integracaoId,
                modo_onboarding: item.modo,
            },
            integracao,
            credenciais: item.integracaoId
                ? { accessToken: this.tokens.get(item.integracaoId)! }
                : null,
        };
    }

    async marcarProvisionamentoErro(escopo: { correlacaoId: string }, codigoErro: string) {
        const onboarding = this.onboardings.get(escopo.correlacaoId)!;
        onboarding.status = 'PENDENTE_ACAO';
        onboarding.codigoErro = codigoErro;
    }
}

function montar(cenarios: { agora?: () => Date; falhaTroca?: Error } = {}) {
    const repositorio = new RepositorioMemoria();
    const chamadas = { troca: 0, registro: 0, coexistencia: 0, webhook: 0 };
    const gateway: GatewayOnboardingWhatsapp = {
        async trocarCodigo() {
            chamadas.troca += 1;
            if (cenarios.falhaTroca) throw cenarios.falhaTroca;
            return { accessToken: 'token-meta-de-teste-com-tamanho-suficiente', expiresAt: null };
        },
        async validarAtivos() {
            return ativos;
        },
        async confirmarCoexistencia() {
            chamadas.coexistencia += 1;
        },
        async registrarNumero() {
            chamadas.registro += 1;
        },
        async assinarWebhooks() {
            chamadas.webhook += 1;
        },
    };
    const service = criarServicoOnboardingWhatsapp({
        repositorio,
        gateway,
        appId: 'app-id-fixture',
        configurationId: 'configuration-id-fixture',
        appSecret: 'app-secret-fixture',
        graphApiVersion: 'v27.0',
        ...(cenarios.agora ? { agora: cenarios.agora } : {}),
    });
    return { service, repositorio, chamadas };
}

async function iniciar(service: ReturnType<typeof criarServicoOnboardingWhatsapp>, ctx = contexto) {
    return service.iniciar(ctx);
}

function callback(
    iniciado: Awaited<ReturnType<typeof iniciar>>,
    overrides: Record<string, unknown> = {},
) {
    return {
        resultado: 'AUTORIZADO' as const,
        correlacaoId: iniciado.correlacaoId,
        state: iniciado.state,
        codigo: 'codigo-autorizacao-fixture-123456',
        wabaId: ativos.messagingAccountId,
        phoneNumberId: ativos.phoneNumberId,
        modoOnboarding: 'CLOUD_API' as const,
        registrationPin: '123456',
        ...overrides,
    };
}

test('onboarding simulado troca código sem retornar token e mantém envio desativado', async () => {
    const { service, chamadas, repositorio } = montar();
    const iniciado = await iniciar(service);
    const resultado = await service.concluir(contexto, callback(iniciado));

    assert.equal(resultado.status, 'CONCLUIDO');
    assert.equal(resultado.prontaParaEnvio, false);
    assert.equal(resultado.integracao?.autorizacao, 'AUTORIZADO');
    assert.equal(resultado.integracao?.registroNumero, 'REGISTRADO');
    assert.equal(resultado.integracao?.webhook, 'ASSINADO');
    assert.equal(resultado.integracao?.templates, 'NAO_VALIDADO');
    assert.equal(chamadas.troca, 1);
    assert.equal(chamadas.registro, 1);
    assert.equal(chamadas.webhook, 1);
    assert.equal(JSON.stringify(resultado).includes('token-meta'), false);
    assert.equal(repositorio.tokens.size, 1);
});

test('cancelamento oficial não troca código nem inicia provisionamento', async () => {
    const { service, chamadas } = montar();
    const iniciado = await iniciar(service);
    const resultado = await service.concluir(contexto, {
        resultado: 'CANCELADO',
        correlacaoId: iniciado.correlacaoId,
        state: iniciado.state,
    });
    assert.equal(resultado.status, 'CANCELADO');
    assert.equal(chamadas.troca, 0);
});

test('state expirado é recusado e fica marcado como expirado', async () => {
    let instante = new Date('2026-11-15T12:00:00.000Z');
    const { service, repositorio } = montar({ agora: () => instante });
    const iniciado = await iniciar(service);
    instante = new Date(instante.valueOf() + 11 * 60 * 1000);

    await assert.rejects(service.concluir(contexto, callback(iniciado)), (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.statusCode, 410);
        assert.equal(erro.code, 'ONBOARDING_EXPIRADO');
        return true;
    });
    assert.equal(repositorio.onboardings.get(iniciado.correlacaoId)?.status, 'EXPIRADO');
});

test('código de autorização repetido é rejeitado após primeiro uso', async () => {
    const { service } = montar();
    const primeiro = await iniciar(service);
    await service.concluir(contexto, callback(primeiro));
    const segundo = await iniciar(service);

    await assert.rejects(service.concluir(contexto, callback(segundo)), (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.statusCode, 409);
        assert.equal(erro.code, 'CODIGO_AUTORIZACAO_REUTILIZADO');
        return true;
    });
});

test('correlação não pode ser concluída por usuário, organização ou área diferentes', async () => {
    const { service, chamadas } = montar();
    const iniciado = await iniciar(service);
    await assert.rejects(
        service.concluir(
            { ...contexto, organizacaoId: 'org-b', areaNegocioId: 'area-b' },
            callback(iniciado),
        ),
        (erro: unknown) => erro instanceof AppError && erro.statusCode === 404,
    );
    assert.equal(chamadas.troca, 0);
});

test('state incorreto falha como proteção CSRF sem consumir autorização', async () => {
    const { service, chamadas, repositorio } = montar();
    const iniciado = await iniciar(service);
    await assert.rejects(
        service.concluir(
            contexto,
            callback(iniciado, { state: 'state-forjado-' + 'x'.repeat(32) }),
        ),
        (erro: unknown) => erro instanceof AppError && erro.statusCode === 404,
    );
    assert.equal(chamadas.troca, 0);
    assert.equal(repositorio.onboardings.get(iniciado.correlacaoId)?.status, 'INICIADO');
});

test('erro de permissão Meta retorna código seguro sem detalhe da resposta externa', async () => {
    const segredoExterno = 'detalhe-meta-que-nao-pode-vazar';
    const { service, repositorio } = montar({
        falhaTroca: new ErroOnboardingMeta('META_PERMISSAO_INSUFICIENTE'),
    });
    const iniciado = await iniciar(service);
    await assert.rejects(service.concluir(contexto, callback(iniciado)), (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.statusCode, 403);
        assert.equal(erro.code, 'META_PERMISSAO_INSUFICIENTE');
        assert.equal(erro.message.includes(segredoExterno), false);
        return true;
    });
    assert.equal(repositorio.onboardings.get(iniciado.correlacaoId)?.status, 'FALHA');
});

test('coexistência confirmada pula registro padrão e ainda assina webhooks', async () => {
    const repositorio = new RepositorioMemoria();
    const chamadas = { troca: 0, registro: 0, coexistencia: 0, webhook: 0 };
    const gateway: GatewayOnboardingWhatsapp = {
        async trocarCodigo() {
            chamadas.troca += 1;
            return { accessToken: 'token-meta-de-teste-com-tamanho-suficiente', expiresAt: null };
        },
        async validarAtivos() {
            return ativos;
        },
        async confirmarCoexistencia() {
            chamadas.coexistencia += 1;
        },
        async registrarNumero() {
            chamadas.registro += 1;
        },
        async assinarWebhooks() {
            chamadas.webhook += 1;
        },
    };
    const service = criarServicoOnboardingWhatsapp({
        repositorio,
        gateway,
        appId: 'app-id-fixture',
        configurationId: 'configuration-id-fixture',
        appSecret: 'app-secret-fixture',
        graphApiVersion: 'v27.0',
        coexistenceEnabled: true,
    });
    const iniciado = await iniciar(service);
    const resultado = await service.concluir(
        contexto,
        callback(iniciado, {
            modoOnboarding: 'COEXISTENCIA',
            registrationPin: undefined,
        }),
    );

    assert.equal(resultado.status, 'CONCLUIDO');
    assert.equal(resultado.integracao?.registroNumero, 'NAO_NECESSARIO');
    assert.equal(chamadas.coexistencia, 1);
    assert.equal(chamadas.registro, 0);
    assert.equal(chamadas.webhook, 1);
});

test('cliente Graph simulado troca código, confirma ativos, registra número e assina webhook', async () => {
    const requisicoes: Array<{ url: URL; init: RequestInit }> = [];
    const cliente = new ClienteOnboardingMeta({
        appId: 'app-id-fixture',
        appSecret: 'app-secret-fixture',
        graphApiVersion: 'v27.0',
        fetcher: async (input, init = {}) => {
            const url = new URL(String(input));
            requisicoes.push({ url, init });
            let body: Record<string, unknown>;
            if (url.pathname.endsWith('/oauth/access_token')) {
                body = {
                    access_token: 'token-meta-de-teste-com-tamanho-suficiente',
                    expires_in: 3600,
                };
            } else if (url.pathname.endsWith('/phone_numbers')) {
                body = {
                    data: [
                        {
                            id: ativos.phoneNumberId,
                            display_phone_number: ativos.numeroExibido,
                            verified_name: ativos.nomeNegocio,
                        },
                    ],
                };
            } else if (
                url.pathname.endsWith('/register') ||
                url.pathname.endsWith('/subscribed_apps')
            ) {
                body = { success: true };
            } else if (url.searchParams.get('fields') === 'id,is_on_biz_app,platform_type') {
                body = {
                    id: ativos.phoneNumberId,
                    is_on_biz_app: true,
                    platform_type: 'CLOUD_API',
                };
            } else {
                body = {
                    id: ativos.messagingAccountId,
                    name: 'Orbe',
                    owner_business_info: { id: ativos.metaBusinessId },
                };
            }
            return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
    });

    const token = await cliente.trocarCodigo('codigo-fixture-authorization');
    const ativosVerificados = await cliente.validarAtivos(
        token.accessToken,
        ativos.messagingAccountId,
        ativos.phoneNumberId,
    );
    await cliente.confirmarCoexistencia(token.accessToken, ativos.phoneNumberId);
    await cliente.registrarNumero(token.accessToken, ativos.phoneNumberId, '123456');
    await cliente.assinarWebhooks(token.accessToken, ativos.messagingAccountId);

    assert.equal(token.expiresAt !== null, true);
    assert.equal(ativosVerificados.messagingAccountId, ativos.messagingAccountId);
    assert.equal(ativosVerificados.phoneNumberId, ativos.phoneNumberId);
    assert.equal(ativosVerificados.metaBusinessId, ativos.metaBusinessId);
    const troca = requisicoes[0]!;
    assert.equal(troca.url.pathname, '/v27.0/oauth/access_token');
    assert.equal(troca.url.searchParams.get('client_id'), 'app-id-fixture');
    assert.equal(troca.url.searchParams.get('client_secret'), 'app-secret-fixture');
    assert.equal(requisicoes.filter(({ url }) => url.pathname.endsWith('/register')).length, 1);
    assert.equal(
        requisicoes.filter(({ url }) => url.pathname.endsWith('/subscribed_apps')).length,
        1,
    );
    const registro = requisicoes.find(({ url }) => url.pathname.endsWith('/register'))!;
    assert.deepEqual(JSON.parse(String(registro.init.body)), {
        messaging_product: 'whatsapp',
        pin: '123456',
    });
    const requisicoesComToken = requisicoes.filter(
        ({ url }) => !url.pathname.endsWith('/oauth/access_token'),
    );
    assert.equal(
        requisicoesComToken.every(
            ({ init }) =>
                (init.headers as Record<string, string>).Authorization ===
                'Bearer token-meta-de-teste-com-tamanho-suficiente',
        ),
        true,
    );
});

test('erro HTTP Graph é reduzido a código seguro e não causa retries', async () => {
    let tentativas = 0;
    const cliente = new ClienteOnboardingMeta({
        appId: 'app-id-fixture',
        appSecret: 'app-secret-fixture',
        graphApiVersion: 'v27.0',
        fetcher: async () => {
            tentativas += 1;
            return new Response(
                JSON.stringify({ error: { code: 10, message: 'mensagem-privada-da-meta' } }),
                { status: 403, headers: { 'content-type': 'application/json' } },
            );
        },
    });

    await assert.rejects(cliente.trocarCodigo('codigo-fixture-authorization'), (erro: unknown) => {
        assert.ok(erro instanceof ErroOnboardingMeta);
        assert.equal(erro.codigo, 'META_PERMISSAO_INSUFICIENTE');
        assert.equal(erro.message.includes('mensagem-privada-da-meta'), false);
        return true;
    });
    assert.equal(tentativas, 1);
});
