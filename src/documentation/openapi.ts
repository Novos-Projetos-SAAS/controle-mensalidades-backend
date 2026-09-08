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
    ],
    paths: {
        '/saude': {
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
    },
    components: {
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
        },
    },
} as const;

export default openApiDocument;
