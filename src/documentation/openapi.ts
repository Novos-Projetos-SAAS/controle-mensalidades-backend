type OpenApiSchema = Record<string, unknown>;

const referencia = (nome: string) => ({ $ref: `#/components/schemas/${nome}` });

const respostaJson = (descricao: string, schema: OpenApiSchema) => ({
    description: descricao,
    headers: {
        'X-Request-Id': {
            $ref: '#/components/headers/RequestId',
        },
    },
    content: {
        'application/json': {
            schema,
        },
    },
});

const corpoJson = (schema: OpenApiSchema, descricao?: string) => ({
    required: true,
    ...(descricao ? { description: descricao } : {}),
    content: {
        'application/json': {
            schema,
        },
    },
});

const erros = (...status: string[]) =>
    Object.fromEntries(
        status.map((codigo) => [
            codigo,
            {
                $ref: '#/components/responses/ErroPadronizado',
            },
        ]),
    );

const segurancaCookie = [{ cookieAuth: [] }];
const parametroOrganizacao = { $ref: '#/components/parameters/OrganizacaoIdHeader' };
const parametroAreaContexto = { $ref: '#/components/parameters/AreaNegocioIdHeader' };
const parametroAreaPath = { $ref: '#/components/parameters/AreaNegocioIdPath' };
const parametroUsuarioPath = { $ref: '#/components/parameters/UsuarioIdPath' };
const parametroClientePath = { $ref: '#/components/parameters/ClienteIdPath' };
const parametroServicoPath = { $ref: '#/components/parameters/ServicoIdPath' };
const parametroProfissionalPath = { $ref: '#/components/parameters/ProfissionalIdPath' };
const parametroAgendamentoPath = { $ref: '#/components/parameters/AgendamentoIdPath' };

const camposCliente = {
    id: {
        type: 'string',
        format: 'uuid',
    },
    nome: {
        type: 'string',
        maxLength: 150,
    },
    cpf: {
        type: ['string', 'null'],
        pattern: '^\\d{11}$',
    },
    data_nascimento: {
        type: ['string', 'null'],
        format: 'date',
    },
    telefone: {
        type: ['string', 'null'],
        minLength: 8,
        maxLength: 15,
    },
    email: {
        type: ['string', 'null'],
        format: 'email',
        maxLength: 150,
    },
    sexo: {
        type: ['string', 'null'],
        maxLength: 30,
    },
    cep: {
        type: ['string', 'null'],
        pattern: '^\\d{8}$',
    },
    logradouro: {
        type: ['string', 'null'],
        maxLength: 150,
    },
    numero: {
        type: ['string', 'null'],
        maxLength: 20,
    },
    complemento: {
        type: ['string', 'null'],
        maxLength: 100,
    },
    bairro: {
        type: ['string', 'null'],
        maxLength: 100,
    },
    cidade: {
        type: ['string', 'null'],
        maxLength: 100,
    },
    uf: {
        type: ['string', 'null'],
        minLength: 2,
        maxLength: 2,
    },
    observacao: {
        type: ['string', 'null'],
        maxLength: 5000,
    },
    aceite_whatsapp: {
        type: 'boolean',
    },
    ativo: {
        type: 'boolean',
    },
};

const camposCriacaoCliente = {
    nome: {
        type: 'string',
        pattern: '\\S',
        description:
            'Espaços externos são removidos; o valor normalizado deve conter de 1 a 150 caracteres.',
    },
    cpf: {
        type: 'string',
        pattern: '^(?:\\D*|(?:\\D*\\d){11}\\D*)$',
        description:
            'Aceita CPF formatado. Caracteres não numéricos são removidos; o valor normalizado deve ter 11 dígitos. Uma string sem dígitos é tratada como campo omitido.',
        examples: ['123.456.789-01'],
    },
    data_nascimento: {
        type: 'string',
        pattern: '^(?:\\s*|\\s*\\d{4}-\\d{2}-\\d{2}\\s*)$',
        description:
            'Espaços externos são removidos. O valor normalizado deve ser uma data ISO YYYY-MM-DD; vazio é tratado como campo omitido.',
    },
    telefone: {
        type: 'string',
        pattern: '^(?:\\D*|(?:\\D*\\d){8,15}\\D*)$',
        description:
            'Aceita telefone formatado. Caracteres não numéricos são removidos; o valor normalizado deve ter de 8 a 15 dígitos. Uma string sem dígitos é tratada como campo omitido.',
        examples: ['(18) 99999-8888'],
    },
    email: {
        type: 'string',
        description:
            'Aceita espaços externos e caixa diferente. Após trim e lowercase, deve ser um e-mail válido com até 150 caracteres; vazio é tratado como campo omitido.',
        examples: [' Cliente@Exemplo.com '],
    },
    sexo: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 30 caracteres; vazio é tratado como campo omitido.',
    },
    cep: {
        type: 'string',
        pattern: '^(?:\\D*|(?:\\D*\\d){8}\\D*)$',
        description:
            'Aceita CEP formatado. Caracteres não numéricos são removidos; o valor normalizado deve ter 8 dígitos. Uma string sem dígitos é tratada como campo omitido.',
        examples: ['19000-000'],
    },
    logradouro: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 150 caracteres; vazio é tratado como campo omitido.',
    },
    numero: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 20 caracteres; vazio é tratado como campo omitido.',
    },
    complemento: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 100 caracteres; vazio é tratado como campo omitido.',
    },
    bairro: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 100 caracteres; vazio é tratado como campo omitido.',
    },
    cidade: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 100 caracteres; vazio é tratado como campo omitido.',
    },
    uf: {
        type: 'string',
        pattern: '^\\s*(?:\\S\\S)?\\s*$',
        description:
            'Aceita espaços externos e caixa diferente. Após trim e uppercase, deve ter 2 caracteres; vazio é tratado como campo omitido.',
        examples: [' sp '],
    },
    observacao: {
        type: 'string',
        description:
            'Espaços externos são removidos. O valor normalizado deve ter até 5000 caracteres; vazio é tratado como campo omitido.',
    },
};

const camposAtualizacaoCliente = {
    nome: {
        type: 'string',
        pattern: '\\S',
        description:
            'Espaços externos são removidos; o valor normalizado deve conter de 1 a 150 caracteres.',
    },
    cpf: {
        type: ['string', 'null'],
        pattern: '^(?:\\D*\\d){11}\\D*$',
        description:
            'Aceita CPF formatado. Caracteres não numéricos são removidos e o valor normalizado deve ter 11 dígitos. Use null para limpar.',
        examples: ['123.456.789-01', null],
    },
    data_nascimento: {
        type: ['string', 'null'],
        pattern: '^\\s*\\d{4}-\\d{2}-\\d{2}\\s*$',
        description:
            'Espaços externos são removidos e o valor normalizado deve ser uma data ISO YYYY-MM-DD. String vazia é inválida; use null para limpar.',
    },
    telefone: {
        type: ['string', 'null'],
        pattern: '^(?:\\D*\\d){8,15}\\D*$',
        description:
            'Aceita telefone formatado. Caracteres não numéricos são removidos e o valor normalizado deve ter de 8 a 15 dígitos. Use null para limpar.',
        examples: ['(18) 99999-8888', null],
    },
    email: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Aceita espaços externos e caixa diferente. Após trim e lowercase, deve ser um e-mail válido com até 150 caracteres. String vazia é inválida; use null para limpar.',
        examples: [' Cliente@Exemplo.com ', null],
    },
    sexo: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 30 caracteres. String vazia é inválida; use null para limpar.',
    },
    cep: {
        type: ['string', 'null'],
        pattern: '^(?:\\D*\\d){8}\\D*$',
        description:
            'Aceita CEP formatado. Caracteres não numéricos são removidos e o valor normalizado deve ter 8 dígitos. Use null para limpar.',
        examples: ['19000-000', null],
    },
    logradouro: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 150 caracteres. String vazia é inválida; use null para limpar.',
    },
    numero: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 20 caracteres. String vazia é inválida; use null para limpar.',
    },
    complemento: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 100 caracteres. String vazia é inválida; use null para limpar.',
    },
    bairro: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 100 caracteres. String vazia é inválida; use null para limpar.',
    },
    cidade: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 100 caracteres. String vazia é inválida; use null para limpar.',
    },
    uf: {
        type: ['string', 'null'],
        pattern: '^\\s*\\S\\S\\s*$',
        description:
            'Aceita espaços externos e caixa diferente. Após trim e uppercase, deve ter 2 caracteres. String vazia é inválida; use null para limpar.',
        examples: [' sp ', null],
    },
    observacao: {
        type: ['string', 'null'],
        pattern: '\\S',
        description:
            'Após trim, deve conter de 1 a 5000 caracteres. String vazia é inválida; use null para limpar.',
    },
};

const camposProfissional = {
    id: { type: 'string', format: 'uuid' },
    nome: { type: 'string', minLength: 1, maxLength: 150 },
    cpf: { type: ['string', 'null'], pattern: '^\\d{11}$' },
    email: { type: ['string', 'null'], format: 'email', maxLength: 150 },
    telefone: { type: ['string', 'null'], minLength: 8, maxLength: 15 },
    conselho: { type: ['string', 'null'], maxLength: 30 },
    numero_conselho: { type: ['string', 'null'], maxLength: 50 },
    uf_conselho: { type: ['string', 'null'], minLength: 2, maxLength: 2 },
    ativo: { type: 'boolean' },
};

const camposEntradaProfissional = {
    nome: {
        type: 'string',
        description: 'Após trim, deve ter entre 1 e 150 caracteres.',
    },
    cpf: {
        type: 'string',
        description:
            'Aceita CPF formatado: remove caracteres não numéricos. Vazio é omitido; valor normalizado deve ter 11 dígitos.',
        examples: ['123.456.789-01'],
    },
    email: {
        type: 'string',
        description:
            'Após trim e lowercase, deve ser e-mail válido com até 150 caracteres. Vazio é omitido.',
    },
    telefone: {
        type: 'string',
        description:
            'Remove caracteres não numéricos. Vazio é omitido; valor normalizado deve ter de 8 a 15 dígitos.',
        examples: ['(18) 99999-8888'],
    },
    conselho: { type: 'string', description: 'Após trim, até 30 caracteres. Vazio é omitido.' },
    numero_conselho: {
        type: 'string',
        description: 'Após trim, até 50 caracteres. Vazio é omitido.',
    },
    uf_conselho: {
        type: 'string',
        description: 'Após trim e uppercase, deve ter 2 caracteres. Vazio é omitido.',
    },
    areas: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        description:
            'IDs de áreas de negócio ativas da mesma organização; vínculos duplicados são proibidos.',
        items: { type: 'string', format: 'uuid' },
    },
};

const openApiDocument = {
    openapi: '3.1.0',
    info: {
        title: 'Sistema de Mensalidades API',
        version: '1.0.0',
        description:
            'API REST v1 para autenticação, contexto organizacional e gestão de clientes, serviços, profissionais e agendamentos.',
    },
    servers: [
        {
            url: '/api/v1',
            description: 'API v1',
        },
    ],
    tags: [
        { name: 'Saúde', description: 'Monitoramento da aplicação.' },
        { name: 'Autenticação', description: 'Sessão autenticada por cookie HTTP-only.' },
        { name: 'Áreas de negócio', description: 'Áreas disponíveis na organização.' },
        { name: 'Módulos', description: 'Módulos habilitados na organização e em suas áreas.' },
        { name: 'Contexto', description: 'Contexto atual de usuário, organização e área.' },
        { name: 'Organizações', description: 'Dados da organização atual.' },
        { name: 'Usuários', description: 'Vínculos de usuários com a organização atual.' },
        { name: 'Clientes', description: 'Cadastro, consulta, edição e lifecycle de clientes.' },
        {
            name: 'Serviços',
            description: 'Catálogo de serviços da área atual protegido pelo módulo AGENDA.',
        },
        {
            name: 'Profissionais',
            description:
                'Cadastro organizacional de profissionais com vínculos a múltiplas áreas, protegido pelo módulo AGENDA.',
        },
        {
            name: 'Agendamentos',
            description:
                'Agenda diária da área atual, com duração histórica, transições de estado e prevenção concorrente de sobreposições.',
        },
        {
            name: 'Financeiro',
            description:
                'Planos, assinaturas, mensalidades e recebimentos manuais. Exige perfil ADMINISTRADOR.',
        },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Saúde'],
                summary: 'Consultar saúde da API',
                operationId: 'consultarSaude',
                responses: {
                    '200': respostaJson('Aplicação disponível.', referencia('RespostaSaude')),
                },
            },
        },
        '/auth/login': {
            post: {
                tags: ['Autenticação'],
                summary: 'Iniciar sessão',
                description: 'Valida as credenciais e grava o JWT no cookie HTTP-only `token`.',
                operationId: 'login',
                requestBody: corpoJson(referencia('LoginRequest')),
                responses: {
                    '200': respostaJson('Login realizado.', referencia('RespostaAuth')),
                    ...erros('400', '401', '403', '429'),
                },
            },
        },
        '/auth/me': {
            get: {
                tags: ['Autenticação'],
                summary: 'Consultar usuário autenticado',
                operationId: 'consultarUsuarioAutenticado',
                security: segurancaCookie,
                responses: {
                    '200': respostaJson(
                        'Usuário e organizações disponíveis para a sessão.',
                        referencia('RespostaAuth'),
                    ),
                    ...erros('401', '403'),
                },
            },
        },
        '/auth/logout': {
            post: {
                tags: ['Autenticação'],
                summary: 'Encerrar sessão',
                description:
                    'Remove o cookie `token`. A operação é idempotente e aceita sessão ausente ou inválida.',
                operationId: 'logout',
                responses: {
                    '200': respostaJson('Logout realizado.', referencia('RespostaLogout')),
                },
            },
        },
        '/areas-negocio': {
            get: {
                tags: ['Áreas de negócio'],
                summary: 'Listar áreas de negócio',
                operationId: 'listarAreasNegocio',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                responses: {
                    '200': respostaJson(
                        'Lista direta das áreas ativas da organização.',
                        referencia('ListaAreasNegocio'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
        },
        '/areas-negocio/{areaNegocioId}/modulos': {
            get: {
                tags: ['Módulos'],
                summary: 'Listar módulos habilitados em uma área',
                operationId: 'listarModulosArea',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaPath],
                responses: {
                    '200': respostaJson(
                        'Módulos habilitados na área e na organização.',
                        referencia('RespostaModulos'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/modulos': {
            get: {
                tags: ['Módulos'],
                summary: 'Listar módulos habilitados',
                operationId: 'listarModulosOrganizacao',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                responses: {
                    '200': respostaJson(
                        'Módulos habilitados na organização.',
                        referencia('RespostaModulos'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
        },
        '/contexto': {
            get: {
                tags: ['Contexto'],
                summary: 'Carregar contexto atual',
                operationId: 'carregarContexto',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                responses: {
                    '200': respostaJson('Contexto resolvido.', referencia('RespostaContexto')),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/organizacoes/atual': {
            get: {
                tags: ['Organizações'],
                summary: 'Consultar organização atual',
                operationId: 'consultarOrganizacaoAtual',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                responses: {
                    '200': respostaJson(
                        'Dados básicos seguros da organização.',
                        referencia('RespostaOrganizacaoAtual'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Organizações'],
                summary: 'Atualizar organização atual',
                description: 'Exige perfil ADMINISTRADOR.',
                operationId: 'atualizarOrganizacaoAtual',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                requestBody: corpoJson(referencia('AtualizacaoOrganizacaoAtual')),
                responses: {
                    '200': respostaJson(
                        'Organização atualizada.',
                        referencia('RespostaOrganizacaoAtual'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/usuarios': {
            get: {
                tags: ['Usuários'],
                summary: 'Listar usuários da organização',
                description: 'Exige perfil ADMINISTRADOR.',
                operationId: 'listarUsuariosOrganizacao',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                responses: {
                    '200': respostaJson(
                        'Usuários vinculados à organização.',
                        referencia('RespostaUsuariosOrganizacao'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
            post: {
                tags: ['Usuários'],
                summary: 'Criar usuário na organização',
                description: 'Exige perfil ADMINISTRADOR.',
                operationId: 'criarUsuarioOrganizacao',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                requestBody: corpoJson(referencia('CriacaoUsuarioOrganizacao')),
                responses: {
                    '201': respostaJson(
                        'Usuário criado e vinculado.',
                        referencia('RespostaUsuarioOrganizacao'),
                    ),
                    ...erros('400', '401', '403', '409'),
                },
            },
        },
        '/usuarios/{usuarioId}': {
            patch: {
                tags: ['Usuários'],
                summary: 'Atualizar vínculo de usuário',
                description: 'Exige perfil ADMINISTRADOR.',
                operationId: 'atualizarVinculoUsuarioOrganizacao',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroUsuarioPath],
                requestBody: corpoJson(referencia('AtualizacaoVinculoUsuario')),
                responses: {
                    '200': respostaJson(
                        'Vínculo atualizado.',
                        referencia('RespostaUsuarioOrganizacao'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes': {
            get: {
                tags: ['Clientes'],
                summary: 'Listar clientes',
                operationId: 'listarClientes',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    {
                        name: 'busca',
                        in: 'query',
                        description: 'Busca por nome, e-mail, CPF ou telefone.',
                        schema: { type: 'string', minLength: 1, maxLength: 150 },
                    },
                    {
                        name: 'ativo',
                        in: 'query',
                        description: 'Filtra pelo estado de lifecycle.',
                        schema: { type: 'boolean' },
                    },
                    {
                        name: 'areaNegocioId',
                        in: 'query',
                        description: 'Filtra por vínculo ativo com a área.',
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': respostaJson('Clientes encontrados.', referencia('RespostaClientes')),
                    ...erros('400', '401', '403', '404'),
                },
            },
            post: {
                tags: ['Clientes'],
                summary: 'Criar cliente',
                description: 'Permitido para ADMINISTRADOR e OPERADOR.',
                operationId: 'criarCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao],
                requestBody: corpoJson(referencia('CriacaoCliente')),
                responses: {
                    '201': respostaJson('Cliente criado.', referencia('RespostaClienteCriado')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes/{clienteId}': {
            get: {
                tags: ['Clientes'],
                summary: 'Consultar cliente',
                operationId: 'consultarCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                responses: {
                    '200': respostaJson('Cliente encontrado.', referencia('RespostaCliente')),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Clientes'],
                summary: 'Editar cliente',
                description:
                    'Permitido para ADMINISTRADOR e OPERADOR. Campos omitidos são preservados; `null` limpa campos anuláveis. O estado `ativo` só pode ser alterado pelas rotas de lifecycle.',
                operationId: 'atualizarCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                requestBody: corpoJson(referencia('AtualizacaoCliente')),
                responses: {
                    '200': respostaJson('Cliente atualizado.', referencia('RespostaCliente')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes/{clienteId}/inativar': {
            patch: {
                tags: ['Clientes'],
                summary: 'Inativar cliente',
                description:
                    'Marca o cliente como inativo sem remover dados, áreas, histórico ou registros financeiros. Permitido para ADMINISTRADOR e OPERADOR.',
                operationId: 'inativarCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                responses: {
                    '200': respostaJson('Cliente inativado.', referencia('RespostaCliente')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes/{clienteId}/reativar': {
            patch: {
                tags: ['Clientes'],
                summary: 'Reativar cliente',
                description:
                    'Restaura o estado ativo e preserva todos os dados e vínculos existentes. Permitido para ADMINISTRADOR e OPERADOR.',
                operationId: 'reativarCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                responses: {
                    '200': respostaJson('Cliente reativado.', referencia('RespostaCliente')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes/{clienteId}/whatsapp/aceitar': {
            patch: {
                tags: ['Clientes'],
                summary: 'Registrar aceite de WhatsApp',
                description:
                    'Registra o consentimento atual do cliente e preserva o histórico de opt-out. Permitido para ADMINISTRADOR e OPERADOR, inclusive para cliente inativo.',
                operationId: 'aceitarWhatsappCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                requestBody: corpoJson(referencia('ConsentimentoWhatsappRequest')),
                responses: {
                    '200': respostaJson(
                        'Aceite de WhatsApp registrado.',
                        referencia('RespostaConsentimentoWhatsapp'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/clientes/{clienteId}/whatsapp/revogar': {
            patch: {
                tags: ['Clientes'],
                summary: 'Revogar aceite de WhatsApp',
                description:
                    'Registra o opt-out e cancela atomicamente as tarefas de mensagem pendentes do cliente. Preserva o histórico do último aceite. Permitido para ADMINISTRADOR e OPERADOR, inclusive para cliente inativo.',
                operationId: 'revogarWhatsappCliente',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroClientePath],
                requestBody: corpoJson(referencia('ConsentimentoWhatsappRequest')),
                responses: {
                    '200': respostaJson(
                        'Aceite de WhatsApp revogado.',
                        referencia('RespostaConsentimentoWhatsapp'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/servicos': {
            get: {
                tags: ['Serviços'],
                summary: 'Listar serviços da área atual',
                description:
                    'Lista serviços ativos e inativos não excluídos da área atual. Exige o módulo AGENDA habilitado para a organização e a área.',
                operationId: 'listarServicos',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'ativo',
                        in: 'query',
                        description: 'Filtra pelo estado de lifecycle do serviço.',
                        schema: { type: 'string', enum: ['true', 'false'] },
                    },
                ],
                responses: {
                    '200': respostaJson('Serviços encontrados.', referencia('RespostaServicos')),
                    ...erros('400', '401', '403', '404'),
                },
            },
            post: {
                tags: ['Serviços'],
                summary: 'Criar serviço na área atual',
                description:
                    'Exige perfil ADMINISTRADOR e o módulo AGENDA habilitado para a organização e a área.',
                operationId: 'criarServico',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                requestBody: corpoJson(referencia('CriacaoServico')),
                responses: {
                    '201': respostaJson('Serviço criado.', referencia('RespostaServico')),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/servicos/{servicoId}': {
            get: {
                tags: ['Serviços'],
                summary: 'Consultar serviço da área atual',
                description:
                    'Exige o módulo AGENDA habilitado para a organização e a área. Serviços inativos continuam consultáveis.',
                operationId: 'consultarServico',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroServicoPath],
                responses: {
                    '200': respostaJson('Serviço encontrado.', referencia('RespostaServico')),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Serviços'],
                summary: 'Atualizar serviço da área atual',
                description:
                    'Exige perfil ADMINISTRADOR e o módulo AGENDA habilitado. Campos omitidos são preservados; `null` limpa descrição ou valor. Área e lifecycle não podem ser alterados por esta operação.',
                operationId: 'atualizarServico',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroServicoPath],
                requestBody: corpoJson(referencia('AtualizacaoServico')),
                responses: {
                    '200': respostaJson('Serviço atualizado.', referencia('RespostaServico')),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/servicos/{servicoId}/inativar': {
            patch: {
                tags: ['Serviços'],
                summary: 'Inativar serviço da área atual',
                description:
                    'Exige perfil ADMINISTRADOR e o módulo AGENDA habilitado. Preserva o cadastro do serviço.',
                operationId: 'inativarServico',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroServicoPath],
                responses: {
                    '200': respostaJson('Serviço inativado.', referencia('RespostaServico')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/servicos/{servicoId}/reativar': {
            patch: {
                tags: ['Serviços'],
                summary: 'Reativar serviço da área atual',
                description:
                    'Exige perfil ADMINISTRADOR e o módulo AGENDA habilitado. Serviços soft-deleted não podem ser reativados.',
                operationId: 'reativarServico',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroServicoPath],
                responses: {
                    '200': respostaJson('Serviço reativado.', referencia('RespostaServico')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/profissionais': {
            get: {
                tags: ['Profissionais'],
                summary: 'Listar profissionais da organização',
                description:
                    'Exige o módulo AGENDA habilitado na área do header. O cadastro e a listagem são organizacionais; areaNegocioId no filtro seleciona vínculos ativos e é independente do header de contexto.',
                operationId: 'listarProfissionais',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'busca',
                        in: 'query',
                        description:
                            'Busca em nome, e-mail, conselho, número do conselho, CPF e telefone.',
                        schema: { type: 'string', minLength: 1, maxLength: 150 },
                    },
                    {
                        name: 'ativo',
                        in: 'query',
                        schema: { type: 'string', enum: ['true', 'false'] },
                    },
                    {
                        name: 'areaNegocioId',
                        in: 'query',
                        description:
                            'Filtra pelo vínculo ativo com a área informada (não é o header de contexto).',
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Profissionais listados.',
                        referencia('RespostaProfissionais'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            post: {
                tags: ['Profissionais'],
                summary: 'Criar profissional na organização',
                description:
                    'Exige perfil ADMINISTRADOR e módulo AGENDA habilitado na área de contexto. O profissional é organizacional e pode ser vinculado a uma ou mais áreas ativas da organização.',
                operationId: 'criarProfissional',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                requestBody: corpoJson(referencia('CriacaoProfissional')),
                responses: {
                    '201': respostaJson(
                        'Profissional criado.',
                        referencia('RespostaProfissionalCriado'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/profissionais/{profissionalId}': {
            get: {
                tags: ['Profissionais'],
                summary: 'Consultar profissional da organização',
                description:
                    'Exige módulo AGENDA na área de contexto. Profissionais inativos continuam consultáveis.',
                operationId: 'consultarProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                responses: {
                    '200': respostaJson(
                        'Profissional encontrado.',
                        referencia('RespostaProfissional'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Profissionais'],
                summary: 'Atualizar profissional e seus vínculos por área',
                description:
                    'Exige perfil ADMINISTRADOR e módulo AGENDA na área de contexto. Campos omitidos são preservados; null limpa campos opcionais. Se areas for informado, sincroniza os vínculos ativos sem apagar o histórico. Não altera ativo.',
                operationId: 'atualizarProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                requestBody: corpoJson(referencia('AtualizacaoProfissional')),
                responses: {
                    '200': respostaJson(
                        'Profissional atualizado.',
                        referencia('RespostaProfissional'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/profissionais/{profissionalId}/inativar': {
            patch: {
                tags: ['Profissionais'],
                summary: 'Inativar profissional globalmente',
                description:
                    'Exige perfil ADMINISTRADOR e módulo AGENDA na área de contexto. Mantém os vínculos com áreas e não exclui o profissional.',
                operationId: 'inativarProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                responses: {
                    '200': respostaJson(
                        'Profissional inativado.',
                        referencia('RespostaEstadoProfissional'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/profissionais/{profissionalId}/reativar': {
            patch: {
                tags: ['Profissionais'],
                summary: 'Reativar profissional globalmente',
                description:
                    'Exige perfil ADMINISTRADOR e módulo AGENDA na área de contexto. Preserva os vínculos anteriores com áreas; soft-deleted não pode ser reativado.',
                operationId: 'reativarProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                responses: {
                    '200': respostaJson(
                        'Profissional reativado.',
                        referencia('RespostaEstadoProfissional'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/profissionais/{profissionalId}/acesso-clinico': {
            patch: {
                tags: ['Profissionais'],
                summary: 'Conceder ou revogar acesso clínico',
                description:
                    'Exige perfil ADMINISTRADOR, organização e área ativas, e módulo AGENDA habilitado. A concessão exige profissional ativo, vínculo ativo com a área e usuário autenticável vinculado à organização. Toda alteração de permissão é auditada na mesma transação. Não concede acesso automático a prontuários de outros profissionais.',
                operationId: 'alterarPermissaoClinicaProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                requestBody: corpoJson(referencia('AlteracaoPermissaoClinica')),
                responses: {
                    '200': respostaJson(
                        'Permissão clínica atualizada.',
                        referencia('RespostaPermissaoClinica'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },

        '/profissionais/{profissionalId}/usuario': {
            get: {
                tags: ['Profissionais'],
                summary: 'Consultar usuário vinculado ao profissional',
                description:
                    'Exige perfil ADMINISTRADOR e vínculo ativo do profissional à área informada. Retorna somente nome e UUID do usuário ativo na organização; não concede acesso clínico.',
                operationId: 'consultarVinculoUsuarioProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                responses: {
                    '200': respostaJson(
                        'Vínculo atual do profissional.',
                        referencia('RespostaConsultaVinculoUsuarioProfissional'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Profissionais'],
                summary: 'Vincular ou desvincular usuário de um profissional',
                description:
                    'Exige perfil ADMINISTRADOR, organização e área ativas e módulo AGENDA habilitado. Permite vincular um usuário ativo da mesma organização ou desvincular o usuário atual. Impede vínculos duplicados, troca direta de identidade e alterações quando existe histórico clínico, inclusive soft-deleted. A operação revoga as autorizações clínicas anteriores e grava auditoria na mesma transação. Vincular um usuário não concede acesso clínico automaticamente.',
                operationId: 'alterarVinculoUsuarioProfissional',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    parametroProfissionalPath,
                ],
                requestBody: corpoJson(referencia('AlteracaoVinculoUsuarioProfissional')),
                responses: {
                    '200': respostaJson(
                        'Vínculo do usuário atualizado.',
                        referencia('RespostaVinculoUsuarioProfissional'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },

        '/agendamentos': {
            get: {
                tags: ['Agendamentos'],
                summary: 'Listar agendamentos sobrepostos à janela',
                description:
                    'Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR. A janela usa semântica semiaberta [inicio, fim), tem no máximo 31 dias e sempre fica restrita à organização e à área dos headers.',
                operationId: 'listarAgendamentos',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'inicio',
                        in: 'query',
                        required: true,
                        description: 'Início inclusivo da janela, com Z ou offset explícito.',
                        schema: { type: 'string', format: 'date-time' },
                    },
                    {
                        name: 'fim',
                        in: 'query',
                        required: true,
                        description: 'Fim exclusivo da janela, com Z ou offset explícito.',
                        schema: { type: 'string', format: 'date-time' },
                    },
                    {
                        name: 'profissionalId',
                        in: 'query',
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'clienteId',
                        in: 'query',
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'status',
                        in: 'query',
                        schema: {
                            type: 'string',
                            enum: ['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO'],
                        },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Agendamentos da janela.',
                        referencia('RespostaAgendamentos'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            post: {
                tags: ['Agendamentos'],
                summary: 'Criar agendamento',
                description:
                    'Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR. O servidor deriva fim_em da duração atual do serviço. Cliente e profissional devem estar ativos e vinculados à área; o serviço deve pertencer à área. Sobreposições do mesmo cliente ou profissional, inclusive entre áreas da organização, retornam 409 AGENDAMENTO_HORARIO_OCUPADO. Horários adjacentes são permitidos.',
                operationId: 'criarAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                requestBody: corpoJson(referencia('CriacaoAgendamento')),
                responses: {
                    '201': respostaJson('Agendamento criado.', referencia('RespostaAgendamento')),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/agendamentos/{agendamentoId}': {
            get: {
                tags: ['Agendamentos'],
                summary: 'Consultar agendamento',
                description:
                    'Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR. Recursos de outra organização, área ou soft-deleted retornam 404.',
                operationId: 'consultarAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroAgendamentoPath],
                responses: {
                    '200': respostaJson(
                        'Agendamento encontrado.',
                        referencia('RespostaAgendamento'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
            patch: {
                tags: ['Agendamentos'],
                summary: 'Remarcar ou editar agendamento',
                description:
                    'Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR. Alterar somente inicio_em preserva a duração histórica; trocar servico_id usa a duração atual do novo serviço. cliente_id é imutável. CONCLUIDO e CANCELADO são terminais. Conflitos retornam 409.',
                operationId: 'atualizarAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroAgendamentoPath],
                requestBody: corpoJson(referencia('AtualizacaoAgendamento')),
                responses: {
                    '200': respostaJson(
                        'Agendamento atualizado.',
                        referencia('RespostaAgendamento'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/agendamentos/{agendamentoId}/confirmar': {
            patch: {
                tags: ['Agendamentos'],
                summary: 'Confirmar agendamento',
                description:
                    'Transição AGENDADO → CONFIRMADO. Estados incompatíveis retornam 409 AGENDAMENTO_ESTADO_INCOMPATIVEL. Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR.',
                operationId: 'confirmarAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroAgendamentoPath],
                responses: {
                    '200': respostaJson(
                        'Agendamento confirmado.',
                        referencia('RespostaAgendamento'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/agendamentos/{agendamentoId}/concluir': {
            patch: {
                tags: ['Agendamentos'],
                summary: 'Concluir agendamento',
                description:
                    'Transições AGENDADO ou CONFIRMADO → CONCLUIDO. CONCLUIDO é terminal e continua ocupando o horário. Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR.',
                operationId: 'concluirAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroAgendamentoPath],
                responses: {
                    '200': respostaJson(
                        'Agendamento concluído.',
                        referencia('RespostaAgendamento'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/agendamentos/{agendamentoId}/cancelar': {
            patch: {
                tags: ['Agendamentos'],
                summary: 'Cancelar agendamento',
                description:
                    'Transições AGENDADO ou CONFIRMADO → CANCELADO. Registra instante, usuário autenticado e motivo opcional; o cancelamento libera o horário. Exige módulo AGENDA e perfil ADMINISTRADOR ou OPERADOR.',
                operationId: 'cancelarAgendamento',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto, parametroAgendamentoPath],
                requestBody: corpoJson(referencia('CancelamentoAgendamento')),
                responses: {
                    '200': respostaJson(
                        'Agendamento cancelado.',
                        referencia('RespostaAgendamento'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/financeiro/planos': {
            get: {
                tags: ['Financeiro'],
                summary: 'Listar planos ativos',
                description:
                    'Exige perfil ADMINISTRADOR. Retorna planos da área atual e planos globais da organização.',
                operationId: 'listarPlanosFinanceiros',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                responses: {
                    '200': respostaJson(
                        'Planos disponíveis.',
                        referencia('RespostaPlanosFinanceiros'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
            post: {
                tags: ['Financeiro'],
                summary: 'Criar plano mensal',
                description: 'Cria plano positivo com periodicidade MENSAL. Exige ADMINISTRADOR.',
                operationId: 'criarPlanoFinanceiro',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                requestBody: corpoJson(referencia('CriarPlanoFinanceiro')),
                responses: {
                    '201': respostaJson('Plano criado.', referencia('RespostaPlanoFinanceiro')),
                    ...erros('400', '401', '403'),
                },
            },
        },
        '/financeiro/planos/{planoId}': {
            get: {
                tags: ['Financeiro'],
                summary: 'Consultar plano',
                description:
                    'Exige perfil ADMINISTRADOR; UUIDs fora da organização ou área retornam 404.',
                operationId: 'buscarPlanoFinanceiro',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'planoId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': respostaJson('Plano encontrado.', referencia('RespostaPlanoFinanceiro')),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/financeiro/assinaturas': {
            get: {
                tags: ['Financeiro'],
                summary: 'Listar assinaturas',
                description:
                    'Exige perfil ADMINISTRADOR. A listagem é limitada à organização e à área atuais.',
                operationId: 'listarAssinaturasFinanceiras',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'page',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, default: 1 },
                    },
                    {
                        name: 'pageSize',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    },
                    { name: 'clienteId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                    {
                        name: 'status',
                        in: 'query',
                        schema: { type: 'string', enum: ['ATIVA', 'CANCELADA', 'ENCERRADA'] },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Assinaturas paginadas.',
                        referencia('RespostaAssinaturasFinanceiras'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
            post: {
                tags: ['Financeiro'],
                summary: 'Criar assinatura mensal',
                description:
                    'Exige perfil ADMINISTRADOR. Vincula cliente ativo da área a plano mensal ativo da mesma organização.',
                operationId: 'criarAssinaturaFinanceira',
                security: segurancaCookie,
                parameters: [parametroOrganizacao, parametroAreaContexto],
                requestBody: corpoJson(referencia('CriarAssinaturaFinanceira')),
                responses: {
                    '201': respostaJson(
                        'Assinatura criada.',
                        referencia('RespostaAssinaturaFinanceira'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/financeiro/assinaturas/{assinaturaId}': {
            get: {
                tags: ['Financeiro'],
                summary: 'Consultar assinatura',
                description:
                    'Exige perfil ADMINISTRADOR; UUIDs fora da organização ou área retornam 404.',
                operationId: 'buscarAssinaturaFinanceira',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'assinaturaId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Assinatura encontrada.',
                        referencia('RespostaAssinaturaFinanceira'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/financeiro/assinaturas/{assinaturaId}/mensalidades': {
            post: {
                tags: ['Financeiro'],
                summary: 'Gerar mensalidade de uma competência',
                description:
                    'Exige perfil ADMINISTRADOR. Geração manual e idempotente por assinatura e competência; sem cobrança automática.',
                operationId: 'gerarMensalidadeFinanceira',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'assinaturaId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                requestBody: corpoJson(referencia('GerarMensalidadeFinanceira')),
                responses: {
                    '201': respostaJson(
                        'Mensalidade criada.',
                        referencia('RespostaGeracaoMensalidade'),
                    ),
                    '200': respostaJson(
                        'Mensalidade já existente.',
                        referencia('RespostaGeracaoMensalidade'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/financeiro/mensalidades': {
            get: {
                tags: ['Financeiro'],
                summary: 'Listar mensalidades',
                description:
                    'Exige perfil ADMINISTRADOR. Situação e vencimento são calculados no momento da consulta.',
                operationId: 'listarMensalidadesFinanceiras',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'page',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, default: 1 },
                    },
                    {
                        name: 'pageSize',
                        in: 'query',
                        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    },
                    { name: 'clienteId', in: 'query', schema: { type: 'string', format: 'uuid' } },
                    {
                        name: 'competencia',
                        in: 'query',
                        schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
                    },
                    {
                        name: 'status',
                        in: 'query',
                        schema: {
                            type: 'string',
                            enum: ['PENDENTE', 'PARCIAL', 'VENCIDA', 'PAGA', 'CANCELADA'],
                        },
                    },
                    {
                        name: 'vencimentoDe',
                        in: 'query',
                        schema: { type: 'string', format: 'date' },
                    },
                    {
                        name: 'vencimentoAte',
                        in: 'query',
                        schema: { type: 'string', format: 'date' },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Mensalidades paginadas.',
                        referencia('RespostaMensalidadesFinanceiras'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
        },
        '/financeiro/mensalidades/{mensalidadeId}': {
            get: {
                tags: ['Financeiro'],
                summary: 'Consultar mensalidade e recebimentos',
                description:
                    'Exige perfil ADMINISTRADOR; UUIDs fora da organização ou área retornam 404.',
                operationId: 'buscarMensalidadeFinanceira',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'mensalidadeId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Mensalidade encontrada.',
                        referencia('RespostaMensalidadeFinanceira'),
                    ),
                    ...erros('400', '401', '403', '404'),
                },
            },
        },
        '/financeiro/mensalidades/{mensalidadeId}/recebimentos': {
            post: {
                tags: ['Financeiro'],
                summary: 'Registrar recebimento manual',
                description:
                    'Exige perfil ADMINISTRADOR e Idempotency-Key. Aceita valor decimal como string, bloqueia excedente e serializa alterações por conta a receber.',
                operationId: 'registrarRecebimentoManual',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'mensalidadeId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string', format: 'uuid' },
                    },
                    {
                        name: 'Idempotency-Key',
                        in: 'header',
                        required: true,
                        schema: { type: 'string', minLength: 1, maxLength: 150 },
                    },
                ],
                requestBody: corpoJson(referencia('RegistrarRecebimentoFinanceiro')),
                responses: {
                    '201': respostaJson(
                        'Recebimento registrado.',
                        referencia('RespostaRecebimentoFinanceiro'),
                    ),
                    '200': respostaJson(
                        'Repetição idempotente.',
                        referencia('RespostaRecebimentoFinanceiro'),
                    ),
                    ...erros('400', '401', '403', '404', '409'),
                },
            },
        },
        '/financeiro/resumo': {
            get: {
                tags: ['Financeiro'],
                summary: 'Consultar resumo financeiro',
                description:
                    'Exige perfil ADMINISTRADOR. Os valores agregados ficam limitados à organização e à área atuais.',
                operationId: 'obterResumoFinanceiro',
                security: segurancaCookie,
                parameters: [
                    parametroOrganizacao,
                    parametroAreaContexto,
                    {
                        name: 'inicio',
                        in: 'query',
                        required: true,
                        schema: { type: 'string', format: 'date' },
                    },
                    {
                        name: 'fim',
                        in: 'query',
                        required: true,
                        schema: { type: 'string', format: 'date' },
                    },
                ],
                responses: {
                    '200': respostaJson(
                        'Resumo do período.',
                        referencia('RespostaResumoFinanceiro'),
                    ),
                    ...erros('400', '401', '403'),
                },
            },
        },
    },
    components: {
        headers: {
            RequestId: {
                description: 'Identificador de correlação da requisição.',
                schema: { type: 'string', format: 'uuid' },
            },
        },
        securitySchemes: {
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'token',
                description: 'JWT armazenado no cookie HTTP-only `token` pelo endpoint de login.',
            },
        },
        parameters: {
            OrganizacaoIdHeader: {
                name: 'x-organizacao-id',
                in: 'header',
                required: true,
                description: 'Organização ativa em que a operação será executada.',
                schema: { type: 'string', format: 'uuid' },
            },
            AreaNegocioIdHeader: {
                name: 'x-area-negocio-id',
                in: 'header',
                required: true,
                description: 'Área de negócio ativa para resolução do contexto.',
                schema: { type: 'string', format: 'uuid' },
            },
            AreaNegocioIdPath: {
                name: 'areaNegocioId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
            UsuarioIdPath: {
                name: 'usuarioId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
            ClienteIdPath: {
                name: 'clienteId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
            ServicoIdPath: {
                name: 'servicoId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
            ProfissionalIdPath: {
                name: 'profissionalId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
            AgendamentoIdPath: {
                name: 'agendamentoId',
                in: 'path',
                required: true,
                schema: { type: 'string', format: 'uuid' },
            },
        },
        responses: {
            ErroPadronizado: respostaJson('Erro padronizado da aplicação.', referencia('Erro')),
        },
        schemas: {
            RespostaSaude: {
                type: 'object',
                additionalProperties: false,
                required: ['situacao', 'timestamp'],
                properties: {
                    situacao: { type: 'string', const: 'OK' },
                    timestamp: { type: 'string', format: 'date-time' },
                },
            },
            Erro: {
                type: 'object',
                additionalProperties: true,
                required: ['situacao', 'codigo', 'mensagem', 'request_id'],
                properties: {
                    situacao: { type: 'string', const: 'falha' },
                    codigo: { type: 'string' },
                    mensagem: { type: 'string' },
                    request_id: { type: 'string' },
                },
            },
            LoginRequest: {
                type: 'object',
                additionalProperties: false,
                required: ['email', 'senha'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    senha: { type: 'string', format: 'password', minLength: 1, maxLength: 128 },
                },
            },
            UsuarioAuth: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'email'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                },
            },
            OrganizacaoAuth: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'perfil'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                    perfil: { type: 'string', enum: ['ADMINISTRADOR', 'OPERADOR'] },
                },
            },
            DadosAuth: {
                type: 'object',
                additionalProperties: false,
                required: ['usuario', 'organizacoes'],
                properties: {
                    usuario: referencia('UsuarioAuth'),
                    organizacoes: {
                        type: 'array',
                        items: referencia('OrganizacaoAuth'),
                    },
                },
            },
            RespostaAuth: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('DadosAuth'),
                },
            },
            RespostaLogout: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'null' },
                },
            },
            AreaNegocio: {
                type: 'object',
                additionalProperties: false,
                description:
                    "Registro completo retornado atualmente pelo `select('*')` de áreas de negócio.",
                required: [
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
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    organizacao_id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string', maxLength: 100 },
                    codigo: { type: 'string', maxLength: 50 },
                    descricao: { type: ['string', 'null'], maxLength: 255 },
                    ativo: { type: 'boolean' },
                    criado_em: { type: 'string', format: 'date-time' },
                    atualizado_em: { type: 'string', format: 'date-time' },
                    inativado_em: { type: ['string', 'null'], format: 'date-time' },
                    deletado_em: {
                        type: ['string', 'null'],
                        format: 'date-time',
                        description:
                            'A coluna é retornada pelo select, mas será null porque a consulta filtra registros soft-deleted.',
                    },
                },
            },
            ListaAreasNegocio: {
                type: 'array',
                items: referencia('AreaNegocio'),
            },
            Modulo: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'codigo', 'nome', 'descricao'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    codigo: { type: 'string' },
                    nome: { type: 'string' },
                    descricao: { type: ['string', 'null'] },
                },
            },
            RespostaModulos: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('Modulo') },
                },
            },
            RespostaContexto: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['usuarioId', 'organizacaoId', 'areaNegocioId', 'perfil'],
                        properties: {
                            usuarioId: { type: 'string', format: 'uuid' },
                            organizacaoId: { type: 'string', format: 'uuid' },
                            areaNegocioId: { type: 'string', format: 'uuid' },
                            perfil: { type: 'string', enum: ['ADMINISTRADOR', 'OPERADOR'] },
                        },
                    },
                },
            },
            OrganizacaoAtual: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'nome',
                    'nome_fantasia',
                    'razao_social',
                    'cpf_cnpj',
                    'email',
                    'telefone',
                    'fuso_horario',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string', maxLength: 150 },
                    nome_fantasia: { type: ['string', 'null'], maxLength: 150 },
                    razao_social: { type: ['string', 'null'], maxLength: 150 },
                    cpf_cnpj: { type: ['string', 'null'], maxLength: 20 },
                    email: { type: ['string', 'null'], format: 'email', maxLength: 150 },
                    telefone: { type: ['string', 'null'], maxLength: 20 },
                    fuso_horario: {
                        type: 'string',
                        maxLength: 50,
                        description: 'Identificador IANA de fuso horário.',
                    },
                },
            },
            AtualizacaoOrganizacaoAtual: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    nome: { type: 'string', minLength: 1, maxLength: 150 },
                    nome_fantasia: { type: ['string', 'null'], minLength: 1, maxLength: 150 },
                    razao_social: { type: ['string', 'null'], minLength: 1, maxLength: 150 },
                    cpf_cnpj: { type: ['string', 'null'], minLength: 1, maxLength: 20 },
                    email: { type: ['string', 'null'], format: 'email', maxLength: 150 },
                    telefone: { type: ['string', 'null'], minLength: 1, maxLength: 20 },
                    fuso_horario: { type: 'string', minLength: 1, maxLength: 50 },
                },
            },
            RespostaOrganizacaoAtual: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('OrganizacaoAtual'),
                },
            },
            UsuarioOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'email', 'perfil', 'ativo'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    perfil: { type: 'string', enum: ['ADMINISTRADOR', 'OPERADOR'] },
                    ativo: { type: 'boolean' },
                },
            },
            CriacaoUsuarioOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'email', 'senha', 'perfil'],
                properties: {
                    nome: { type: 'string', minLength: 1, maxLength: 150 },
                    email: { type: 'string', format: 'email', maxLength: 150 },
                    senha: { type: 'string', format: 'password', minLength: 12, maxLength: 128 },
                    perfil: { type: 'string', enum: ['ADMINISTRADOR', 'OPERADOR'] },
                },
            },
            AtualizacaoVinculoUsuario: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    perfil: { type: 'string', enum: ['ADMINISTRADOR', 'OPERADOR'] },
                    ativo: { type: 'boolean' },
                },
            },
            RespostaUsuariosOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('UsuarioOrganizacao') },
                },
            },
            RespostaUsuarioOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('UsuarioOrganizacao'),
                },
            },
            AreaCliente: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                },
            },
            ClienteResumo: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'cpf', 'telefone', 'email', 'ativo', 'areas'],
                properties: {
                    id: camposCliente.id,
                    nome: camposCliente.nome,
                    cpf: camposCliente.cpf,
                    telefone: camposCliente.telefone,
                    email: camposCliente.email,
                    ativo: camposCliente.ativo,
                    areas: { type: 'array', items: referencia('AreaCliente') },
                },
            },
            ClienteCriado: {
                type: 'object',
                additionalProperties: false,
                required: [...Object.keys(camposCliente), 'areas'],
                properties: {
                    ...camposCliente,
                    areas: { type: 'array', items: referencia('AreaCliente') },
                },
            },
            ClienteDetalhe: {
                type: 'object',
                additionalProperties: false,
                required: [
                    ...Object.keys(camposCliente),
                    'aceite_whatsapp_em',
                    'origem_aceite_whatsapp',
                    'opt_out_whatsapp_em',
                    'origem_opt_out_whatsapp',
                    'inativado_em',
                    'areas',
                ],
                properties: {
                    ...camposCliente,
                    aceite_whatsapp_em: { type: ['string', 'null'], format: 'date-time' },
                    origem_aceite_whatsapp: { type: ['string', 'null'], maxLength: 50 },
                    opt_out_whatsapp_em: { type: ['string', 'null'], format: 'date-time' },
                    origem_opt_out_whatsapp: { type: ['string', 'null'], maxLength: 50 },
                    inativado_em: { type: ['string', 'null'], format: 'date-time' },
                    areas: { type: 'array', items: referencia('AreaCliente') },
                },
            },
            CriacaoCliente: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'areas'],
                properties: {
                    ...camposCriacaoCliente,
                    areas: {
                        type: 'array',
                        minItems: 1,
                        uniqueItems: true,
                        items: { type: 'string', format: 'uuid' },
                    },
                },
            },
            AtualizacaoCliente: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                description:
                    'Campo omitido significa “não alterar”. `null` significa “limpar” nos campos nullable. Strings vazias ou compostas apenas por espaços são inválidas nesses campos; use `null` para limpá-los. Campos de autoridade e lifecycle, incluindo `ativo`, `inativado_em`, dados de WhatsApp e `organizacao_id`, não são aceitos.',
                properties: {
                    ...camposAtualizacaoCliente,
                    areas: {
                        type: 'array',
                        minItems: 1,
                        uniqueItems: true,
                        items: { type: 'string', format: 'uuid' },
                    },
                },
            },
            ConsentimentoWhatsappRequest: {
                type: 'object',
                additionalProperties: false,
                required: ['origem'],
                properties: {
                    origem: {
                        type: 'string',
                        minLength: 1,
                        pattern: '^\\s*(?:\\S(?:[\\s\\S]{0,48}\\S)?)\\s*$',
                        description:
                            'Origem livre do consentimento ou opt-out. Após trim, deve possuir entre 1 e 50 caracteres.',
                        example: 'PRESENCIAL',
                    },
                },
            },
            EstadoConsentimentoWhatsapp: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'aceite_whatsapp',
                    'aceite_whatsapp_em',
                    'origem_aceite_whatsapp',
                    'opt_out_whatsapp_em',
                    'origem_opt_out_whatsapp',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    aceite_whatsapp: { type: 'boolean' },
                    aceite_whatsapp_em: { type: ['string', 'null'], format: 'date-time' },
                    origem_aceite_whatsapp: { type: ['string', 'null'], maxLength: 50 },
                    opt_out_whatsapp_em: { type: ['string', 'null'], format: 'date-time' },
                    origem_opt_out_whatsapp: { type: ['string', 'null'], maxLength: 50 },
                },
            },
            RespostaConsentimentoWhatsapp: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('EstadoConsentimentoWhatsapp'),
                },
            },

            AlteracaoPermissaoClinica: {
                type: 'object',
                additionalProperties: false,
                required: ['autorizado'],
                description:
                    'true concede autorização clínica. false revoga. A operação exige permissão administrativa e todos os vínculos válidos.',
                properties: {
                    autorizado: {
                        type: 'boolean',
                        description: 'Estado desejado da autorização clínica.',
                    },
                },
            },
            EstadoPermissaoClinica: {
                type: 'object',
                additionalProperties: false,
                required: ['profissionalId', 'areaNegocioId', 'autorizado'],
                properties: {
                    profissionalId: {
                        type: 'string',
                        format: 'uuid',
                    },
                    areaNegocioId: {
                        type: 'string',
                        format: 'uuid',
                    },
                    autorizado: {
                        type: 'boolean',
                    },
                },
            },
            RespostaPermissaoClinica: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: {
                        type: 'string',
                        const: 'success',
                    },
                    message: {
                        type: 'string',
                    },
                    data: referencia('EstadoPermissaoClinica'),
                },
            },

            AlteracaoVinculoUsuarioProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['usuarioId'],
                description: 'Informe o UUID para vincular um usuário ou null para desvincular.',
                properties: {
                    usuarioId: {
                        type: ['string', 'null'],
                        format: 'uuid',
                    },
                },
            },
            EstadoVinculoUsuarioProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['profissionalId', 'usuarioId'],
                properties: {
                    profissionalId: {
                        type: 'string',
                        format: 'uuid',
                    },
                    usuarioId: {
                        type: ['string', 'null'],
                        format: 'uuid',
                    },
                },
            },
            RespostaVinculoUsuarioProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: {
                        type: 'string',
                        const: 'success',
                    },
                    message: {
                        type: 'string',
                    },
                    data: referencia('EstadoVinculoUsuarioProfissional'),
                },
            },
            UsuarioVinculadoProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                },
            },
            ConsultaVinculoUsuarioProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['profissionalId', 'usuario', 'vinculoAtivo'],
                properties: {
                    profissionalId: { type: 'string', format: 'uuid' },
                    usuario: {
                        oneOf: [referencia('UsuarioVinculadoProfissional'), { type: 'null' }],
                    },
                    vinculoAtivo: { type: 'boolean' },
                },
            },
            RespostaConsultaVinculoUsuarioProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('ConsultaVinculoUsuarioProfissional'),
                },
            },

            AreaVinculadaProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string', minLength: 1, maxLength: 150 },
                },
            },
            Profissional: {
                type: 'object',
                additionalProperties: false,
                required: [...Object.keys(camposProfissional), 'areas'],
                properties: {
                    ...camposProfissional,
                    areas: { type: 'array', items: referencia('AreaVinculadaProfissional') },
                },
            },
            ProfissionalDetalhe: {
                type: 'object',
                additionalProperties: false,
                required: [...Object.keys(camposProfissional), 'areas', 'inativado_em'],
                properties: {
                    ...camposProfissional,
                    inativado_em: { type: ['string', 'null'], format: 'date-time' },
                    areas: { type: 'array', items: referencia('AreaVinculadaProfissional') },
                },
            },
            EstadoProfissional: {
                type: 'object',
                additionalProperties: false,
                required: [...Object.keys(camposProfissional), 'inativado_em'],
                properties: {
                    ...camposProfissional,
                    inativado_em: { type: ['string', 'null'], format: 'date-time' },
                },
            },
            CriacaoProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'areas'],
                properties: camposEntradaProfissional,
            },
            AtualizacaoProfissional: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                description:
                    'Campos omitidos são preservados. null limpa cpf, email, telefone, conselho, numero_conselho e uf_conselho. O array areas, se fornecido, deve conter pelo menos um UUID único. Não permite ativo, usuario_id ou organizacao_id.',
                properties: {
                    ...camposEntradaProfissional,
                    cpf: { ...camposEntradaProfissional.cpf, type: ['string', 'null'] },
                    email: { ...camposEntradaProfissional.email, type: ['string', 'null'] },
                    telefone: { ...camposEntradaProfissional.telefone, type: ['string', 'null'] },
                    conselho: { ...camposEntradaProfissional.conselho, type: ['string', 'null'] },
                    numero_conselho: {
                        ...camposEntradaProfissional.numero_conselho,
                        type: ['string', 'null'],
                    },
                    uf_conselho: {
                        ...camposEntradaProfissional.uf_conselho,
                        type: ['string', 'null'],
                    },
                },
            },
            RespostaProfissionalCriado: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('Profissional'),
                },
            },
            RespostaProfissionais: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('Profissional') },
                },
            },
            RespostaProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('ProfissionalDetalhe'),
                },
            },
            RespostaEstadoProfissional: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('EstadoProfissional'),
                },
            },
            Servico: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'descricao', 'duracao_minutos', 'valor', 'ativo'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string', minLength: 1, maxLength: 150 },
                    descricao: { type: ['string', 'null'], minLength: 1, maxLength: 5000 },
                    duracao_minutos: { type: 'integer', minimum: 1, maximum: 1440 },
                    valor: {
                        type: ['string', 'null'],
                        pattern: '^(?:0|[1-9]\\d{0,9})\\.\\d{2}$',
                        description:
                            'Valor decimal retornado como string pelo driver PostgreSQL, com duas casas decimais.',
                        examples: ['120.00', null],
                    },
                    ativo: { type: 'boolean' },
                },
            },
            CriacaoServico: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'duracao_minutos'],
                properties: {
                    nome: {
                        type: 'string',
                        minLength: 1,
                        pattern: '^\\s*(?:\\S(?:[\\s\\S]{0,148}\\S)?)\\s*$',
                        description: 'Após trim, deve possuir entre 1 e 150 caracteres.',
                    },
                    descricao: {
                        type: 'string',
                        minLength: 1,
                        pattern: '^\\s*(?:\\S(?:[\\s\\S]{0,4998}\\S)?)\\s*$',
                        description: 'Após trim, deve possuir entre 1 e 5000 caracteres.',
                    },
                    duracao_minutos: { type: 'integer', minimum: 1, maximum: 1440 },
                    valor: {
                        type: 'number',
                        minimum: 0,
                        maximum: 9999999999.99,
                        multipleOf: 0.01,
                    },
                },
            },
            AtualizacaoServico: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                description:
                    'Campo omitido significa não alterar. `null` limpa apenas `descricao` ou `valor`. Campos de autoridade e lifecycle não são aceitos.',
                properties: {
                    nome: {
                        type: 'string',
                        minLength: 1,
                        pattern: '^\\s*(?:\\S(?:[\\s\\S]{0,148}\\S)?)\\s*$',
                        description: 'Após trim, deve possuir entre 1 e 150 caracteres.',
                    },
                    descricao: {
                        type: ['string', 'null'],
                        minLength: 1,
                        pattern: '^\\s*(?:\\S(?:[\\s\\S]{0,4998}\\S)?)\\s*$',
                        description:
                            'Após trim, deve possuir entre 1 e 5000 caracteres. Use null para limpar.',
                    },
                    duracao_minutos: { type: 'integer', minimum: 1, maximum: 1440 },
                    valor: {
                        type: ['number', 'null'],
                        minimum: 0,
                        maximum: 9999999999.99,
                        multipleOf: 0.01,
                    },
                },
            },
            RespostaServico: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('Servico'),
                },
            },
            RespostaServicos: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('Servico') },
                },
            },
            Agendamento: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'cliente_id',
                    'profissional_id',
                    'servico_id',
                    'inicio_em',
                    'fim_em',
                    'status',
                    'observacao',
                    'cancelado_em',
                    'cancelado_por_usuario_id',
                    'motivo_cancelamento',
                    'cliente_nome',
                    'profissional_nome',
                    'servico_nome',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    cliente_id: { type: 'string', format: 'uuid' },
                    profissional_id: { type: 'string', format: 'uuid' },
                    servico_id: { type: 'string', format: 'uuid' },
                    inicio_em: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Instante inequívoco serializado em ISO 8601.',
                    },
                    fim_em: {
                        type: 'string',
                        format: 'date-time',
                        description: 'Fim exclusivo do intervalo histórico contratado.',
                    },
                    status: {
                        type: 'string',
                        enum: ['AGENDADO', 'CONFIRMADO', 'CONCLUIDO', 'CANCELADO'],
                    },
                    observacao: { type: ['string', 'null'], maxLength: 5000 },
                    cancelado_em: { type: ['string', 'null'], format: 'date-time' },
                    cancelado_por_usuario_id: { type: ['string', 'null'], format: 'uuid' },
                    motivo_cancelamento: { type: ['string', 'null'], maxLength: 1000 },
                    cliente_nome: { type: 'string' },
                    profissional_nome: { type: 'string' },
                    servico_nome: { type: 'string' },
                },
            },
            CriacaoAgendamento: {
                type: 'object',
                additionalProperties: false,
                required: ['cliente_id', 'profissional_id', 'servico_id', 'inicio_em'],
                properties: {
                    cliente_id: { type: 'string', format: 'uuid' },
                    profissional_id: { type: 'string', format: 'uuid' },
                    servico_id: { type: 'string', format: 'uuid' },
                    inicio_em: {
                        type: 'string',
                        format: 'date-time',
                        pattern:
                            '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$',
                        description:
                            'RFC 3339 com Z ou offset explícito. Horário local ambíguo é inválido.',
                        example: '2026-11-10T14:00:00-03:00',
                    },
                    observacao: { type: 'string', maxLength: 5000 },
                },
            },
            AtualizacaoAgendamento: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                description:
                    'Aceita apenas início, profissional, serviço e observação. cliente_id, fim_em, status e campos de autoridade são proibidos. null limpa observacao.',
                properties: {
                    inicio_em: {
                        type: 'string',
                        format: 'date-time',
                        pattern:
                            '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$',
                    },
                    profissional_id: { type: 'string', format: 'uuid' },
                    servico_id: { type: 'string', format: 'uuid' },
                    observacao: { type: ['string', 'null'], maxLength: 5000 },
                },
            },
            CancelamentoAgendamento: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    motivo_cancelamento: { type: 'string', maxLength: 1000 },
                },
            },
            RespostaAgendamento: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('Agendamento'),
                },
            },
            RespostaAgendamentos: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('Agendamento') },
                },
            },
            RespostaClientes: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('ClienteResumo') },
                },
            },
            RespostaClienteCriado: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('ClienteCriado'),
                },
            },
            RespostaCliente: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('ClienteDetalhe'),
                },
            },
            PlanoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'nome',
                    'descricao',
                    'valor_base',
                    'periodicidade',
                    'area_negocio_id',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    nome: { type: 'string' },
                    descricao: { type: ['string', 'null'] },
                    valor_base: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,2})?$' },
                    periodicidade: { type: 'string' },
                    area_negocio_id: { type: ['string', 'null'], format: 'uuid' },
                    ativo: { type: 'boolean' },
                },
            },
            CriarPlanoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'valor_base'],
                properties: {
                    nome: { type: 'string', minLength: 1, maxLength: 150 },
                    descricao: { type: 'string', minLength: 1, maxLength: 2000 },
                    valor_base: {
                        type: 'string',
                        pattern: '^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,2})?$',
                    },
                },
            },
            RespostaPlanoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('PlanoFinanceiro'),
                },
            },
            RespostaPlanosFinanceiros: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: { type: 'array', items: referencia('PlanoFinanceiro') },
                },
            },
            CriarAssinaturaFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: ['cliente_id', 'plano_comercial_id', 'dia_vencimento', 'inicio_em'],
                properties: {
                    cliente_id: { type: 'string', format: 'uuid' },
                    plano_comercial_id: { type: 'string', format: 'uuid' },
                    dia_vencimento: { type: 'integer', minimum: 1, maximum: 31 },
                    inicio_em: { type: 'string', format: 'date' },
                },
            },
            AssinaturaFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'cliente_id',
                    'cliente_nome',
                    'plano_comercial_id',
                    'plano_nome',
                    'valor_contratado',
                    'desconto_recorrente',
                    'dia_vencimento',
                    'inicio_em',
                    'fim_em',
                    'status',
                    'criado_em',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    cliente_id: { type: 'string', format: 'uuid' },
                    cliente_nome: { type: 'string' },
                    plano_comercial_id: { type: 'string', format: 'uuid' },
                    plano_nome: { type: 'string' },
                    valor_contratado: { type: 'string' },
                    desconto_recorrente: { type: 'string' },
                    dia_vencimento: { type: 'integer' },
                    inicio_em: { type: 'string', format: 'date' },
                    fim_em: { type: ['string', 'null'], format: 'date' },
                    status: { type: 'string', enum: ['ATIVA', 'CANCELADA', 'ENCERRADA'] },
                    criado_em: { type: 'string', format: 'date-time' },
                },
            },
            RespostaAssinaturaFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('AssinaturaFinanceira'),
                },
            },
            RespostaAssinaturasFinanceiras: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['items', 'pagination'],
                        properties: {
                            items: { type: 'array', items: referencia('AssinaturaFinanceira') },
                            pagination: referencia('PaginacaoFinanceira'),
                        },
                    },
                },
            },
            GerarMensalidadeFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: ['competencia'],
                properties: {
                    competencia: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
                },
            },
            MensalidadeFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'id',
                    'conta_receber_id',
                    'assinatura_id',
                    'cliente_id',
                    'cliente_nome',
                    'competencia',
                    'valor_base',
                    'desconto_recorrente',
                    'ajuste_competencia',
                    'valor_final',
                    'vencimento_em',
                    'status_conta',
                    'valor_pago',
                    'saldo',
                    'status',
                ],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    conta_receber_id: { type: 'string', format: 'uuid' },
                    assinatura_id: { type: 'string', format: 'uuid' },
                    cliente_id: { type: 'string', format: 'uuid' },
                    cliente_nome: { type: 'string' },
                    competencia: { type: 'string', format: 'date' },
                    valor_base: { type: 'string' },
                    desconto_recorrente: { type: 'string' },
                    ajuste_competencia: { type: 'string' },
                    valor_final: { type: 'string' },
                    vencimento_em: { type: 'string', format: 'date' },
                    status_conta: { type: 'string' },
                    valor_pago: { type: 'string' },
                    saldo: { type: 'string' },
                    status: {
                        type: 'string',
                        enum: ['PENDENTE', 'PARCIAL', 'VENCIDA', 'PAGA', 'CANCELADA'],
                    },
                    pagamentos: { type: 'array', items: referencia('PagamentoFinanceiro') },
                },
            },
            PagamentoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'valor', 'forma_pagamento', 'origem', 'pago_em', 'criado_em'],
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    conta_receber_id: { type: 'string', format: 'uuid' },
                    valor: { type: 'string' },
                    forma_pagamento: { type: 'string' },
                    origem: { type: 'string', const: 'MANUAL' },
                    pago_em: {
                        type: 'string',
                        format: 'date-time',
                        pattern:
                            '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$',
                        description:
                            'ISO 8601 com fuso explícito e precisão de no máximo milissegundos.',
                    },
                    criado_em: { type: 'string', format: 'date-time' },
                },
            },
            PaginacaoFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: ['page', 'pageSize', 'total', 'pages'],
                properties: {
                    page: { type: 'integer' },
                    pageSize: { type: 'integer' },
                    total: { type: 'integer' },
                    pages: { type: 'integer' },
                },
            },
            RespostaMensalidadesFinanceiras: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['items', 'pagination'],
                        properties: {
                            items: { type: 'array', items: referencia('MensalidadeFinanceira') },
                            pagination: referencia('PaginacaoFinanceira'),
                        },
                    },
                },
            },
            RespostaMensalidadeFinanceira: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: referencia('MensalidadeFinanceira'),
                },
            },
            RespostaGeracaoMensalidade: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['mensalidade', 'criada'],
                        properties: {
                            mensalidade: referencia('MensalidadeFinanceira'),
                            criada: { type: 'boolean' },
                        },
                    },
                },
            },
            RegistrarRecebimentoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['valor', 'forma_pagamento', 'pago_em'],
                properties: {
                    valor: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,2})?$' },
                    forma_pagamento: { type: 'string', minLength: 1, maxLength: 30 },
                    pago_em: {
                        type: 'string',
                        format: 'date-time',
                        pattern:
                            '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$',
                        description:
                            'ISO 8601 com fuso explícito e precisão de no máximo milissegundos.',
                    },
                },
            },
            RespostaRecebimentoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['pagamento', 'mensalidade', 'repetido'],
                        properties: {
                            pagamento: referencia('PagamentoFinanceiro'),
                            mensalidade: referencia('MensalidadeFinanceira'),
                            repetido: { type: 'boolean' },
                        },
                    },
                },
            },
            RespostaResumoFinanceiro: {
                type: 'object',
                additionalProperties: false,
                required: ['status', 'message', 'data'],
                properties: {
                    status: { type: 'string', const: 'success' },
                    message: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                            'clientes_ativos',
                            'profissionais_ativos',
                            'mensalidades_em_aberto',
                            'mensalidades_vencidas',
                            'valor_em_aberto',
                            'valor_vencido',
                            'recebido_periodo',
                            'periodo',
                        ],
                        properties: {
                            clientes_ativos: { type: 'string' },
                            profissionais_ativos: { type: 'string' },
                            mensalidades_em_aberto: { type: 'string' },
                            mensalidades_vencidas: { type: 'string' },
                            valor_em_aberto: { type: 'string' },
                            valor_vencido: { type: 'string' },
                            recebido_periodo: { type: 'string' },
                            periodo: {
                                type: 'object',
                                required: ['inicio', 'fim'],
                                properties: {
                                    inicio: { type: 'string', format: 'date' },
                                    fim: { type: 'string', format: 'date' },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
} as const;

export default openApiDocument;
