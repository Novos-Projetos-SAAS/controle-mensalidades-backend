import assert from 'node:assert/strict';
import test from 'node:test';

import openApiDocument from '../../src/documentation/openapi.js';

type ObjetoJson = Record<string, unknown>;
type Operacao = ObjetoJson & {
    parameters?: Array<ObjetoJson>;
    requestBody?: ObjetoJson;
    responses?: ObjetoJson;
    security?: unknown;
};

const documento = openApiDocument as unknown as {
    paths: Record<string, Record<string, Operacao>>;
    components: {
        parameters: Record<string, ObjetoJson>;
        schemas: Record<string, ObjetoJson>;
        securitySchemes: Record<string, ObjetoJson>;
    };
};

const operacoesEsperadas: Record<string, string[]> = {
    '/health': ['get'],
    '/auth/login': ['post'],
    '/auth/me': ['get'],
    '/auth/logout': ['post'],
    '/areas-negocio': ['get'],
    '/areas-negocio/{areaNegocioId}/modulos': ['get'],
    '/modulos': ['get'],
    '/contexto': ['get'],
    '/organizacoes/atual': ['get', 'patch'],
    '/usuarios': ['get', 'post'],
    '/usuarios/{usuarioId}': ['patch'],
    '/clientes': ['get', 'post'],
    '/clientes/{clienteId}': ['get', 'patch'],
    '/clientes/{clienteId}/inativar': ['patch'],
    '/clientes/{clienteId}/reativar': ['patch'],
    '/clientes/{clienteId}/whatsapp/aceitar': ['patch'],
    '/clientes/{clienteId}/whatsapp/revogar': ['patch'],
};

const rotasOrganizacionais = Object.keys(operacoesEsperadas).filter(
    (rota) => !rota.startsWith('/auth') && rota !== '/health',
);

function resolverParametro(parametro: ObjetoJson) {
    const ref = parametro.$ref;

    if (typeof ref !== 'string') {
        return parametro;
    }

    const nome = ref.split('/').at(-1);

    return nome ? documento.components.parameters[nome] : undefined;
}

function possuiParametro(operacao: Operacao, nome: string) {
    return (operacao.parameters ?? []).some(
        (parametro) => resolverParametro(parametro)?.name === nome,
    );
}

function propriedadesSchema(nome: string) {
    return documento.components.schemas[nome]?.properties as ObjetoJson;
}

function propriedadeSchema(nomeSchema: string, nomePropriedade: string) {
    return propriedadesSchema(nomeSchema)[nomePropriedade] as ObjetoJson;
}

function correspondeAoPattern(propriedade: ObjetoJson, valor: string) {
    const pattern = propriedade.pattern;

    if (typeof pattern !== 'string') {
        throw new Error('Schema sem pattern para validação.');
    }

    return new RegExp(pattern).test(valor);
}

test('OpenAPI deve documentar exatamente todas as operações registradas na API v1', () => {
    assert.deepEqual(Object.keys(documento.paths).sort(), Object.keys(operacoesEsperadas).sort());

    for (const [rota, metodos] of Object.entries(operacoesEsperadas)) {
        assert.deepEqual(Object.keys(documento.paths[rota] ?? {}).sort(), metodos.sort(), rota);
    }
});

test('OpenAPI deve representar autenticação exclusivamente pelo cookie token', () => {
    assert.deepEqual(documento.components.securitySchemes.cookieAuth, {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
        description: 'JWT armazenado no cookie HTTP-only `token` pelo endpoint de login.',
    });

    assert.equal(documento.paths['/health']?.get?.security, undefined);
    assert.equal(documento.paths['/auth/login']?.post?.security, undefined);
    assert.equal(documento.paths['/auth/logout']?.post?.security, undefined);
    assert.deepEqual(documento.paths['/auth/me']?.get?.security, [{ cookieAuth: [] }]);

    for (const rota of rotasOrganizacionais) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }], rota);
        }
    }
});

test('OpenAPI deve exigir os headers de contexto somente nas rotas correspondentes', () => {
    for (const rota of rotasOrganizacionais) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
        }
    }

    for (const rota of ['/health', '/auth/login', '/auth/me', '/auth/logout']) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), false, rota);
        }
    }

    assert.equal(possuiParametro(documento.paths['/contexto']!.get!, 'x-area-negocio-id'), true);
});

test('OpenAPI deve representar os valores brutos normalizados na criação e edição de clientes', () => {
    const exemplosFormatados = {
        cpf: '123.456.789-01',
        telefone: '(18) 99999-8888',
        cep: '19000-000',
        uf: ' sp ',
    };

    for (const schema of ['CriacaoCliente', 'AtualizacaoCliente']) {
        for (const [campo, valor] of Object.entries(exemplosFormatados)) {
            assert.equal(
                correspondeAoPattern(propriedadeSchema(schema, campo), valor),
                true,
                `${schema}.${campo}`,
            );
        }

        const email = propriedadeSchema(schema, 'email');

        assert.equal(email.format, undefined);
        assert.equal(email.maxLength, undefined);
        assert.match(String(email.description), /trim e lowercase/);
    }

    assert.equal(correspondeAoPattern(propriedadeSchema('CriacaoCliente', 'cpf'), '---'), true);
    assert.equal(correspondeAoPattern(propriedadeSchema('CriacaoCliente', 'telefone'), ''), true);
    assert.equal(correspondeAoPattern(propriedadeSchema('CriacaoCliente', 'cep'), '   '), true);
    assert.equal(correspondeAoPattern(propriedadeSchema('CriacaoCliente', 'uf'), '   '), true);

    for (const campo of [
        'cpf',
        'data_nascimento',
        'telefone',
        'email',
        'sexo',
        'cep',
        'logradouro',
        'numero',
        'complemento',
        'bairro',
        'cidade',
        'uf',
        'observacao',
    ]) {
        const propriedade = propriedadeSchema('AtualizacaoCliente', campo);

        assert.equal(correspondeAoPattern(propriedade, '   '), false, campo);
        assert.deepEqual(propriedade.type, ['string', 'null'], campo);
    }

    const propriedadesAtualizacao = propriedadesSchema('AtualizacaoCliente');
    const camposPermitidos = [
        'nome',
        'cpf',
        'data_nascimento',
        'telefone',
        'email',
        'sexo',
        'cep',
        'logradouro',
        'numero',
        'complemento',
        'bairro',
        'cidade',
        'uf',
        'observacao',
        'areas',
    ];

    assert.deepEqual(Object.keys(propriedadesAtualizacao).sort(), camposPermitidos.sort());

    const schemaAtualizacao = documento.components.schemas.AtualizacaoCliente;

    assert.equal(schemaAtualizacao?.additionalProperties, false);
    assert.match(String(schemaAtualizacao?.description), /omitido significa “não alterar”/);
    assert.match(String(schemaAtualizacao?.description), /`null` significa “limpar”/);

    const respostaNormalizada = propriedadesSchema('ClienteDetalhe');

    assert.equal((respostaNormalizada.cpf as ObjetoJson).pattern, '^\\d{11}$');
    assert.equal((respostaNormalizada.telefone as ObjetoJson).minLength, 8);
    assert.equal((respostaNormalizada.telefone as ObjetoJson).maxLength, 15);
    assert.equal((respostaNormalizada.cep as ObjetoJson).pattern, '^\\d{8}$');
    assert.equal((respostaNormalizada.uf as ObjetoJson).minLength, 2);
    assert.equal((respostaNormalizada.uf as ObjetoJson).maxLength, 2);
    assert.equal((respostaNormalizada.email as ObjetoJson).format, 'email');
    assert.equal((respostaNormalizada.email as ObjetoJson).maxLength, 150);
});

test('OpenAPI deve documentar áreas de negócio como array direto com todas as colunas retornadas', () => {
    const areaNegocio = documento.components.schemas.AreaNegocio;
    const propriedades = areaNegocio?.properties as ObjetoJson;
    const camposEsperados = [
        'id',
        'organizacao_id',
        'nome',
        'codigo',
        'descricao',
        'ativo',
        'criado_em',
        'atualizado_em',
        'inativado_em',
        'deletado_em',
    ];

    assert.equal(areaNegocio?.additionalProperties, false);
    assert.deepEqual(Object.keys(propriedades).sort(), camposEsperados.sort());
    assert.deepEqual([...(areaNegocio?.required as string[])].sort(), camposEsperados.sort());
    assert.equal((propriedades.organizacao_id as ObjetoJson).format, 'uuid');
    assert.equal((propriedades.criado_em as ObjetoJson).format, 'date-time');
    assert.equal((propriedades.atualizado_em as ObjetoJson).format, 'date-time');
    assert.equal((propriedades.inativado_em as ObjetoJson).format, 'date-time');
    assert.deepEqual((propriedades.deletado_em as ObjetoJson).type, ['string', 'null']);
    assert.equal((propriedades.deletado_em as ObjetoJson).format, 'date-time');

    const listaAreas = documento.components.schemas.ListaAreasNegocio;

    assert.equal(listaAreas?.type, 'array');
    assert.deepEqual(listaAreas?.items, { $ref: '#/components/schemas/AreaNegocio' });

    const resposta = documento.paths['/areas-negocio']!.get!.responses!['200'] as ObjetoJson;
    const content = resposta.content as ObjetoJson;
    const json = content['application/json'] as ObjetoJson;

    assert.deepEqual(json.schema, { $ref: '#/components/schemas/ListaAreasNegocio' });
});

test('OpenAPI deve documentar edição e lifecycle de clientes sem permitir ativo no PATCH comum', () => {
    const schemaAtualizacao = documento.components.schemas.AtualizacaoCliente;
    const propriedades = schemaAtualizacao?.properties as ObjetoJson;

    assert.equal(propriedades.ativo, undefined);
    assert.equal(schemaAtualizacao?.minProperties, 1);
    assert.ok(documento.paths['/clientes/{clienteId}/inativar']?.patch);
    assert.ok(documento.paths['/clientes/{clienteId}/reativar']?.patch);
    assert.ok(documento.paths['/clientes/{clienteId}/inativar']?.patch?.responses?.['409']);
    assert.ok(documento.paths['/clientes/{clienteId}/reativar']?.patch?.responses?.['409']);
});

test('OpenAPI deve documentar aceite e opt-out de WhatsApp com contrato seguro', () => {
    const rotas = [
        '/clientes/{clienteId}/whatsapp/aceitar',
        '/clientes/{clienteId}/whatsapp/revogar',
    ];

    for (const rota of rotas) {
        const operacao = documento.paths[rota]!.patch!;

        assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);
        assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true);
        assert.equal(possuiParametro(operacao, 'clienteId'), true);

        const requestBodyContent = operacao.requestBody?.content as ObjetoJson;
        const requestBodyJson = requestBodyContent['application/json'] as ObjetoJson;

        assert.deepEqual(requestBodyJson.schema, {
            $ref: '#/components/schemas/ConsentimentoWhatsappRequest',
        });

        for (const status of ['200', '400', '401', '403', '404', '409']) {
            assert.ok(operacao.responses?.[status], `${rota} ${status}`);
        }
    }

    const body = documento.components.schemas.ConsentimentoWhatsappRequest;
    const propriedadesBody = body?.properties as ObjetoJson;

    assert.equal(body?.additionalProperties, false);
    assert.deepEqual(body?.required, ['origem']);
    assert.deepEqual(Object.keys(propriedadesBody), ['origem']);

    const origem = propriedadesBody.origem as ObjetoJson;

    assert.equal(origem.minLength, 1);
    assert.equal(origem.maxLength, undefined);
    assert.equal(correspondeAoPattern(origem, `   ${'X'.repeat(50)}   `), true);
    assert.equal(correspondeAoPattern(origem, '   '), false);
    assert.equal(correspondeAoPattern(origem, ''), false);
    assert.equal(correspondeAoPattern(origem, 'X'.repeat(51)), false);
    assert.match(String(origem.description), /Após trim, deve possuir entre 1 e 50 caracteres/);

    const estado = documento.components.schemas.EstadoConsentimentoWhatsapp;
    const propriedadesEstado = estado?.properties as ObjetoJson;
    const camposConsentimento = [
        'id',
        'aceite_whatsapp',
        'aceite_whatsapp_em',
        'origem_aceite_whatsapp',
        'opt_out_whatsapp_em',
        'origem_opt_out_whatsapp',
    ];

    assert.equal(estado?.additionalProperties, false);
    assert.deepEqual(Object.keys(propriedadesEstado).sort(), camposConsentimento.sort());
    assert.deepEqual([...(estado?.required as string[])].sort(), camposConsentimento.sort());

    const detalhe = propriedadesSchema('ClienteDetalhe');

    assert.ok(detalhe.opt_out_whatsapp_em);
    assert.ok(detalhe.origem_opt_out_whatsapp);
});

test('OpenAPI não deve conter referências locais quebradas', () => {
    const raiz = openApiDocument as unknown;

    function resolverReferencia(ref: string) {
        return ref
            .slice(2)
            .split('/')
            .reduce<unknown>((valor, parte) => {
                if (typeof valor !== 'object' || valor === null || !(parte in valor)) {
                    return undefined;
                }

                return (valor as ObjetoJson)[parte];
            }, raiz);
    }

    function visitar(valor: unknown): void {
        if (Array.isArray(valor)) {
            valor.forEach(visitar);
            return;
        }

        if (typeof valor !== 'object' || valor === null) {
            return;
        }

        for (const [chave, item] of Object.entries(valor)) {
            if (chave === '$ref' && typeof item === 'string' && item.startsWith('#/')) {
                assert.notEqual(resolverReferencia(item), undefined, item);
            } else {
                visitar(item);
            }
        }
    }

    visitar(raiz);
});
