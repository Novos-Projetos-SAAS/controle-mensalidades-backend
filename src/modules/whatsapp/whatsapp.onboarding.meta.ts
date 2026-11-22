export type TokenEmpresaMeta = { accessToken: string; expiresAt: string | null };

export type AtivosMetaVerificados = {
    messagingAccountId: string;
    whatsappAccountId: string | null;
    metaBusinessId: string | null;
    phoneNumberId: string;
    numeroExibido: string;
    nomeNegocio: string;
};

export class ErroOnboardingMeta extends Error {
    constructor(
        readonly codigo: string,
        readonly retryable = false,
    ) {
        super(codigo);
        this.name = 'ErroOnboardingMeta';
    }
}

type JsonMeta = {
    id?: unknown;
    name?: unknown;
    access_token?: unknown;
    expires_in?: unknown;
    display_phone_number?: unknown;
    verified_name?: unknown;
    data?: unknown;
    paging?: { next?: unknown };
    success?: unknown;
    is_on_biz_app?: unknown;
    platform_type?: unknown;
    owner_business_info?: { id?: unknown };
    error?: { code?: unknown };
};

type OpcoesClienteMeta = {
    appId: string;
    appSecret: string;
    graphApiVersion: string;
    fetcher?: typeof fetch;
    timeoutMs?: number;
};

function erroHttp(status: number, dados: JsonMeta | null): ErroOnboardingMeta {
    const code = dados?.error?.code;
    if (code === 190 || status === 401) {
        return new ErroOnboardingMeta('META_TOKEN_INVALIDO');
    }
    if (code === 10 || code === 200 || status === 403) {
        return new ErroOnboardingMeta('META_PERMISSAO_INSUFICIENTE');
    }
    if (typeof code === 'number' && Number.isInteger(code)) {
        return new ErroOnboardingMeta(`META_API_${code}`, status >= 500 || status === 408);
    }
    return new ErroOnboardingMeta(`META_HTTP_${status}`, status >= 500 || status === 408);
}

async function jsonSeguro(resposta: Response): Promise<JsonMeta | null> {
    return resposta
        .json()
        .then((body: unknown) => (body && typeof body === 'object' ? (body as JsonMeta) : null))
        .catch(() => null);
}

/** Graph API gateway for Embedded Signup; requests are injectable and never retried. */
export class ClienteOnboardingMeta {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly opcoes: OpcoesClienteMeta) {
        if (!/^v\d+\.\d+$/.test(opcoes.graphApiVersion)) {
            throw new Error('VERSAO_GRAPH_META_INVALIDA');
        }
        this.fetcher = opcoes.fetcher ?? fetch;
        this.timeoutMs = opcoes.timeoutMs ?? 10_000;
    }

    async trocarCodigo(codigo: string): Promise<TokenEmpresaMeta> {
        const url = this.url('/oauth/access_token');
        url.searchParams.set('client_id', this.opcoes.appId);
        url.searchParams.set('client_secret', this.opcoes.appSecret);
        url.searchParams.set('code', codigo);
        const { resposta, dados } = await this.solicitar(url, { method: 'GET' });
        if (!resposta.ok) {
            if (resposta.status === 400)
                throw new ErroOnboardingMeta('META_CODIGO_AUTORIZACAO_INVALIDO');
            throw erroHttp(resposta.status, dados);
        }
        if (typeof dados?.access_token !== 'string' || dados.access_token.length < 20) {
            throw new ErroOnboardingMeta('META_RESPOSTA_TOKEN_INVALIDA');
        }
        const expiresIn = dados.expires_in;
        const expiresAt =
            typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
                ? new Date(Date.now() + expiresIn * 1000).toISOString()
                : null;
        return { accessToken: dados.access_token, expiresAt };
    }

    async validarAtivos(
        token: string,
        messagingAccountId: string,
        phoneNumberId: string,
    ): Promise<AtivosMetaVerificados> {
        const conta = await this.obter(
            `/${encodeURIComponent(messagingAccountId)}?fields=id,name,owner_business_info`,
            token,
        );
        if (conta?.id !== messagingAccountId) {
            throw new ErroOnboardingMeta('META_CONTA_NAO_AUTORIZADA');
        }

        let caminho: string | null =
            `/${encodeURIComponent(messagingAccountId)}/phone_numbers?fields=id,display_phone_number,verified_name&limit=100`;
        let numero: JsonMeta | null = null;
        let paginas = 0;
        while (caminho && paginas < 20 && !numero) {
            const pagina = await this.obter(caminho, token);
            const lista = Array.isArray(pagina?.data) ? pagina.data : [];
            numero =
                (lista.find(
                    (item) =>
                        item && typeof item === 'object' && (item as JsonMeta).id === phoneNumberId,
                ) as JsonMeta | undefined) ?? null;
            const proxima = pagina?.paging?.next;
            if (typeof proxima !== 'string') {
                caminho = null;
            } else {
                const urlProxima = new URL(proxima);
                if (urlProxima.origin !== 'https://graph.facebook.com') {
                    throw new ErroOnboardingMeta('META_PAGINACAO_INVALIDA');
                }
                caminho = `${urlProxima.pathname}${urlProxima.search}`;
            }
            paginas += 1;
        }
        if (!numero || numero.id !== phoneNumberId) {
            throw new ErroOnboardingMeta('META_NUMERO_NAO_PERTENCE_A_CONTA');
        }
        return {
            messagingAccountId,
            whatsappAccountId: null,
            metaBusinessId:
                conta.owner_business_info && typeof conta.owner_business_info.id === 'string'
                    ? conta.owner_business_info.id
                    : null,
            phoneNumberId,
            numeroExibido:
                typeof numero.display_phone_number === 'string' ? numero.display_phone_number : '',
            nomeNegocio: typeof numero.verified_name === 'string' ? numero.verified_name : '',
        };
    }

    async confirmarCoexistencia(token: string, phoneNumberId: string): Promise<void> {
        const numero = await this.obter(
            `/${encodeURIComponent(phoneNumberId)}?fields=id,is_on_biz_app,platform_type`,
            token,
        );
        if (
            numero.id !== phoneNumberId ||
            numero.is_on_biz_app !== true ||
            numero.platform_type !== 'CLOUD_API'
        ) {
            throw new ErroOnboardingMeta('META_COEXISTENCIA_NAO_CONFIRMADA');
        }
    }

    async registrarNumero(token: string, phoneNumberId: string, pin: string): Promise<void> {
        const { resposta, dados } = await this.solicitar(
            this.url(`/${encodeURIComponent(phoneNumberId)}/register`),
            {
                method: 'POST',
                token,
                body: { messaging_product: 'whatsapp', pin },
            },
        );
        if (!resposta.ok) throw erroHttp(resposta.status, dados);
        if (dados?.success !== true) throw new ErroOnboardingMeta('META_REGISTRO_NAO_CONFIRMADO');
    }

    async assinarWebhooks(token: string, messagingAccountId: string): Promise<void> {
        const { resposta, dados } = await this.solicitar(
            this.url(`/${encodeURIComponent(messagingAccountId)}/subscribed_apps`),
            { method: 'POST', token, body: {} },
        );
        if (!resposta.ok) throw erroHttp(resposta.status, dados);
        if (dados?.success !== true) throw new ErroOnboardingMeta('META_WEBHOOK_NAO_CONFIRMADO');
    }

    private async obter(path: string, token: string): Promise<JsonMeta> {
        const { resposta, dados } = await this.solicitar(this.url(path), { method: 'GET', token });
        if (!resposta.ok) throw erroHttp(resposta.status, dados);
        if (!dados) throw new ErroOnboardingMeta('META_RESPOSTA_INVALIDA');
        return dados;
    }

    private url(path: string): URL {
        return new URL(`https://graph.facebook.com/${this.opcoes.graphApiVersion}${path}`);
    }

    private async solicitar(
        url: URL,
        input: { method: 'GET' | 'POST'; token?: string; body?: unknown },
    ) {
        let resposta: Response;
        try {
            resposta = await this.fetcher(url, {
                method: input.method,
                headers: {
                    ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
                    ...(input.body ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(input.body ? { body: JSON.stringify(input.body) } : {}),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch {
            throw new ErroOnboardingMeta('META_INDISPONIVEL', true);
        }
        const dados = await jsonSeguro(resposta);
        return { resposta, dados };
    }
}
