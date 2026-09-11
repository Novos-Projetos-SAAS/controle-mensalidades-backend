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

const openApiDocument = {
    openapi: '3.1.0',
    info: {
        title: 'Sistema de Mensalidades API',
        version: '1.0.0',
        description: 'API REST v1 para autenticação, contexto organizacional e gestão de clientes.',
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
        },
    },
} as const;

export default openApiDocument;
