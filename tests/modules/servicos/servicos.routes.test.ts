import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();

const areaA1Id = crypto.randomUUID();
const areaA2Id = crypto.randomUUID();
const areaASemAgendaId = crypto.randomUUID();
const areaBId = crypto.randomUUID();

const adminAId = crypto.randomUUID();
const operadorAId = crypto.randomUUID();

let moduloAgendaId: string | undefined;
let moduloAgendaCriadoPeloTeste = false;

function obterJwtSecretTeste() {
    const jwtSecret = env.JWT_SECRET;

    if (!jwtSecret) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return jwtSecret;
}

function cookieDoUsuario(usuarioId: string) {
    const token = jwt.sign({}, obterJwtSecretTeste(), {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return `token=${token}`;
}

async function limparServicosEAuditorias() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
    await connection('servicos').whereIn('organizacao_id', [organizacaoAId, organizacaoBId]).del();
}

async function limparDadosTeste() {
    await limparServicosEAuditorias();

    await connection('areas_modulos')
        .whereIn('area_negocio_id', [areaA1Id, areaA2Id, areaASemAgendaId, areaBId])
        .del();
    await connection('organizacoes_modulos')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
    await connection('usuarios_organizacoes').whereIn('usuario_id', [adminAId, operadorAId]).del();
    await connection('areas_negocio')
        .whereIn('id', [areaA1Id, areaA2Id, areaASemAgendaId, areaBId])
        .del();
    await connection('usuarios').whereIn('id', [adminAId, operadorAId]).del();
    await connection('organizacoes').whereIn('id', [organizacaoAId, organizacaoBId]).del();

    if (moduloAgendaCriadoPeloTeste && moduloAgendaId) {
        await connection('modulos').where('id', moduloAgendaId).del();
        moduloAgendaId = undefined;
        moduloAgendaCriadoPeloTeste = false;
    }
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        {
            id: organizacaoAId,
            nome: 'Organização A Serviços',
            ativo: true,
        },
        {
            id: organizacaoBId,
            nome: 'Organização B Serviços',
            ativo: true,
        },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaA1Id,
            organizacao_id: organizacaoAId,
            nome: 'Fisioterapia Serviços',
            codigo: `SERV-A1-${areaA1Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaA2Id,
            organizacao_id: organizacaoAId,
            nome: 'Pilates Serviços',
            codigo: `SERV-A2-${areaA2Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaASemAgendaId,
            organizacao_id: organizacaoAId,
            nome: 'Área sem Agenda',
            codigo: `SERV-SEM-AGENDA-${areaASemAgendaId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaBId,
            organizacao_id: organizacaoBId,
            nome: 'Área B Serviços',
            codigo: `SERV-B-${areaBId.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: adminAId,
            nome: 'Administrador Serviços',
            email: `admin-servicos-${adminAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador Serviços',
            email: `operador-servicos-${operadorAId}@teste.com`,
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

    const moduloAgenda = await connection('modulos')
        .select('id', 'ativo', 'deletado_em')
        .where('codigo', 'AGENDA')
        .first();

    if (moduloAgenda) {
        if (!moduloAgenda.ativo || moduloAgenda.deletado_em) {
            throw new Error('O módulo AGENDA existente precisa estar ativo e não deletado.');
        }

        moduloAgendaId = moduloAgenda.id;
    } else {
        moduloAgendaId = crypto.randomUUID();
        moduloAgendaCriadoPeloTeste = true;

        await connection('modulos').insert({
            id: moduloAgendaId,
            codigo: 'AGENDA',
            nome: 'Agenda',
            descricao: 'Módulo utilizado pelos testes de serviços.',
            ativo: true,
        });
    }

    await connection('organizacoes_modulos').insert({
        organizacao_id: organizacaoAId,
        modulo_id: moduloAgendaId,
        habilitado: true,
    });

    await connection('areas_modulos').insert([
        {
            area_negocio_id: areaA1Id,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
        {
            area_negocio_id: areaA2Id,
            modulo_id: moduloAgendaId,
            habilitado: true,
        },
    ]);
});

beforeEach(async () => {
    await limparServicosEAuditorias();
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

async function criarServicoTeste(
    organizacaoId: string,
    areaNegocioId: string,
    dados: {
        nome: string;
        descricao?: string;
        duracaoMinutos?: number;
        valor?: number;
        ativo?: boolean;
        deletadoEm?: Date;
    },
) {
    const servicoId = crypto.randomUUID();

    await connection('servicos').insert({
        id: servicoId,
        organizacao_id: organizacaoId,
        area_negocio_id: areaNegocioId,
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        duracao_minutos: dados.duracaoMinutos ?? 50,
        valor: dados.valor ?? null,
        ativo: dados.ativo ?? true,
        deletado_em: dados.deletadoEm ?? null,
    });

    return servicoId;
}

test('GET deve listar somente serviços não deletados da área atual ordenados por nome', async () => {
    const betaId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Beta inativo',
        ativo: false,
    });
    const alfaId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Alfa ativo',
        descricao: 'Descrição pública',
        valor: 120,
    });
    await criarServicoTeste(organizacaoAId, areaA2Id, { nome: 'Serviço outra área' });
    await criarServicoTeste(organizacaoBId, areaBId, { nome: 'Serviço outro tenant' });
    await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço deletado',
        deletadoEm: new Date(),
    });

    const response = await request(app)
        .get('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Serviços listados com sucesso.');
    assert.deepEqual(
        response.body.data.map((servico: { id: string }) => servico.id),
        [alfaId, betaId],
    );
    assert.deepEqual(Object.keys(response.body.data[0]).sort(), [
        'ativo',
        'descricao',
        'duracao_minutos',
        'id',
        'nome',
        'valor',
    ]);
    assert.equal(response.body.data[0].valor, '120.00');
    assert.equal('organizacao_id' in response.body.data[0], false);
    assert.equal('area_negocio_id' in response.body.data[0], false);
    assert.equal('deletado_em' in response.body.data[0], false);
});

test('GET deve filtrar explicitamente serviços ativos e inativos', async () => {
    const ativoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço ativo',
    });
    const inativoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço inativo',
        ativo: false,
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    const ativos = await request(app).get('/api/v1/servicos?ativo=true').set(cabecalhos);
    const inativos = await request(app).get('/api/v1/servicos?ativo=false').set(cabecalhos);

    assert.equal(ativos.status, 200);
    assert.deepEqual(
        ativos.body.data.map((servico: { id: string }) => servico.id),
        [ativoId],
    );
    assert.equal(inativos.status, 200);
    assert.deepEqual(
        inativos.body.data.map((servico: { id: string }) => servico.id),
        [inativoId],
    );
});

test('GET deve rejeitar filtro ativo inválido e queries desconhecidas ou de autoridade', async () => {
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    for (const query of [
        { ativo: '1' },
        { desconhecido: 'valor' },
        { areaNegocioId: areaA2Id },
        { organizacao_id: organizacaoBId },
    ]) {
        const response = await request(app).get('/api/v1/servicos').query(query).set(cabecalhos);

        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'FILTROS_SERVICOS_INVALIDOS');
    }
});

test('rotas devem exigir autenticação, organização, área e módulo AGENDA habilitado', async () => {
    const semAutenticacao = await request(app)
        .get('/api/v1/servicos')
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id);
    const semOrganizacao = await request(app)
        .get('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-area-negocio-id', areaA1Id);
    const semArea = await request(app)
        .get('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);
    const moduloDesabilitado = await request(app)
        .get('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaASemAgendaId);

    assert.equal(semAutenticacao.status, 401);
    assert.equal(semAutenticacao.body.codigo, 'TOKEN_AUSENTE');
    assert.equal(semOrganizacao.status, 400);
    assert.equal(semOrganizacao.body.codigo, 'ORGANIZACAO_NAO_INFORMADA');
    assert.equal(semArea.status, 400);
    assert.equal(semArea.body.codigo, 'AREA_NEGOCIO_NAO_INFORMADA');
    assert.equal(moduloDesabilitado.status, 403);
    assert.equal(moduloDesabilitado.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('ADMINISTRADOR deve criar serviço normalizado no tenant e área do contexto com auditoria', async () => {
    const response = await request(app)
        .post('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({
            nome: '  Pilates individual  ',
            descricao: '  Atendimento individual  ',
            duracao_minutos: 50,
            valor: 120.29,
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Serviço criado com sucesso.');
    assert.equal(response.body.data.nome, 'Pilates individual');
    assert.equal(response.body.data.descricao, 'Atendimento individual');
    assert.equal(response.body.data.duracao_minutos, 50);
    assert.equal(response.body.data.valor, '120.29');
    assert.equal(response.body.data.ativo, true);
    assert.equal('organizacao_id' in response.body.data, false);
    assert.equal('area_negocio_id' in response.body.data, false);
    assert.equal('deletado_em' in response.body.data, false);

    const servico = await connection('servicos')
        .select('*')
        .where('id', response.body.data.id)
        .first();

    assert.equal(servico.organizacao_id, organizacaoAId);
    assert.equal(servico.area_negocio_id, areaA1Id);
    assert.equal(servico.ativo, true);

    const auditoria = await connection('registros_auditoria')
        .where({
            acao: 'SERVICO.CRIADO',
            recurso: 'SERVICO',
            recurso_id: servico.id,
        })
        .first();

    assert.ok(auditoria);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.area_negocio_id, areaA1Id);
    assert.equal(auditoria.usuario_id, adminAId);
    assert.equal(auditoria.dados_contexto.servicoId, servico.id);
    assert.equal(auditoria.dados_contexto.areaNegocioId, areaA1Id);
    assert.equal(typeof auditoria.dados_contexto.requestId, 'string');
    assert.equal(JSON.stringify(auditoria.dados_contexto).includes('Pilates individual'), false);
});

test('POST deve persistir descrição e valor opcionais como null', async () => {
    const response = await request(app)
        .post('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({ nome: 'Avaliação', duracao_minutos: 30 });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.descricao, null);
    assert.equal(response.body.data.valor, null);
});

test('OPERADOR não deve criar serviço', async () => {
    const response = await request(app)
        .post('/api/v1/servicos')
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({ nome: 'Serviço não autorizado', duracao_minutos: 30 });

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
    assert.equal(
        await connection('servicos').where('nome', 'Serviço não autorizado').first(),
        undefined,
    );
});

test('POST deve rejeitar dados inválidos, excesso de casas e campos de autoridade', async () => {
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };
    const bodies = [
        { nome: '   ', duracao_minutos: 30 },
        { nome: 'Inválido', descricao: '   ', duracao_minutos: 30 },
        { nome: 'Inválido', duracao_minutos: 0 },
        { nome: 'Inválido', duracao_minutos: 30.5 },
        { nome: 'Inválido', duracao_minutos: 1441 },
        { nome: 'Inválido', duracao_minutos: 30, valor: -1 },
        { nome: 'Inválido', duracao_minutos: 30, valor: 1.001 },
        {
            nome: 'Inválido',
            duracao_minutos: 30,
            organizacao_id: organizacaoBId,
            area_negocio_id: areaA2Id,
            ativo: false,
        },
    ];

    for (const body of bodies) {
        const response = await request(app).post('/api/v1/servicos').set(cabecalhos).send(body);

        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_SERVICO_INVALIDOS');
    }
});

test('OPERADOR deve consultar serviço ativo ou inativo pelo ID', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço detalhe',
        descricao: 'Detalhe',
        duracaoMinutos: 45,
        valor: 90,
        ativo: false,
    });

    const response = await request(app)
        .get(`/api/v1/servicos/${servicoId}`)
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id);

    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Serviço encontrado com sucesso.');
    assert.equal(response.body.data.id, servicoId);
    assert.equal(response.body.data.ativo, false);
    assert.equal(response.body.data.valor, '90.00');
});

test('GET por ID deve rejeitar UUID inválido', async () => {
    const response = await request(app)
        .get('/api/v1/servicos/id-invalido')
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id);

    assert.equal(response.status, 400);
    assert.equal(response.body.codigo, 'SERVICO_ID_INVALIDO');
});

test('GET por ID deve ocultar inexistente, outro tenant, outra área e soft-deleted', async () => {
    const outroTenantId = await criarServicoTeste(organizacaoBId, areaBId, {
        nome: 'Serviço secreto B',
    });
    const outraAreaId = await criarServicoTeste(organizacaoAId, areaA2Id, {
        nome: 'Serviço secreto A2',
    });
    const deletadoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço deletado',
        deletadoEm: new Date(),
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    for (const servicoId of [crypto.randomUUID(), outroTenantId, outraAreaId, deletadoId]) {
        const response = await request(app).get(`/api/v1/servicos/${servicoId}`).set(cabecalhos);

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'SERVICO_NAO_ENCONTRADO');
        assert.equal(response.body.mensagem, 'Serviço não encontrado.');
    }
});

test('PATCH deve atualizar parcialmente e auditar somente nomes de campos', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço anterior',
        descricao: 'Descrição preservada',
        duracaoMinutos: 40,
        valor: 80,
    });

    const response = await request(app)
        .patch(`/api/v1/servicos/${servicoId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({ nome: '  Serviço atualizado  ', duracao_minutos: 60 });

    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Serviço atualizado com sucesso.');
    assert.equal(response.body.data.nome, 'Serviço atualizado');
    assert.equal(response.body.data.duracao_minutos, 60);
    assert.equal(response.body.data.descricao, 'Descrição preservada');
    assert.equal(response.body.data.valor, '80.00');

    const auditoria = await connection('registros_auditoria')
        .where({ acao: 'SERVICO.ATUALIZADO', recurso_id: servicoId })
        .first();

    assert.ok(auditoria);
    assert.deepEqual(auditoria.dados_contexto.camposAlterados.sort(), ['duracao_minutos', 'nome']);
    assert.equal(JSON.stringify(auditoria.dados_contexto).includes('Serviço atualizado'), false);
    assert.equal('body' in auditoria.dados_contexto, false);
});

test('PATCH deve aceitar null para limpar descrição e valor', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço nullable',
        descricao: 'Remover',
        valor: 55,
    });

    const response = await request(app)
        .patch(`/api/v1/servicos/${servicoId}`)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({ descricao: null, valor: null });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.descricao, null);
    assert.equal(response.body.data.valor, null);
});

test('PATCH deve rejeitar body vazio, null em campos obrigatórios e campos proibidos', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço validação PATCH',
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    for (const body of [
        {},
        { nome: null },
        { duracao_minutos: null },
        { descricao: '   ' },
        { valor: 2.345 },
        { ativo: false },
        { area_negocio_id: areaA2Id },
        { organizacao_id: organizacaoBId },
        { deletado_em: new Date().toISOString() },
    ]) {
        const response = await request(app)
            .patch(`/api/v1/servicos/${servicoId}`)
            .set(cabecalhos)
            .send(body);

        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_SERVICO_INVALIDOS');
    }
});

test('OPERADOR não deve atualizar serviço', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço protegido',
    });

    const response = await request(app)
        .patch(`/api/v1/servicos/${servicoId}`)
        .set('Cookie', cookieDoUsuario(operadorAId))
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id)
        .send({ nome: 'Tentativa indevida' });

    assert.equal(response.status, 403);
    assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

test('PATCH não deve alterar serviço de outro tenant, área ou soft-deleted', async () => {
    const outroTenantId = await criarServicoTeste(organizacaoBId, areaBId, {
        nome: 'Serviço B intacto',
    });
    const outraAreaId = await criarServicoTeste(organizacaoAId, areaA2Id, {
        nome: 'Serviço A2 intacto',
    });
    const deletadoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço deletado intacto',
        deletadoEm: new Date(),
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    for (const servicoId of [outroTenantId, outraAreaId, deletadoId]) {
        const response = await request(app)
            .patch(`/api/v1/servicos/${servicoId}`)
            .set(cabecalhos)
            .send({ nome: 'Nome vazado' });

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'SERVICO_NAO_ENCONTRADO');
    }

    const servicos = await connection('servicos')
        .select('nome')
        .whereIn('id', [outroTenantId, outraAreaId, deletadoId]);

    assert.equal(
        servicos.some((servico) => servico.nome === 'Nome vazado'),
        false,
    );
});

test('ADMINISTRADOR deve inativar e reativar serviço com auditoria', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço lifecycle',
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    const inativacao = await request(app)
        .patch(`/api/v1/servicos/${servicoId}/inativar`)
        .set(cabecalhos);
    const reativacao = await request(app)
        .patch(`/api/v1/servicos/${servicoId}/reativar`)
        .set(cabecalhos);

    assert.equal(inativacao.status, 200);
    assert.equal(inativacao.body.message, 'Serviço inativado com sucesso.');
    assert.equal(inativacao.body.data.ativo, false);
    assert.equal(reativacao.status, 200);
    assert.equal(reativacao.body.message, 'Serviço reativado com sucesso.');
    assert.equal(reativacao.body.data.ativo, true);

    const auditorias = await connection('registros_auditoria')
        .select('acao', 'dados_contexto')
        .where('recurso_id', servicoId)
        .whereIn('acao', ['SERVICO.INATIVADO', 'SERVICO.REATIVADO'])
        .orderBy('criado_em', 'asc');

    assert.deepEqual(
        auditorias.map((auditoria) => auditoria.acao),
        ['SERVICO.INATIVADO', 'SERVICO.REATIVADO'],
    );
    assert.equal(
        auditorias.every(
            (auditoria) =>
                auditoria.dados_contexto.servicoId === servicoId &&
                auditoria.dados_contexto.areaNegocioId === areaA1Id,
        ),
        true,
    );
});

test('lifecycle deve retornar conflitos para estados já aplicados', async () => {
    const ativoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço já ativo',
    });
    const inativoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço já inativo',
        ativo: false,
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    const jaInativo = await request(app)
        .patch(`/api/v1/servicos/${inativoId}/inativar`)
        .set(cabecalhos);
    const jaAtivo = await request(app)
        .patch(`/api/v1/servicos/${ativoId}/reativar`)
        .set(cabecalhos);

    assert.equal(jaInativo.status, 409);
    assert.equal(jaInativo.body.codigo, 'SERVICO_JA_INATIVO');
    assert.equal(jaAtivo.status, 409);
    assert.equal(jaAtivo.body.codigo, 'SERVICO_JA_ATIVO');
});

test('OPERADOR não deve executar lifecycle', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço lifecycle protegido',
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(operadorAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    const inativacao = await request(app)
        .patch(`/api/v1/servicos/${servicoId}/inativar`)
        .set(cabecalhos);
    const reativacao = await request(app)
        .patch(`/api/v1/servicos/${servicoId}/reativar`)
        .set(cabecalhos);

    assert.equal(inativacao.status, 403);
    assert.equal(inativacao.body.codigo, 'PERFIL_NAO_AUTORIZADO');
    assert.equal(reativacao.status, 403);
    assert.equal(reativacao.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

test('lifecycle deve preservar serviços de outro tenant, área e soft-deleted', async () => {
    const outroTenantId = await criarServicoTeste(organizacaoBId, areaBId, {
        nome: 'Lifecycle tenant B',
    });
    const outraAreaId = await criarServicoTeste(organizacaoAId, areaA2Id, {
        nome: 'Lifecycle área A2',
    });
    const deletadoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Lifecycle deletado',
        deletadoEm: new Date(),
    });
    const cabecalhos = {
        Cookie: cookieDoUsuario(adminAId),
        'x-organizacao-id': organizacaoAId,
        'x-area-negocio-id': areaA1Id,
    };

    for (const servicoId of [outroTenantId, outraAreaId, deletadoId]) {
        const response = await request(app)
            .patch(`/api/v1/servicos/${servicoId}/inativar`)
            .set(cabecalhos);

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'SERVICO_NAO_ENCONTRADO');
    }

    const servicos = await connection('servicos')
        .select('ativo')
        .whereIn('id', [outroTenantId, outraAreaId, deletadoId]);

    assert.equal(
        servicos.every((servico) => servico.ativo),
        true,
    );
});

test('lifecycle concorrente deve serializar operações no mesmo serviço', async () => {
    const servicoId = await criarServicoTeste(organizacaoAId, areaA1Id, {
        nome: 'Serviço concorrente',
    });
    const requisicao = () =>
        request(app)
            .patch(`/api/v1/servicos/${servicoId}/inativar`)
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .set('x-area-negocio-id', areaA1Id);

    const respostas = await Promise.all([requisicao(), requisicao()]);

    assert.deepEqual(respostas.map((response) => response.status).sort(), [200, 409]);
});

test('escrita deve permanecer bem-sucedida quando auditoria falhar', async () => {
    const registrarOriginal = auditoriaService.registrar;

    auditoriaService.registrar = async () => {
        throw new Error('Falha simulada na auditoria de serviço.');
    };

    try {
        const response = await request(app)
            .post('/api/v1/servicos')
            .set('Cookie', cookieDoUsuario(adminAId))
            .set('x-organizacao-id', organizacaoAId)
            .set('x-area-negocio-id', areaA1Id)
            .send({ nome: 'Serviço fail-open', duracao_minutos: 30 });

        assert.equal(response.status, 201);
        assert.equal(response.body.data.nome, 'Serviço fail-open');
    } finally {
        auditoriaService.registrar = registrarOriginal;
    }
});
