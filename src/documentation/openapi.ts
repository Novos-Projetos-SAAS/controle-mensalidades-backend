const openApiDocument = {
    openapi: '3.1.0',
    info: {
        title: 'Plataforma Modular API',
        version: '1.0.0',
        description:
            'API REST versionada da plataforma modular de gestão de atendimentos e cobranças. A versão pública atual da API é v1.',
    },
    servers: [
        {
            url: '/api/v1',
            description: 'API v1',
        },
    ],
    tags: [
        {
            name: 'Saúde',
            description: 'Monitoramento da aplicação.',
        },
        {
            name: 'Usuários',
            description: 'Gestão dos vínculos de usuários com a organização atual.',
        },
        {
            name: 'Organizações',
            description: 'Consulta e atualização dos dados básicos da organização atual.',
        },
    ],
    paths: {
        '/health': {
            get: {
                tags: ['Saúde'],
                summary: 'Consultar saúde da API',
                operationId: 'consultarSaude',
                responses: {
                    '200': {
                        description: 'Aplicação disponível.',
                        headers: {
                            'X-Request-Id': {
                                description: 'Identificador de correlação da requisição.',
                                schema: {
                                    type: 'string',
                                },
                            },
                        },
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaSaude',
                                },
                            },
                        },
                    },
                },
            },
        },
        '/organizacoes/atual': {
            get: {
                tags: ['Organizações'],
                summary: 'Consultar a organização atual',
                operationId: 'consultarOrganizacaoAtual',
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: 'x-organizacao-id',
                        in: 'header',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Dados básicos seguros da organização atual.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaOrganizacaoAtual',
                                },
                            },
                        },
                    },
                    '400': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '401': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '403': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '404': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                },
            },
            patch: {
                tags: ['Organizações'],
                summary: 'Atualizar a organização atual',
                operationId: 'atualizarOrganizacaoAtual',
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: 'x-organizacao-id',
                        in: 'header',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/AtualizacaoOrganizacaoAtual',
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Organização atualizada com sucesso.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaOrganizacaoAtual',
                                },
                            },
                        },
                    },
                    '400': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '401': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '403': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '404': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                },
            },
        },
        '/usuarios': {
            post: {
                tags: ['Usuários'],
                summary: 'Criar usuário e vinculá-lo à organização',
                operationId: 'criarUsuarioOrganizacao',
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: 'x-organizacao-id',
                        in: 'header',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/CriacaoUsuarioOrganizacao',
                            },
                        },
                    },
                },
                responses: {
                    '201': {
                        description: 'Usuário criado e vinculado à organização.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaUsuarioOrganizacao',
                                },
                            },
                        },
                    },
                    '400': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '401': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '403': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '409': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                },
            },
            get: {
                tags: ['Usuários'],
                summary: 'Listar usuários da organização',
                operationId: 'listarUsuariosOrganizacao',
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: 'x-organizacao-id',
                        in: 'header',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Usuários vinculados à organização.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaUsuariosOrganizacao',
                                },
                            },
                        },
                    },
                    '401': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '403': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                },
            },
        },
        '/usuarios/{usuarioId}': {
            patch: {
                tags: ['Usuários'],
                summary: 'Atualizar vínculo do usuário com a organização',
                operationId: 'atualizarVinculoUsuarioOrganizacao',
                security: [{ cookieAuth: [] }],
                parameters: [
                    {
                        name: 'usuarioId',
                        in: 'path',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                    {
                        name: 'x-organizacao-id',
                        in: 'header',
                        required: true,
                        schema: {
                            type: 'string',
                            format: 'uuid',
                        },
                    },
                ],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/AtualizacaoVinculoUsuario',
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Vínculo atualizado com sucesso.',
                        content: {
                            'application/json': {
                                schema: {
                                    $ref: '#/components/schemas/RespostaUsuarioOrganizacao',
                                },
                            },
                        },
                    },
                    '400': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '401': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '403': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '404': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                    '409': {
                        $ref: '#/components/responses/ErroPadronizado',
                    },
                },
            },
        },
    },
    components: {
        securitySchemes: {
            cookieAuth: {
                type: 'apiKey',
                in: 'cookie',
                name: 'token',
            },
        },
        responses: {
            ErroPadronizado: {
                description: 'Erro padronizado da aplicação.',
                content: {
                    'application/json': {
                        schema: {
                            $ref: '#/components/schemas/ErroPadronizado',
                        },
                    },
                },
            },
        },
        schemas: {
            RespostaSaude: {
                type: 'object',
                additionalProperties: false,
                required: ['situacao', 'timestamp'],
                properties: {
                    situacao: {
                        type: 'string',
                        const: 'OK',
                        examples: ['OK'],
                    },
                    timestamp: {
                        type: 'string',
                        format: 'date-time',
                    },
                },
            },
            ErroPadronizado: {
                type: 'object',
                additionalProperties: true,
                required: ['situacao', 'codigo', 'mensagem', 'request_id'],
                properties: {
                    situacao: {
                        type: 'string',
                        const: 'falha',
                    },
                    codigo: {
                        type: 'string',
                    },
                    mensagem: {
                        type: 'string',
                    },
                    request_id: {
                        type: 'string',
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
                    id: {
                        type: 'string',
                        format: 'uuid',
                    },
                    nome: {
                        type: 'string',
                        maxLength: 150,
                    },
                    nome_fantasia: {
                        type: ['string', 'null'],
                        maxLength: 150,
                    },
                    razao_social: {
                        type: ['string', 'null'],
                        maxLength: 150,
                    },
                    cpf_cnpj: {
                        type: ['string', 'null'],
                        maxLength: 20,
                    },
                    email: {
                        type: ['string', 'null'],
                        format: 'email',
                        maxLength: 150,
                    },
                    telefone: {
                        type: ['string', 'null'],
                        maxLength: 20,
                    },
                    fuso_horario: {
                        type: 'string',
                        maxLength: 50,
                        description: 'Identificador de fuso horário IANA.',
                        examples: ['America/Sao_Paulo'],
                    },
                },
            },
            AtualizacaoOrganizacaoAtual: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    nome: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 150,
                    },
                    nome_fantasia: {
                        type: ['string', 'null'],
                        minLength: 1,
                        maxLength: 150,
                    },
                    razao_social: {
                        type: ['string', 'null'],
                        minLength: 1,
                        maxLength: 150,
                    },
                    cpf_cnpj: {
                        type: ['string', 'null'],
                        minLength: 1,
                        maxLength: 20,
                    },
                    email: {
                        type: ['string', 'null'],
                        format: 'email',
                        maxLength: 150,
                    },
                    telefone: {
                        type: ['string', 'null'],
                        minLength: 1,
                        maxLength: 20,
                    },
                    fuso_horario: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 50,
                        description: 'Identificador de fuso horário IANA válido.',
                        examples: ['America/Sao_Paulo'],
                    },
                },
            },
            RespostaOrganizacaoAtual: {
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
                    data: {
                        $ref: '#/components/schemas/OrganizacaoAtual',
                    },
                },
            },
            UsuarioOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'nome', 'email', 'perfil', 'ativo'],
                properties: {
                    id: {
                        type: 'string',
                        format: 'uuid',
                    },
                    nome: {
                        type: 'string',
                    },
                    email: {
                        type: 'string',
                        format: 'email',
                    },
                    perfil: {
                        type: 'string',
                        enum: ['ADMINISTRADOR', 'OPERADOR'],
                    },
                    ativo: {
                        type: 'boolean',
                    },
                },
            },
            AtualizacaoVinculoUsuario: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                    perfil: {
                        type: 'string',
                        enum: ['ADMINISTRADOR', 'OPERADOR'],
                    },
                    ativo: {
                        type: 'boolean',
                    },
                },
            },
            CriacaoUsuarioOrganizacao: {
                type: 'object',
                additionalProperties: false,
                required: ['nome', 'email', 'senha', 'perfil'],
                properties: {
                    nome: {
                        type: 'string',
                        maxLength: 150,
                    },
                    email: {
                        type: 'string',
                        format: 'email',
                        maxLength: 150,
                    },
                    senha: {
                        type: 'string',
                        minLength: 12,
                        maxLength: 128,
                        format: 'password',
                    },
                    perfil: {
                        type: 'string',
                        enum: ['ADMINISTRADOR', 'OPERADOR'],
                    },
                },
            },
            RespostaUsuariosOrganizacao: {
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
                    data: {
                        type: 'array',
                        items: {
                            $ref: '#/components/schemas/UsuarioOrganizacao',
                        },
                    },
                },
            },
            RespostaUsuarioOrganizacao: {
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
                    data: {
                        $ref: '#/components/schemas/UsuarioOrganizacao',
                    },
                },
            },
        },
    },
} as const;

export default openApiDocument;
