import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();

const adminAId = crypto.randomUUID();
const operadorAId = crypto.randomUUID();

const areaA1Id = crypto.randomUUID();
const areaA2Id = crypto.randomUUID();
const areaAInativaId = crypto.randomUUID();
const areaADeletadaId = crypto.randomUUID();
const areaBId = crypto.randomUUID();

function obterJwtSecretTeste() {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwtSecret;
}

function gerarToken(usuarioId: string) {
    return jwt.sign({}, obterJwtSecretTeste(), {
        subject: usuarioId,
        expiresIn: '1h',
    });
}

function cookieDoUsuario(usuarioId: string) {
    return `token=${gerarToken(usuarioId)}`;
}

async function limparClientes() {
    const clientes = await connection('clientes')
        .select('id')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId]);

    const clientesIds = clientes.map((cliente) => cliente.id);

    if (clientesIds.length > 0) {
        await connection('clientes_areas').whereIn('cliente_id', clientesIds).del();

        await connection('clientes').whereIn('id', clientesIds).del();
    }
}

async function limparAuditorias() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
}

async function limparDadosTeste() {
    await limparAuditorias();
    await limparClientes();

    await connection('areas_negocio')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();

    await connection('usuarios_organizacoes').whereIn('usuario_id', [adminAId, operadorAId]).del();

    await connection('usuarios').whereIn('id', [adminAId, operadorAId]).del();

    await connection('organizacoes').whereIn('id', [organizacaoAId, organizacaoBId]).del();
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoAId,
            nome: 'Organização A Clientes',
            ativo: true,
        },
        {
            id: organizacaoBId,
            nome: 'Organização B Clientes',
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: adminAId,
            nome: 'Administrador A',
            email: `admin-clientes-${adminAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador A',
            email: `operador-clientes-${operadorAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
    ]);

    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: adminAId,
            organizacao_id: organizacaoAId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: operadorAId,
            organizacao_id: organizacaoAId,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaA1Id,
            organizacao_id: organizacaoAId,
            nome: 'Fisioterapia',
            codigo: `FISIO-${areaA1Id}`,
            ativo: true,
        },
        {
            id: areaA2Id,
            organizacao_id: organizacaoAId,
            nome: 'Pilates',
            codigo: `PILATES-${areaA2Id}`,
            ativo: true,
        },
        {
            id: areaAInativaId,
            organizacao_id: organizacaoAId,
            nome: 'Área Inativa',
            codigo: `INATIVA-${areaAInativaId}`,
            ativo: false,
        },
        {
            id: areaADeletadaId,
            organizacao_id: organizacaoAId,
            nome: 'Área Deletada',
            codigo: `DELETADA-${areaADeletadaId}`,
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: areaBId,
            organizacao_id: organizacaoBId,
            nome: 'Área Organização B',
            codigo: `AREA-B-${areaBId}`,
            ativo: true,
        },
    ]);
});

beforeEach(async () => {
    await limparAuditorias();
    await limparClientes();
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

async function criarClienteTeste(
    organizacaoId: string,
    dados: {
        nome: string;
        cpf?: string;
        dataNascimento?: string;
        telefone?: string;
        email?: string;
        sexo?: string;
        cep?: string;
        logradouro?: string;
        numero?: string;
        complemento?: string;
        bairro?: string;
        cidade?: string;
        uf?: string;
        observacao?: string;
        ativo?: boolean;
        deletadoEm?: Date;
        areas?: string[];
    },
) {
    const clienteId = crypto.randomUUID();

    await connection('clientes').insert({
        id: clienteId,
        organizacao_id: organizacaoId,
        nome: dados.nome,
        cpf: dados.cpf ?? null,
        data_nascimento: dados.dataNascimento ?? null,
        telefone: dados.telefone ?? null,
        email: dados.email ?? null,
        sexo: dados.sexo ?? null,
        cep: dados.cep ?? null,
        logradouro: dados.logradouro ?? null,
        numero: dados.numero ?? null,
        complemento: dados.complemento ?? null,
        bairro: dados.bairro ?? null,
        cidade: dados.cidade ?? null,
        uf: dados.uf ?? null,
        observacao: dados.observacao ?? null,
        ativo: dados.ativo ?? true,
        deletado_em: dados.deletadoEm ?? null,
    });

    if (dados.areas?.length) {
        await connection('clientes_areas').insert(
            dados.areas.map((areaNegocioId) => ({
                cliente_id: clienteId,
                area_negocio_id: areaNegocioId,
                ativo: true,
            })),
        );
    }

    return clienteId;
}

test('ADMINISTRADOR deve criar cliente normalizado, vinculado às áreas e auditado', async () => {
    const response = await request(app)
        .post('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: '  João da Silva  ',
            cpf: '123.456.789-01',
            data_nascimento: '1990-05-20',
            telefone: '(18) 99999-9999',
            email: '  JOAO@EXEMPLO.COM  ',
            sexo: 'Masculino',
            cep: '16000-000',
            logradouro: '  Rua Exemplo  ',
            numero: '  123  ',
            complemento: '  Sala 2  ',
            bairro: '  Centro  ',
            cidade: '  Araçatuba  ',
            uf: ' sp ',
            observacao: '  Cliente de teste  ',
            areas: [areaA1Id, areaA2Id],
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Cliente criado com sucesso.');

    assert.equal(response.body.data.nome, 'João da Silva');
    assert.equal(response.body.data.cpf, '12345678901');
    assert.equal(response.body.data.telefone, '18999999999');
    assert.equal(response.body.data.email, 'joao@exemplo.com');
    assert.equal(response.body.data.cep, '16000000');
    assert.equal(response.body.data.uf, 'SP');
    assert.equal(response.body.data.ativo, true);
    assert.equal(response.body.data.aceite_whatsapp, false);

    const clienteId = response.body.data.id;

    const cliente = await connection('clientes')
        .where({
            id: clienteId,
            organizacao_id: organizacaoAId,
        })
        .first();

    assert.ok(cliente);
    assert.equal(cliente.nome, 'João da Silva');
    assert.equal(cliente.cpf, '12345678901');
    assert.equal(cliente.telefone, '18999999999');
    assert.equal(cliente.email, 'joao@exemplo.com');
    assert.equal(cliente.cep, '16000000');
    assert.equal(cliente.uf, 'SP');
    assert.equal(cliente.ativo, true);
    assert.equal(cliente.aceite_whatsapp, false);

    const vinculos = await connection('clientes_areas')
        .select('area_negocio_id', 'ativo')
        .where('cliente_id', clienteId);

    assert.equal(vinculos.length, 2);

    assert.deepEqual(
        vinculos.map((vinculo) => vinculo.area_negocio_id).sort(),
        [areaA1Id, areaA2Id].sort(),
    );

    assert.equal(
        vinculos.every((vinculo) => vinculo.ativo === true),
        true,
    );

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'CLIENTE.CRIADO',
            recurso: 'CLIENTE',
            recurso_id: clienteId,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.usuario_id, adminAId);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, null);
    assert.equal(auditoria.dados_contexto.clienteId, clienteId);

    assert.deepEqual([...auditoria.dados_contexto.areas].sort(), [areaA1Id, areaA2Id].sort());

    assert.equal('cpf' in auditoria.dados_contexto, false);
    assert.equal('telefone' in auditoria.dados_contexto, false);
    assert.equal('email' in auditoria.dados_contexto, false);
    assert.equal('observacao' in auditoria.dados_contexto, false);
});

test('OPERADOR deve poder criar cliente', async () => {
    const response = await request(app)
        .post('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Cliente do Operador',
            areas: [areaA1Id],
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.nome, 'Cliente do Operador');
    assert.equal(response.body.data.ativo, true);

    const cliente = await connection('clientes')
        .where({
            id: response.body.data.id,
            organizacao_id: organizacaoAId,
        })
        .first();

    assert.ok(cliente);
});

test('POST deve impedir vínculo com área de outra organização', async () => {
    const response = await request(app)
        .post('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Cliente Cross Tenant',
            cpf: '11122233344',
            areas: [areaA1Id, areaBId],
        });

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');

    const cliente = await connection('clientes')
        .where({
            organizacao_id: organizacaoAId,
            cpf: '11122233344',
        })
        .first();

    assert.equal(cliente, undefined);
});

test('POST deve rejeitar área inativa ou soft-deleted', async () => {
    for (const areaId of [areaAInativaId, areaADeletadaId]) {
        const response = await request(app)
            .post('/api/v1/clientes')
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send({
                nome: 'Cliente Área Inválida',
                areas: [areaId],
            });

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');
    }
});

test('POST deve rejeitar CPF duplicado dentro da mesma organização', async () => {
    const primeiro = await request(app)
        .post('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Primeiro Cliente',
            cpf: '22233344455',
            areas: [areaA1Id],
        });

    assert.equal(primeiro.status, 201);

    const segundo = await request(app)
        .post('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Segundo Cliente',
            cpf: '222.333.444-55',
            areas: [areaA2Id],
        });

    assert.equal(segundo.status, 409);
    assert.equal(segundo.body.codigo, 'CLIENTE_CPF_JA_CADASTRADO');
    assert.equal(segundo.body.mensagem, 'Já existe um cliente cadastrado com este CPF.');

    const clientes = await connection('clientes').where({
        organizacao_id: organizacaoAId,
        cpf: '22233344455',
    });

    assert.equal(clientes.length, 1);
});

test('POST deve rejeitar dados inválidos, áreas duplicadas e campos de autoridade', async () => {
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
    };

    const semAreas = await request(app).post('/api/v1/clientes').set(cabecalhos).send({
        nome: 'Sem Área',
        areas: [],
    });

    const areasDuplicadas = await request(app)
        .post('/api/v1/clientes')
        .set(cabecalhos)
        .send({
            nome: 'Áreas Duplicadas',
            areas: [areaA1Id, areaA1Id],
        });

    const cpfInvalido = await request(app)
        .post('/api/v1/clientes')
        .set(cabecalhos)
        .send({
            nome: 'CPF Inválido',
            cpf: '123',
            areas: [areaA1Id],
        });

    const campoProibido = await request(app)
        .post('/api/v1/clientes')
        .set(cabecalhos)
        .send({
            nome: 'Campo Proibido',
            areas: [areaA1Id],
            organizacao_id: organizacaoBId,
            ativo: false,
        });

    for (const response of [semAreas, areasDuplicadas, cpfInvalido, campoProibido]) {
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_CLIENTE_INVALIDOS');
        assert.equal(response.body.mensagem, 'Dados do cliente inválidos.');
    }
});

test('requisições concorrentes não devem criar CPF duplicado', async () => {
    const cpf = '33344455566';

    const dados = {
        nome: 'Cliente Concorrente',
        cpf,
        areas: [areaA1Id],
    };

    const respostas = await Promise.all([
        request(app)
            .post('/api/v1/clientes')
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send(dados),
        request(app)
            .post('/api/v1/clientes')
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send(dados),
    ]);

    assert.deepEqual(respostas.map((response) => response.status).sort(), [201, 409]);

    const respostaConflito = respostas.find((response) => response.status === 409);

    assert.ok(respostaConflito);
    assert.equal(respostaConflito.body.codigo, 'CLIENTE_CPF_JA_CADASTRADO');

    const clientes = await connection('clientes').select('id').where({
        organizacao_id: organizacaoAId,
        cpf,
    });

    assert.equal(clientes.length, 1);

    const vinculos = await connection('clientes_areas').where('cliente_id', clientes[0].id);

    assert.equal(vinculos.length, 1);
    assert.equal(vinculos[0].area_negocio_id, areaA1Id);
});

test('GET /clientes deve listar apenas clientes da organização atual com suas áreas', async () => {
    const clienteA1Id = await criarClienteTeste(organizacaoAId, {
        nome: 'Ana Fisioterapia',
        cpf: '11111111111',
        email: 'ana@teste.com',
        areas: [areaA1Id],
    });

    const clienteA2Id = await criarClienteTeste(organizacaoAId, {
        nome: 'Bruno Pilates',
        cpf: '22222222222',
        areas: [areaA2Id],
    });

    const clienteBId = await criarClienteTeste(organizacaoBId, {
        nome: 'Cliente Organização B',
        cpf: '33333333333',
        areas: [areaBId],
    });

    const response = await request(app)
        .get('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Clientes listados com sucesso.');

    const ids = response.body.data.map((cliente: { id: string }) => cliente.id);

    assert.equal(ids.includes(clienteA1Id), true);
    assert.equal(ids.includes(clienteA2Id), true);
    assert.equal(ids.includes(clienteBId), false);

    const ana = response.body.data.find((cliente: { id: string }) => cliente.id === clienteA1Id);

    assert.ok(ana);
    assert.deepEqual(ana.areas, [
        {
            id: areaA1Id,
            nome: 'Fisioterapia',
        },
    ]);

    for (const cliente of response.body.data) {
        assert.equal('organizacao_id' in cliente, false);
        assert.equal('deletado_em' in cliente, false);
    }
});

test('GET /clientes deve permitir busca textual por nome e email', async () => {
    const mariaId = await criarClienteTeste(organizacaoAId, {
        nome: 'Maria Oliveira',
        email: 'maria.especial@teste.com',
        areas: [areaA1Id],
    });

    await criarClienteTeste(organizacaoAId, {
        nome: 'João Souza',
        email: 'joao@teste.com',
        areas: [areaA1Id],
    });

    const porNome = await request(app)
        .get('/api/v1/clientes')
        .query({ busca: 'maria' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(porNome.status, 200);
    assert.deepEqual(
        porNome.body.data.map((cliente: { id: string }) => cliente.id),
        [mariaId],
    );

    const porEmail = await request(app)
        .get('/api/v1/clientes')
        .query({ busca: 'ESPECIAL' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(porEmail.status, 200);
    assert.deepEqual(
        porEmail.body.data.map((cliente: { id: string }) => cliente.id),
        [mariaId],
    );
});

test('GET /clientes deve normalizar busca numérica para CPF e telefone', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Numérico',
        cpf: '52998224725',
        telefone: '18999998888',
        areas: [areaA1Id],
    });

    const porCpf = await request(app)
        .get('/api/v1/clientes')
        .query({ busca: '529.982.247-25' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(porCpf.status, 200);
    assert.deepEqual(
        porCpf.body.data.map((cliente: { id: string }) => cliente.id),
        [clienteId],
    );

    const porTelefone = await request(app)
        .get('/api/v1/clientes')
        .query({ busca: '(18) 99999-8888' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(porTelefone.status, 200);
    assert.deepEqual(
        porTelefone.body.data.map((cliente: { id: string }) => cliente.id),
        [clienteId],
    );
});

test('GET /clientes deve filtrar por situação ativa e inativa', async () => {
    const ativoId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Ativo',
        ativo: true,
        areas: [areaA1Id],
    });

    const inativoId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Inativo',
        ativo: false,
        areas: [areaA1Id],
    });

    const ativos = await request(app)
        .get('/api/v1/clientes')
        .query({ ativo: 'true' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(ativos.status, 200);
    assert.equal(
        ativos.body.data.some((cliente: { id: string }) => cliente.id === ativoId),
        true,
    );
    assert.equal(
        ativos.body.data.some((cliente: { id: string }) => cliente.id === inativoId),
        false,
    );

    const inativos = await request(app)
        .get('/api/v1/clientes')
        .query({ ativo: 'false' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(inativos.status, 200);
    assert.deepEqual(
        inativos.body.data.map((cliente: { id: string }) => cliente.id),
        [inativoId],
    );
});

test('GET /clientes deve filtrar por área da organização atual', async () => {
    const fisioId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Fisioterapia',
        areas: [areaA1Id],
    });

    const pilatesId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Pilates',
        areas: [areaA2Id],
    });

    const ambosId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Ambas Áreas',
        areas: [areaA1Id, areaA2Id],
    });

    const response = await request(app)
        .get('/api/v1/clientes')
        .query({ areaNegocioId: areaA1Id })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);

    const ids = response.body.data.map((cliente: { id: string }) => cliente.id);

    assert.equal(ids.includes(fisioId), true);
    assert.equal(ids.includes(ambosId), true);
    assert.equal(ids.includes(pilatesId), false);
});

test('GET /clientes deve rejeitar filtro por área de outra organização', async () => {
    const response = await request(app)
        .get('/api/v1/clientes')
        .query({ areaNegocioId: areaBId })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');

    assert.equal(JSON.stringify(response.body).includes(organizacaoBId), false);
});

test('GET /clientes deve ignorar clientes soft-deleted', async () => {
    const visivelId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Visível',
        areas: [areaA1Id],
    });

    const deletadoId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Deletado',
        deletadoEm: new Date(),
        areas: [areaA1Id],
    });

    const response = await request(app)
        .get('/api/v1/clientes')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);

    const ids = response.body.data.map((cliente: { id: string }) => cliente.id);

    assert.equal(ids.includes(visivelId), true);
    assert.equal(ids.includes(deletadoId), false);
});

test('GET /clientes/:clienteId deve retornar detalhe completo do cliente', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Detalhe',
        cpf: '44455566677',
        telefone: '18988887777',
        email: 'detalhe@teste.com',
        areas: [areaA1Id, areaA2Id],
    });

    const response = await request(app)
        .get(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Cliente encontrado com sucesso.');

    assert.equal(response.body.data.id, clienteId);
    assert.equal(response.body.data.nome, 'Cliente Detalhe');
    assert.equal(response.body.data.cpf, '44455566677');
    assert.equal(response.body.data.telefone, '18988887777');
    assert.equal(response.body.data.email, 'detalhe@teste.com');

    assert.deepEqual(
        response.body.data.areas.map((area: { id: string }) => area.id).sort(),
        [areaA1Id, areaA2Id].sort(),
    );

    assert.equal('organizacao_id' in response.body.data, false);
    assert.equal('deletado_em' in response.body.data, false);
});

test('GET /clientes/:clienteId não deve expor cliente de outra organização', async () => {
    const clienteBId = await criarClienteTeste(organizacaoBId, {
        nome: 'Cliente Secreto B',
        cpf: '55566677788',
        areas: [areaBId],
    });

    const response = await request(app)
        .get(`/api/v1/clientes/${clienteBId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'CLIENTE_NAO_ENCONTRADO');
    assert.equal(response.body.mensagem, 'Cliente não encontrado.');

    assert.equal(JSON.stringify(response.body).includes('Cliente Secreto B'), false);
});

test('GET /clientes/:clienteId deve rejeitar UUID inválido', async () => {
    const response = await request(app)
        .get('/api/v1/clientes/id-invalido')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'CLIENTE_ID_INVALIDO');
});

test('GET /clientes deve rejeitar filtros inválidos', async () => {
    const ativoInvalido = await request(app)
        .get('/api/v1/clientes')
        .query({ ativo: 'talvez' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    const areaInvalida = await request(app)
        .get('/api/v1/clientes')
        .query({ areaNegocioId: 'nao-e-uuid' })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    const filtroDesconhecido = await request(app)
        .get('/api/v1/clientes')
        .query({ organizacao_id: organizacaoBId })
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);

    for (const response of [ativoInvalido, areaInvalida, filtroDesconhecido]) {
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'FILTROS_CLIENTES_INVALIDOS');
    }
});

test('ADMINISTRADOR deve atualizar parcialmente o cliente sem alterar campo omitido', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Antes',
        telefone: '18999990000',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: '  Cliente Depois  ' });

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Cliente atualizado com sucesso.');
    assert.equal(response.body.data.nome, 'Cliente Depois');
    assert.equal(response.body.data.telefone, '18999990000');
    assert.deepEqual(response.body.data.areas, [{ id: areaA1Id, nome: 'Fisioterapia' }]);
    assert.equal('organizacao_id' in response.body.data, false);
    assert.equal('deletado_em' in response.body.data, false);
});

test('OPERADOR deve poder atualizar cliente', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente do Operador',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ numero: '  55-A  ' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.numero, '55-A');
});

test('PATCH deve normalizar CPF, telefone, email, CEP e UF', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Normalização',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            cpf: '529.982.247-25',
            telefone: '(18) 99999-1234',
            email: '  NORMALIZADO@EXEMPLO.COM  ',
            cep: '16000-123',
            uf: ' sp ',
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.cpf, '52998224725');
    assert.equal(response.body.data.telefone, '18999991234');
    assert.equal(response.body.data.email, 'normalizado@exemplo.com');
    assert.equal(response.body.data.cep, '16000123');
    assert.equal(response.body.data.uf, 'SP');
});

test('PATCH deve usar null para limpar todos os campos nullable e preservar áreas', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Campos Preenchidos',
        cpf: '11122233344',
        dataNascimento: '1995-08-10',
        telefone: '18999991111',
        email: 'preenchido@teste.com',
        sexo: 'Feminino',
        cep: '16000100',
        logradouro: 'Rua Um',
        numero: '10',
        complemento: 'Sala A',
        bairro: 'Centro',
        cidade: 'Araçatuba',
        uf: 'SP',
        observacao: 'Observação inicial',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            cpf: null,
            data_nascimento: null,
            telefone: null,
            email: null,
            sexo: null,
            cep: null,
            logradouro: null,
            numero: null,
            complemento: null,
            bairro: null,
            cidade: null,
            uf: null,
            observacao: null,
        });

    assert.equal(response.status, 200);

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
        assert.equal(response.body.data[campo], null);
    }

    assert.deepEqual(response.body.data.areas, [{ id: areaA1Id, nome: 'Fisioterapia' }]);
});

test('PATCH deve rejeitar body vazio e campos proibidos', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Validação',
        areas: [areaA1Id],
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
    };
    const bodyVazio = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set(cabecalhos)
        .send({});
    const camposProibidos = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set(cabecalhos)
        .send({
            organizacao_id: organizacaoBId,
            ativo: false,
            aceite_whatsapp: true,
        });

    for (const response of [bodyVazio, camposProibidos]) {
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_CLIENTE_INVALIDOS');
        assert.equal(response.body.mensagem, 'Dados do cliente inválidos.');
    }
});

test('PATCH deve rejeitar UUID de cliente inválido', async () => {
    const response = await request(app)
        .patch('/api/v1/clientes/id-invalido')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: 'Nome válido' });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'CLIENTE_ID_INVALIDO');
});

test('PATCH não deve expor nem atualizar cliente de outra organização', async () => {
    const clienteBId = await criarClienteTeste(organizacaoBId, {
        nome: 'Cliente Protegido B',
        areas: [areaBId],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteBId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: 'Tentativa Cross Tenant' });

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'CLIENTE_NAO_ENCONTRADO');
    assert.equal(response.body.mensagem, 'Cliente não encontrado.');

    const clienteB = await connection('clientes').select('nome').where('id', clienteBId).first();

    assert.equal(clienteB.nome, 'Cliente Protegido B');
});

test('PATCH deve tratar cliente soft-deleted como não encontrado', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Deletado',
        deletadoEm: new Date(),
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ nome: 'Não Deve Alterar' });

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'CLIENTE_NAO_ENCONTRADO');
});

test('PATCH deve rejeitar CPF de outro cliente da mesma organização', async () => {
    await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente CPF Existente',
        cpf: '12345678901',
        areas: [areaA1Id],
    });
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente CPF Novo',
        cpf: '98765432100',
        areas: [areaA2Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ cpf: '123.456.789-01' });

    assert.equal(response.status, 409);
    assert.equal(response.body.codigo, 'CLIENTE_CPF_JA_CADASTRADO');
    assert.equal(response.body.mensagem, 'Já existe um cliente cadastrado com este CPF.');

    const cliente = await connection('clientes').select('cpf').where('id', clienteId).first();

    assert.equal(cliente.cpf, '98765432100');
});

test('PATCH deve permitir que cliente mantenha o próprio CPF', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Mesmo CPF',
        cpf: '52998224725',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ cpf: '529.982.247-25' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.cpf, '52998224725');
});

test('PATCH deve permitir CPF já usado somente em outra organização', async () => {
    await criarClienteTeste(organizacaoBId, {
        nome: 'Cliente CPF Organização B',
        cpf: '11144477735',
        areas: [areaBId],
    });
    const clienteAId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente CPF Organização A',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteAId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ cpf: '111.444.777-35' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.cpf, '11144477735');
});

test('PATCHs concorrentes devem permitir que apenas um cliente assuma o mesmo CPF', async () => {
    const primeiroClienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Primeiro Cliente Concorrente',
        areas: [areaA1Id],
    });
    const segundoClienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Segundo Cliente Concorrente',
        areas: [areaA2Id],
    });
    const cpf = '44477711108';
    const atualizarCpf = (clienteId: string) =>
        request(app)
            .patch(`/api/v1/clientes/${clienteId}`)
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send({ cpf });

    const respostas = await Promise.all([
        atualizarCpf(primeiroClienteId),
        atualizarCpf(segundoClienteId),
    ]);

    assert.deepEqual(respostas.map((response) => response.status).sort(), [200, 409]);

    const conflito = respostas.find((response) => response.status === 409);

    assert.ok(conflito);
    assert.equal(conflito.body.codigo, 'CLIENTE_CPF_JA_CADASTRADO');

    const clientesComCpf = await connection('clientes').where({
        organizacao_id: organizacaoAId,
        cpf,
    });

    assert.equal(clientesComCpf.length, 1);
});

test('PATCH de áreas deve substituir conjunto ativo sem apagar histórico', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Troca de Áreas',
        areas: [areaA1Id, areaA2Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ areas: [areaA2Id] });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.areas, [{ id: areaA2Id, nome: 'Pilates' }]);

    const vinculos = await connection('clientes_areas')
        .select('area_negocio_id', 'ativo', 'deletado_em')
        .where('cliente_id', clienteId);

    assert.equal(vinculos.length, 2);
    assert.equal(vinculos.find((vinculo) => vinculo.area_negocio_id === areaA1Id)?.ativo, false);
    assert.equal(vinculos.find((vinculo) => vinculo.area_negocio_id === areaA2Id)?.ativo, true);
    assert.equal(
        vinculos.every((vinculo) => vinculo.deletado_em === null),
        true,
    );
});

test('PATCHs concorrentes de áreas devem persistir o conjunto completo de uma requisição', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Concorrência de Áreas',
        areas: [areaA1Id, areaA2Id],
    });
    const conjuntosSolicitados = [[areaA1Id], [areaA2Id]];
    const atualizarAreas = (areas: string[]) =>
        request(app)
            .patch(`/api/v1/clientes/${clienteId}`)
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send({ areas });

    const respostas = await Promise.all(conjuntosSolicitados.map(atualizarAreas));

    assert.equal(
        respostas.every((response) => response.status === 200),
        true,
    );

    const vinculosAtivos = await connection('clientes_areas')
        .select('area_negocio_id')
        .where({ cliente_id: clienteId, ativo: true })
        .whereNull('deletado_em');
    const conjuntoFinal = vinculosAtivos.map((vinculo) => vinculo.area_negocio_id).sort();
    const correspondeAUmaRequisicao = conjuntosSolicitados.some(
        (areas) =>
            areas.length === conjuntoFinal.length &&
            [...areas].sort().every((areaId, indice) => areaId === conjuntoFinal[indice]),
    );

    assert.equal(correspondeAUmaRequisicao, true);
});

test('PATCH deve reativar vínculo de área existente sem criar duplicata', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Reativação de Área',
        areas: [areaA1Id, areaA2Id],
    });

    await connection('clientes_areas')
        .where({ cliente_id: clienteId, area_negocio_id: areaA1Id })
        .update({ ativo: false, deletado_em: new Date() });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ areas: [areaA1Id] });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data.areas, [{ id: areaA1Id, nome: 'Fisioterapia' }]);

    const vinculos = await connection('clientes_areas')
        .select('area_negocio_id', 'ativo', 'deletado_em')
        .where('cliente_id', clienteId);

    assert.equal(vinculos.length, 2);

    const vinculoReativado = vinculos.find((vinculo) => vinculo.area_negocio_id === areaA1Id);

    assert.equal(vinculoReativado?.ativo, true);
    assert.equal(vinculoReativado?.deletado_em, null);
});

test('PATCH com área de outro tenant deve falhar sem atualização parcial', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Antes do Rollback',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            nome: 'Nome que Deve Sofrer Rollback',
            areas: [areaBId],
        });

    assert.equal(response.status, 404);
    assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');

    const cliente = await connection('clientes').select('nome').where('id', clienteId).first();

    assert.equal(cliente.nome, 'Cliente Antes do Rollback');
});

test('PATCH deve rejeitar área inativa ou soft-deleted', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Área Inválida',
        areas: [areaA1Id],
    });

    for (const areaId of [areaAInativaId, areaADeletadaId]) {
        const response = await request(app)
            .patch(`/api/v1/clientes/${clienteId}`)
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .send({ areas: [areaId] });

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');
    }
});

test('PATCH deve rejeitar áreas duplicadas', async () => {
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Áreas Duplicadas',
        areas: [areaA1Id],
    });

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({ areas: [areaA1Id, areaA1Id] });

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'DADOS_CLIENTE_INVALIDOS');
});

test('PATCH deve registrar auditoria sem valores de dados pessoais', async () => {
    const cpfAnterior = '12345678901';
    const telefoneAnterior = '18999990000';
    const emailAnterior = 'anterior@teste.com';
    const clienteId = await criarClienteTeste(organizacaoAId, {
        nome: 'Cliente Auditoria',
        cpf: cpfAnterior,
        telefone: telefoneAnterior,
        email: emailAnterior,
        logradouro: 'Rua Particular Antiga',
        observacao: 'Observação particular antiga',
        areas: [areaA1Id],
    });
    const novosValores = {
        cpf: '98765432100',
        telefone: '18988887777',
        email: 'novo@teste.com',
        logradouro: 'Rua Particular Nova',
        observacao: 'Observação particular nova',
    };

    const response = await request(app)
        .patch(`/api/v1/clientes/${clienteId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .send({
            ...novosValores,
            areas: [areaA2Id],
        });

    assert.equal(response.status, 200);

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'CLIENTE.ATUALIZADO',
            recurso: 'CLIENTE',
            recurso_id: clienteId,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.usuario_id, adminAId);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, null);
    assert.equal(auditoria.dados_contexto.clienteId, clienteId);
    assert.deepEqual([...auditoria.dados_contexto.camposAlterados].sort(), [
        'areas',
        'cpf',
        'email',
        'logradouro',
        'observacao',
        'telefone',
    ]);
    assert.deepEqual(auditoria.dados_contexto.areasAnteriores, [areaA1Id]);
    assert.deepEqual(auditoria.dados_contexto.areasNovas, [areaA2Id]);
    assert.equal(typeof auditoria.dados_contexto.requestId, 'string');
    assert.equal('body' in auditoria.dados_contexto, false);

    const contextoSerializado = JSON.stringify(auditoria.dados_contexto);

    for (const valorPessoal of [
        cpfAnterior,
        telefoneAnterior,
        emailAnterior,
        'Rua Particular Antiga',
        'Observação particular antiga',
        ...Object.values(novosValores),
    ]) {
        assert.equal(contextoSerializado.includes(valorPessoal), false);
    }
});
