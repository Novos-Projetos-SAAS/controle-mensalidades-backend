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
    '/servicos': ['get', 'post'],
    '/servicos/{servicoId}': ['get', 'patch'],
    '/servicos/{servicoId}/inativar': ['patch'],
    '/servicos/{servicoId}/reativar': ['patch'],
    '/profissionais': ['get', 'post'],
    '/profissionais/{profissionalId}': ['get', 'patch'],
    '/profissionais/{profissionalId}/inativar': ['patch'],
    '/profissionais/{profissionalId}/reativar': ['patch'],
    '/profissionais/{profissionalId}/acesso-clinico': ['patch'],
    '/profissionais/{profissionalId}/usuario': ['get', 'patch'],
    '/agendamentos': ['get', 'post'],
    '/agendamentos/{agendamentoId}': ['get', 'patch'],
    '/agendamentos/{agendamentoId}/confirmar': ['patch'],
    '/agendamentos/{agendamentoId}/concluir': ['patch'],
    '/agendamentos/{agendamentoId}/cancelar': ['patch'],
    '/financeiro/planos': ['get', 'post'],
    '/financeiro/planos/{planoId}': ['get'],
    '/financeiro/assinaturas': ['get', 'post'],
    '/financeiro/assinaturas/{assinaturaId}': ['get'],
    '/financeiro/assinaturas/{assinaturaId}/mensalidades': ['post'],
    '/financeiro/mensalidades': ['get'],
    '/financeiro/mensalidades/{mensalidadeId}': ['get'],
    '/financeiro/mensalidades/{mensalidadeId}/recebimentos': ['post'],
    '/financeiro/resumo': ['get'],
    '/whatsapp/onboarding/configuracao-sdk': ['get'],
    '/whatsapp/onboarding/iniciar': ['post'],
    '/whatsapp/onboarding/concluir': ['post'],
    '/whatsapp/onboarding/{correlacaoId}/continuar': ['post'],
    '/whatsapp/onboarding/{correlacaoId}': ['get'],
    '/whatsapp/webhook': ['get', 'post'],
    '/whatsapp/configuracoes': ['get', 'put'],
    '/whatsapp/modelos': ['get'],
    '/whatsapp/tarefas': ['get'],
    '/whatsapp/mensagens': ['get'],
    '/whatsapp/metricas': ['get'],
};

const rotasOrganizacionais = Object.keys(operacoesEsperadas).filter(
    (rota) => !rota.startsWith('/auth') && rota !== '/health' && rota !== '/whatsapp/webhook',
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

    for (const rota of [
        '/servicos',
        '/servicos/{servicoId}',
        '/servicos/{servicoId}/inativar',
        '/servicos/{servicoId}/reativar',
        '/profissionais',
        '/profissionais/{profissionalId}',
        '/profissionais/{profissionalId}/inativar',
        '/profissionais/{profissionalId}/reativar',
        '/profissionais/{profissionalId}/usuario',
        '/financeiro/planos',
        '/financeiro/planos/{planoId}',
        '/financeiro/assinaturas',
        '/financeiro/assinaturas/{assinaturaId}',
        '/financeiro/assinaturas/{assinaturaId}/mensalidades',
        '/financeiro/mensalidades',
        '/financeiro/mensalidades/{mensalidadeId}',
        '/financeiro/mensalidades/{mensalidadeId}/recebimentos',
        '/financeiro/resumo',
        '/whatsapp/modelos',
        '/whatsapp/tarefas',
        '/whatsapp/mensagens',
        '/whatsapp/metricas',
    ]) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
        }
    }
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

test('OpenAPI deve documentar o módulo de Serviços conforme o contrato real', () => {
    const rotas = [
        '/servicos',
        '/servicos/{servicoId}',
        '/servicos/{servicoId}/inativar',
        '/servicos/{servicoId}/reativar',
    ];

    for (const rota of rotas) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true);
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true);
            assert.match(String(operacao.description), /AGENDA/);
        }
    }

    assert.equal(
        possuiParametro(documento.paths['/servicos/{servicoId}']!.get!, 'servicoId'),
        true,
    );
    assert.equal(
        possuiParametro(documento.paths['/servicos/{servicoId}']!.patch!, 'servicoId'),
        true,
    );

    const parametrosListagem = documento.paths['/servicos']!.get!.parameters ?? [];
    const filtroAtivo = parametrosListagem
        .map(resolverParametro)
        .find((parametro) => parametro?.name === 'ativo');
    const schemaFiltroAtivo = filtroAtivo?.schema as ObjetoJson;

    assert.deepEqual(schemaFiltroAtivo.enum, ['true', 'false']);

    const criacao = documento.components.schemas.CriacaoServico;
    const propriedadesCriacao = criacao?.properties as ObjetoJson;
    const atualizacao = documento.components.schemas.AtualizacaoServico;
    const propriedadesAtualizacao = atualizacao?.properties as ObjetoJson;
    const camposEditaveis = ['nome', 'descricao', 'duracao_minutos', 'valor'];

    assert.equal(criacao?.additionalProperties, false);
    assert.deepEqual(criacao?.required, ['nome', 'duracao_minutos']);
    assert.deepEqual(Object.keys(propriedadesCriacao).sort(), camposEditaveis.sort());
    assert.equal(atualizacao?.additionalProperties, false);
    assert.equal(atualizacao?.minProperties, 1);
    assert.deepEqual(Object.keys(propriedadesAtualizacao).sort(), camposEditaveis.sort());
    assert.deepEqual((propriedadesAtualizacao.descricao as ObjetoJson).type, ['string', 'null']);
    assert.deepEqual((propriedadesAtualizacao.valor as ObjetoJson).type, ['number', 'null']);
    assert.equal(propriedadesAtualizacao.ativo, undefined);
    assert.equal(propriedadesAtualizacao.organizacao_id, undefined);
    assert.equal(propriedadesAtualizacao.area_negocio_id, undefined);

    const servico = documento.components.schemas.Servico;
    const propriedadesServico = servico?.properties as ObjetoJson;
    const camposPublicos = ['id', 'nome', 'descricao', 'duracao_minutos', 'valor', 'ativo'];

    assert.equal(servico?.additionalProperties, false);
    assert.deepEqual(Object.keys(propriedadesServico).sort(), camposPublicos.sort());
    assert.deepEqual([...(servico?.required as string[])].sort(), camposPublicos.sort());
    assert.deepEqual((propriedadesServico.valor as ObjetoJson).type, ['string', 'null']);
    assert.equal(propriedadesServico.organizacao_id, undefined);
    assert.equal(propriedadesServico.area_negocio_id, undefined);
    assert.equal(propriedadesServico.deletado_em, undefined);

    assert.ok(documento.paths['/servicos/{servicoId}/inativar']?.patch?.responses?.['409']);
    assert.ok(documento.paths['/servicos/{servicoId}/reativar']?.patch?.responses?.['409']);
});

test('OpenAPI deve documentar o módulo de Profissionais com contratos e acesso corretos', () => {
    const rotas = [
        '/profissionais',
        '/profissionais/{profissionalId}',
        '/profissionais/{profissionalId}/inativar',
        '/profissionais/{profissionalId}/reativar',
    ];

    for (const rota of rotas) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
            assert.match(String(operacao.description), /AGENDA/, rota);
        }
    }

    for (const rota of rotas.slice(1)) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'profissionalId'), true, rota);
        }
    }

    const parametros = documento.paths['/profissionais']!.get!.parameters ?? [];
    for (const nome of ['busca', 'ativo', 'areaNegocioId']) {
        assert.equal(
            parametros.map(resolverParametro).some((parametro) => parametro?.name === nome),
            true,
        );
    }

    const criacao = documento.components.schemas.CriacaoProfissional;
    const atualizacao = documento.components.schemas.AtualizacaoProfissional;
    const campos = [
        'nome',
        'cpf',
        'email',
        'telefone',
        'conselho',
        'numero_conselho',
        'uf_conselho',
        'areas',
    ];

    assert.deepEqual(criacao?.required, ['nome', 'areas']);
    assert.equal(criacao?.additionalProperties, false);
    assert.deepEqual(Object.keys(criacao?.properties as ObjetoJson).sort(), campos.sort());
    assert.equal(atualizacao?.additionalProperties, false);
    assert.equal(atualizacao?.minProperties, 1);
    assert.deepEqual(Object.keys(atualizacao?.properties as ObjetoJson).sort(), campos.sort());
    assert.deepEqual(propriedadeSchema('AtualizacaoProfissional', 'cpf').type, ['string', 'null']);
    for (const proibido of ['ativo', 'usuario_id', 'organizacao_id', 'inativado_em']) {
        assert.equal((atualizacao?.properties as ObjetoJson)[proibido], undefined);
    }

    const areas = propriedadeSchema('CriacaoProfissional', 'areas');
    assert.equal(areas.minItems, 1);
    assert.equal(areas.uniqueItems, true);

    const resumo = documento.components.schemas.Profissional;
    const propriedadesResumo = resumo?.properties as ObjetoJson;
    assert.ok(propriedadesResumo.areas);
    assert.equal(propriedadesResumo.inativado_em, undefined);
    assert.equal(propriedadesResumo.organizacao_id, undefined);

    const detalhe = propriedadesSchema('ProfissionalDetalhe');
    const estado = propriedadesSchema('EstadoProfissional');
    assert.ok(detalhe.inativado_em);
    assert.ok(detalhe.areas);
    assert.ok(estado.inativado_em);
    assert.equal(estado.areas, undefined);

    assert.ok(documento.paths['/profissionais']?.post?.responses?.['409']);
    assert.ok(documento.paths['/profissionais/{profissionalId}']?.patch?.responses?.['409']);
    assert.ok(
        documento.paths['/profissionais/{profissionalId}/inativar']?.patch?.responses?.['409'],
    );
    assert.ok(
        documento.paths['/profissionais/{profissionalId}/reativar']?.patch?.responses?.['409'],
    );
});

test('OpenAPI deve documentar Agendamentos, janela, estados e bodies estritos', () => {
    const rotas = [
        '/agendamentos',
        '/agendamentos/{agendamentoId}',
        '/agendamentos/{agendamentoId}/confirmar',
        '/agendamentos/{agendamentoId}/concluir',
        '/agendamentos/{agendamentoId}/cancelar',
    ];

    for (const rota of rotas) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
            assert.match(String(operacao.description), /AGENDA/);
        }
    }

    for (const rota of rotas.slice(1)) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'agendamentoId'), true, rota);
        }
    }

    const listagem = documento.paths['/agendamentos']!.get!;
    for (const nome of ['inicio', 'fim', 'profissionalId', 'clienteId', 'status']) {
        assert.equal(
            (listagem.parameters ?? [])
                .map(resolverParametro)
                .some((parametro) => parametro?.name === nome),
            true,
            nome,
        );
    }

    const criacao = documento.components.schemas.CriacaoAgendamento;
    const atualizacao = documento.components.schemas.AtualizacaoAgendamento;
    const cancelamento = documento.components.schemas.CancelamentoAgendamento;
    assert.equal(criacao?.additionalProperties, false);
    assert.deepEqual(criacao?.required, [
        'cliente_id',
        'profissional_id',
        'servico_id',
        'inicio_em',
    ]);
    assert.equal(atualizacao?.additionalProperties, false);
    assert.equal(atualizacao?.minProperties, 1);
    assert.deepEqual(((atualizacao?.properties as ObjetoJson).observacao as ObjetoJson).type, [
        'string',
        'null',
    ]);
    assert.equal((atualizacao?.properties as ObjetoJson).cliente_id, undefined);
    assert.equal(cancelamento?.additionalProperties, false);

    const agendamento = documento.components.schemas.Agendamento;
    const propriedades = agendamento?.properties as ObjetoJson;
    for (const proibido of ['organizacao_id', 'area_negocio_id', 'deletado_em', 'criado_em']) {
        assert.equal(propriedades[proibido], undefined);
    }
    assert.deepEqual((propriedades.status as ObjetoJson).enum, [
        'AGENDADO',
        'CONFIRMADO',
        'CONCLUIDO',
        'CANCELADO',
    ]);

    assert.ok(documento.paths['/agendamentos']?.post?.responses?.['409']);
    assert.ok(documento.paths['/agendamentos/{agendamentoId}']?.patch?.responses?.['409']);
    assert.ok(
        documento.paths['/agendamentos/{agendamentoId}/confirmar']?.patch?.responses?.['409'],
    );
    assert.ok(documento.paths['/agendamentos/{agendamentoId}/concluir']?.patch?.responses?.['409']);
    assert.ok(documento.paths['/agendamentos/{agendamentoId}/cancelar']?.patch?.responses?.['409']);
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

test('OpenAPI documenta concessão e revogação clínica com segurança', () => {
    const caminho = '/profissionais/{profissionalId}/acesso-clinico';

    const operacao = documento.paths[caminho]?.patch;

    assert.ok(operacao);

    assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);

    assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true);

    assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true);

    assert.equal(possuiParametro(operacao, 'profissionalId'), true);

    assert.match(String(operacao.description), /ADMINISTRADOR/);

    assert.match(String(operacao.description), /AGENDA/);

    const corpo = documento.components.schemas.AlteracaoPermissaoClinica;

    assert.equal(corpo?.additionalProperties, false);

    assert.deepEqual(corpo?.required, ['autorizado']);

    const propriedades = corpo?.properties as ObjetoJson;

    assert.deepEqual(Object.keys(propriedades), ['autorizado']);

    assert.equal((propriedades.autorizado as ObjetoJson).type, 'boolean');

    const conteudo = operacao.requestBody?.content as ObjetoJson;
    const json = conteudo['application/json'] as ObjetoJson;

    assert.deepEqual(json.schema, {
        $ref: '#/components/schemas/AlteracaoPermissaoClinica',
    });

    const resposta = documento.components.schemas.RespostaPermissaoClinica;

    assert.equal(resposta?.additionalProperties, false);

    const propriedadesResposta = resposta?.properties as ObjetoJson;

    assert.deepEqual(propriedadesResposta.data, {
        $ref: '#/components/schemas/EstadoPermissaoClinica',
    });

    for (const status of ['200', '400', '401', '403', '404', '409']) {
        assert.ok(operacao.responses?.[status], `Resposta HTTP ${status} não documentada`);
    }
});

test('OpenAPI documenta vínculo de usuário com contrato e autorização corretos', () => {
    const caminho = '/profissionais/{profissionalId}/usuario';

    const operacao = documento.paths[caminho]?.patch;

    assert.ok(operacao);

    assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);

    for (const nome of ['x-organizacao-id', 'x-area-negocio-id', 'profissionalId']) {
        assert.equal(possuiParametro(operacao, nome), true, nome);
    }

    assert.match(String(operacao.description), /ADMINISTRADOR/);

    assert.match(String(operacao.description), /AGENDA/);

    const entrada = documento.components.schemas.AlteracaoVinculoUsuarioProfissional;

    assert.ok(entrada, 'Schema AlteracaoVinculoUsuarioProfissional não encontrado');

    assert.equal(entrada.additionalProperties, false);

    assert.deepEqual(entrada.required, ['usuarioId']);

    const propriedades = entrada.properties as ObjetoJson;

    assert.deepEqual(Object.keys(propriedades), ['usuarioId']);

    assert.deepEqual((propriedades.usuarioId as ObjetoJson).type, ['string', 'null']);

    const conteudo = operacao.requestBody?.content as ObjetoJson;

    const json = conteudo['application/json'] as ObjetoJson;

    assert.deepEqual(json.schema, {
        $ref: '#/components/schemas/AlteracaoVinculoUsuarioProfissional',
    });

    const resposta = documento.components.schemas.RespostaVinculoUsuarioProfissional;

    assert.ok(resposta, 'Schema RespostaVinculoUsuarioProfissional não encontrado');

    assert.equal(resposta.additionalProperties, false);

    const propriedadesResposta = resposta.properties as ObjetoJson;

    assert.deepEqual(propriedadesResposta.data, {
        $ref: '#/components/schemas/EstadoVinculoUsuarioProfissional',
    });

    const estado = documento.components.schemas.EstadoVinculoUsuarioProfissional;

    assert.ok(estado, 'Schema EstadoVinculoUsuarioProfissional não encontrado');

    assert.deepEqual(estado.required, ['profissionalId', 'usuarioId']);

    for (const codigo of ['200', '400', '401', '403', '404', '409']) {
        assert.ok(operacao.responses?.[codigo], `Resposta HTTP ${codigo} ausente`);
    }
});

test('OpenAPI documenta a consulta administrativa do vínculo sem conceder acesso clínico', () => {
    const operacao = documento.paths['/profissionais/{profissionalId}/usuario']?.get;
    assert.ok(operacao);
    assert.deepEqual(operacao.security, [{ cookieAuth: [] }]);
    for (const nome of ['x-organizacao-id', 'x-area-negocio-id', 'profissionalId']) {
        assert.equal(possuiParametro(operacao, nome), true, nome);
    }
    assert.match(String(operacao.description), /ADMINISTRADOR/);
    assert.match(String(operacao.description), /não concede acesso clínico/);
});

test('OpenAPI documenta headers, perfis e idempotência do financeiro', () => {
    const rotasFinanceiras = [
        '/financeiro/planos',
        '/financeiro/planos/{planoId}',
        '/financeiro/assinaturas',
        '/financeiro/assinaturas/{assinaturaId}',
        '/financeiro/assinaturas/{assinaturaId}/mensalidades',
        '/financeiro/mensalidades',
        '/financeiro/mensalidades/{mensalidadeId}',
        '/financeiro/mensalidades/{mensalidadeId}/recebimentos',
        '/financeiro/resumo',
    ];

    for (const rota of rotasFinanceiras) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }], rota);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
            assert.match(String(operacao.description), /ADMINISTRADOR/);
        }
    }

    const recebimento =
        documento.paths['/financeiro/mensalidades/{mensalidadeId}/recebimentos']!.post!;
    assert.equal(possuiParametro(recebimento, 'Idempotency-Key'), true);
    assert.ok(recebimento.responses?.['409']);
    const schemaRecebimento = documento.components.schemas.RegistrarRecebimentoFinanceiro;
    assert.ok(schemaRecebimento);
    const propriedadesRecebimento = schemaRecebimento.properties as ObjetoJson;
    assert.equal((propriedadesRecebimento.valor as ObjetoJson).type, 'string');
});

test('OpenAPI documenta WhatsApp sem credenciais ou envio Meta habilitado', () => {
    const rotasWhatsapp = [
        '/whatsapp/configuracoes',
        '/whatsapp/modelos',
        '/whatsapp/tarefas',
        '/whatsapp/mensagens',
        '/whatsapp/metricas',
    ];
    for (const rota of rotasWhatsapp) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }], rota);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
            assert.match(String(operacao.description), /ADMINISTRADOR/);
        }
    }
    for (const rota of [
        '/whatsapp/onboarding/configuracao-sdk',
        '/whatsapp/onboarding/iniciar',
        '/whatsapp/onboarding/concluir',
        '/whatsapp/onboarding/{correlacaoId}/continuar',
        '/whatsapp/onboarding/{correlacaoId}',
        '/whatsapp/modelos',
        '/whatsapp/tarefas',
        '/whatsapp/mensagens',
        '/whatsapp/metricas',
    ]) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
        }
    }
    const salvar = documento.paths['/whatsapp/configuracoes']?.put;
    assert.ok(salvar);
    assert.match(String(salvar.description), /pendente de autorização/);
    assert.equal(documento.paths['/whatsapp/webhook']?.get?.security, undefined);
    assert.equal(documento.paths['/whatsapp/webhook']?.post?.security, undefined);
    assert.equal(
        possuiParametro(documento.paths['/whatsapp/webhook']!.post!, 'X-Hub-Signature-256'),
        true,
    );
    assert.equal(
        possuiParametro(documento.paths['/whatsapp/webhook']!.post!, 'x-organizacao-id'),
        false,
    );
    assert.equal(
        possuiParametro(documento.paths['/whatsapp/webhook']!.post!, 'x-area-negocio-id'),
        false,
    );
    for (const rota of [
        '/whatsapp/onboarding/configuracao-sdk',
        '/whatsapp/onboarding/iniciar',
        '/whatsapp/onboarding/concluir',
        '/whatsapp/onboarding/{correlacaoId}/continuar',
        '/whatsapp/onboarding/{correlacaoId}',
    ]) {
        for (const operacao of Object.values(documento.paths[rota] ?? {})) {
            assert.deepEqual(operacao.security, [{ cookieAuth: [] }], rota);
            assert.match(String(operacao.description), /ADMINISTRADOR/);
            assert.equal(possuiParametro(operacao, 'x-organizacao-id'), true, rota);
            assert.equal(possuiParametro(operacao, 'x-area-negocio-id'), true, rota);
        }
    }
    assert.match(
        String(documento.paths['/whatsapp/onboarding/concluir']?.post?.description),
        /troca o código pela Graph API/,
    );
});
