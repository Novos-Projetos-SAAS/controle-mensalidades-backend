import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import auditoriaService from '../../../src/modules/auditoria/auditoria.service.js';

const rota = '/api/v1/profissionais';

const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();
const areaA1Id = crypto.randomUUID();
const areaA2Id = crypto.randomUUID();
const areaASemAgendaId = crypto.randomUUID();
const areaAInativaId = crypto.randomUUID();
const areaBId = crypto.randomUUID();
const adminAId = crypto.randomUUID();
const operadorAId = crypto.randomUUID();
const adminBId = crypto.randomUUID();

let moduloAgendaId: string | undefined;
let moduloAgendaCriadoPeloTeste = false;

function cookieDoUsuario(usuarioId: string) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    const token = jwt.sign({}, env.JWT_SECRET, {
        subject: usuarioId,
        expiresIn: '1h',
    });

    return `token=${token}`;
}

function cabecalhos(usuarioId = adminAId, organizacaoId = organizacaoAId, areaId = areaA1Id) {
    return {
        Cookie: cookieDoUsuario(usuarioId),
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

async function limparProfissionaisEAuditorias() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();

    const profissionais = await connection('profissionais')
        .select('id')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId]);
    const ids = profissionais.map((profissional) => profissional.id as string);

    if (ids.length > 0) {
        await connection('profissionais_areas').whereIn('profissional_id', ids).del();
        await connection('profissionais').whereIn('id', ids).del();
    }
}

async function limparDadosTeste() {
    await limparProfissionaisEAuditorias();

    await connection('areas_modulos')
        .whereIn('area_negocio_id', [areaA1Id, areaA2Id, areaASemAgendaId, areaAInativaId, areaBId])
        .del();
    await connection('organizacoes_modulos')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [adminAId, operadorAId, adminBId])
        .del();
    await connection('areas_negocio')
        .whereIn('id', [areaA1Id, areaA2Id, areaASemAgendaId, areaAInativaId, areaBId])
        .del();
    await connection('usuarios').whereIn('id', [adminAId, operadorAId, adminBId]).del();
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
        { id: organizacaoAId, nome: 'Organização A Profissionais', ativo: true },
        { id: organizacaoBId, nome: 'Organização B Profissionais', ativo: true },
    ]);

    await connection('areas_negocio').insert([
        {
            id: areaA1Id,
            organizacao_id: organizacaoAId,
            nome: 'Fisioterapia Profissionais',
            codigo: `PROF-A1-${areaA1Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaA2Id,
            organizacao_id: organizacaoAId,
            nome: 'Pilates Profissionais',
            codigo: `PROF-A2-${areaA2Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaASemAgendaId,
            organizacao_id: organizacaoAId,
            nome: 'Área sem Agenda Profissionais',
            codigo: `PROF-SEM-${areaASemAgendaId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaAInativaId,
            organizacao_id: organizacaoAId,
            nome: 'Área inativa Profissionais',
            codigo: `PROF-INAT-${areaAInativaId.slice(0, 8)}`,
            ativo: false,
        },
        {
            id: areaBId,
            organizacao_id: organizacaoBId,
            nome: 'Área B Profissionais',
            codigo: `PROF-B-${areaBId.slice(0, 8)}`,
            ativo: true,
        },
    ]);

    await connection('usuarios').insert([
        {
            id: adminAId,
            nome: 'Administrador A Profissionais',
            email: `admin-a-prof-${adminAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador A Profissionais',
            email: `operador-prof-${operadorAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: adminBId,
            nome: 'Administrador B Profissionais',
            email: `admin-b-prof-${adminBId}@teste.com`,
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
        {
            usuario_id: adminBId,
            organizacao_id: organizacaoBId,
            perfil: 'ADMINISTRADOR',
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
        moduloAgendaId = moduloAgenda.id as string;
    } else {
        moduloAgendaId = crypto.randomUUID();
        moduloAgendaCriadoPeloTeste = true;

        await connection('modulos').insert({
            id: moduloAgendaId,
            codigo: 'AGENDA',
            nome: 'Agenda',
            descricao: 'Módulo utilizado pelos testes de profissionais.',
            ativo: true,
        });
    }

    await connection('organizacoes_modulos').insert([
        { organizacao_id: organizacaoAId, modulo_id: moduloAgendaId, habilitado: true },
        { organizacao_id: organizacaoBId, modulo_id: moduloAgendaId, habilitado: true },
    ]);
    await connection('areas_modulos').insert([
        { area_negocio_id: areaA1Id, modulo_id: moduloAgendaId, habilitado: true },
        { area_negocio_id: areaA2Id, modulo_id: moduloAgendaId, habilitado: true },
        { area_negocio_id: areaBId, modulo_id: moduloAgendaId, habilitado: true },
    ]);
});

beforeEach(async () => {
    await limparProfissionaisEAuditorias();
});

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

type DadosProfissionalTeste = {
    nome: string;
    cpf?: string;
    email?: string;
    ativo?: boolean;
    deletadoEm?: Date;
    areas?: string[];
};

async function criarProfissionalTeste(organizacaoId: string, dados: DadosProfissionalTeste) {
    const id = crypto.randomUUID();
    await connection('profissionais').insert({
        id,
        organizacao_id: organizacaoId,
        usuario_id: null,
        nome: dados.nome,
        cpf: dados.cpf ?? null,
        email: dados.email ?? null,
        ativo: dados.ativo ?? true,
        inativado_em: dados.ativo === false ? new Date() : null,
        deletado_em: dados.deletadoEm ?? null,
    });

    if (dados.areas?.length) {
        await connection('profissionais_areas').insert(
            dados.areas.map((areaId) => ({
                profissional_id: id,
                area_negocio_id: areaId,
                ativo: true,
            })),
        );
    }

    return id;
}

test('POST deve criar profissional normalizado com duas áreas e auditoria sem dados pessoais', async () => {
    const response = await request(app)
        .post(rota)
        .set(cabecalhos())
        .send({
            nome: '  Dra. Ana Souza  ',
            cpf: '123.456.789-01',
            email: '  ANA@EXEMPLO.COM  ',
            telefone: '(18) 99999-9999',
            conselho: '  CREFITO  ',
            numero_conselho: '  123456-F  ',
            uf_conselho: ' sp ',
            areas: [areaA1Id, areaA2Id],
        });

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.message, 'Profissional criado com sucesso.');
    assert.equal(response.body.data.nome, 'Dra. Ana Souza');
    assert.equal(response.body.data.cpf, '12345678901');
    assert.equal(response.body.data.email, 'ana@exemplo.com');
    assert.equal(response.body.data.telefone, '18999999999');
    assert.equal(response.body.data.conselho, 'CREFITO');
    assert.equal(response.body.data.numero_conselho, '123456-F');
    assert.equal(response.body.data.uf_conselho, 'SP');
    assert.equal(response.body.data.ativo, true);
    assert.deepEqual(
        response.body.data.areas.map((area: { id: string }) => area.id).sort(),
        [areaA1Id, areaA2Id].sort(),
    );
    assert.equal('organizacao_id' in response.body.data, false);
    assert.equal('usuario_id' in response.body.data, false);
    assert.equal('deletado_em' in response.body.data, false);

    const profissionalId = response.body.data.id as string;
    const registro = await connection('profissionais').where('id', profissionalId).first();
    assert.equal(registro.organizacao_id, organizacaoAId);
    assert.equal(registro.usuario_id, null);
    const vinculos = await connection('profissionais_areas')
        .select('area_negocio_id', 'ativo')
        .where('profissional_id', profissionalId);
    assert.equal(vinculos.length, 2);
    assert.equal(
        vinculos.every((vinculo) => vinculo.ativo === true),
        true,
    );

    const auditoria = await connection('registros_auditoria')
        .where({ recurso: 'PROFISSIONAL', recurso_id: profissionalId, acao: 'PROFISSIONAL.CRIADO' })
        .first();
    assert.ok(auditoria);
    assert.equal(auditoria.organizacao_id, organizacaoAId);
    assert.equal(auditoria.usuario_id, adminAId);
    assert.deepEqual(auditoria.dados_contexto.areas.sort(), [areaA1Id, areaA2Id].sort());
    const contexto = JSON.stringify(auditoria.dados_contexto);
    for (const dadoPessoal of ['12345678901', 'ana@exemplo.com', '18999999999']) {
        assert.equal(contexto.includes(dadoPessoal), false);
    }
});

test('POST deve aceitar campos opcionais ausentes e persistir null', async () => {
    const response = await request(app)
        .post(rota)
        .set(cabecalhos())
        .send({ nome: 'Profissional sem CPF', areas: [areaA1Id] });

    assert.equal(response.status, 201);
    for (const campo of [
        'cpf',
        'email',
        'telefone',
        'conselho',
        'numero_conselho',
        'uf_conselho',
    ]) {
        assert.equal(response.body.data[campo], null);
    }
});

test('POST deve rejeitar body inválido, áreas repetidas e campos de autoridade', async () => {
    for (const body of [
        { nome: '   ', areas: [areaA1Id] },
        { nome: 'Sem área' },
        { nome: 'Área vazia', areas: [] },
        { nome: 'Área duplicada', areas: [areaA1Id, areaA1Id] },
        { nome: 'CPF inválido', cpf: '123', areas: [areaA1Id] },
        { nome: 'Email inválido', email: 'email-invalido', areas: [areaA1Id] },
        { nome: 'UUID inválido', areas: ['area-invalida'] },
        { nome: 'Campo indevido', areas: [areaA1Id], ativo: false },
        { nome: 'Tenant indevido', areas: [areaA1Id], organizacao_id: organizacaoBId },
        { nome: 'Usuário indevido', areas: [areaA1Id], usuario_id: adminAId },
    ]) {
        const response = await request(app).post(rota).set(cabecalhos()).send(body);
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_PROFISSIONAL_INVALIDOS');
    }

    assert.equal(
        await connection('profissionais')
            .where('organizacao_id', organizacaoAId)
            .count('* as total')
            .first()
            .then((resultado) => Number(resultado?.total)),
        0,
    );
});

test('POST deve recusar áreas inativas ou de outra organização sem persistência parcial', async () => {
    for (const areaId of [areaAInativaId, areaBId]) {
        const response = await request(app)
            .post(rota)
            .set(cabecalhos())
            .send({ nome: 'Profissional inválido', areas: [areaA1Id, areaId] });

        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');
    }

    const registros = await connection('profissionais')
        .where('organizacao_id', organizacaoAId)
        .where('nome', 'Profissional inválido');
    assert.equal(registros.length, 0);
});

test('CPF deve ser único por organização inclusive na atualização, mas pode existir em outra', async () => {
    const primeiro = await request(app)
        .post(rota)
        .set(cabecalhos())
        .send({ nome: 'Primeira', cpf: '123.456.789-01', areas: [areaA1Id] });
    assert.equal(primeiro.status, 201);

    const duplicado = await request(app)
        .post(rota)
        .set(cabecalhos())
        .send({ nome: 'Segunda', cpf: '12345678901', areas: [areaA1Id] });
    assert.equal(duplicado.status, 409);
    assert.equal(duplicado.body.codigo, 'PROFISSIONAL_CPF_JA_CADASTRADO');

    const segundoId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Segundo para atualizar',
        areas: [areaA1Id],
    });
    const patchDuplicado = await request(app)
        .patch(`${rota}/${segundoId}`)
        .set(cabecalhos())
        .send({ cpf: '123.456.789-01' });
    assert.equal(patchDuplicado.status, 409);
    assert.equal(patchDuplicado.body.codigo, 'PROFISSIONAL_CPF_JA_CADASTRADO');

    const outraOrganizacao = await request(app)
        .post(rota)
        .set(cabecalhos(adminBId, organizacaoBId, areaBId))
        .send({ nome: 'Mesmo CPF em outro tenant', cpf: '12345678901', areas: [areaBId] });
    assert.equal(outraOrganizacao.status, 201);
});

test('GET deve listar todos os profissionais do tenant, independentemente da área do header', async () => {
    const alfaId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Alfa',
        areas: [areaA1Id],
    });
    const betaId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Beta',
        ativo: false,
        areas: [areaA2Id],
    });
    await criarProfissionalTeste(organizacaoBId, { nome: 'Outro tenant', areas: [areaBId] });
    await criarProfissionalTeste(organizacaoAId, {
        nome: 'Apagado logicamente',
        deletadoEm: new Date(),
        areas: [areaA1Id],
    });

    const response = await request(app).get(rota).set(cabecalhos(operadorAId));
    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Profissionais listados com sucesso.');
    assert.deepEqual(
        response.body.data.map((profissional: { id: string }) => profissional.id),
        [alfaId, betaId],
    );
    assert.deepEqual(
        response.body.data[1].areas.map((area: { id: string }) => area.id),
        [areaA2Id],
    );
    assert.equal(response.body.data[1].ativo, false);
    assert.equal('organizacao_id' in response.body.data[0], false);
    assert.equal('usuario_id' in response.body.data[0], false);
});

test('GET deve filtrar por status, área, nome e CPF, respeitando vínculo inativo', async () => {
    const anaId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Ana Fisioterapia',
        cpf: '12345678901',
        areas: [areaA1Id, areaA2Id],
    });
    const brunoId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Bruno Pilates',
        ativo: false,
        areas: [areaA2Id],
    });
    const carlaId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Carla sem vínculo ativo',
        areas: [areaA1Id],
    });
    await connection('profissionais_areas')
        .where({ profissional_id: carlaId, area_negocio_id: areaA1Id })
        .update({ ativo: false });

    const ativos = await request(app).get(rota).query({ ativo: 'true' }).set(cabecalhos());
    const inativos = await request(app).get(rota).query({ ativo: 'false' }).set(cabecalhos());
    const areaUm = await request(app)
        .get(rota)
        .query({ areaNegocioId: areaA1Id })
        .set(cabecalhos());
    const areaDoisInativos = await request(app)
        .get(rota)
        .query({ areaNegocioId: areaA2Id, ativo: 'false' })
        .set(cabecalhos());
    const nome = await request(app).get(rota).query({ busca: 'ana fisiO' }).set(cabecalhos());
    const cpf = await request(app).get(rota).query({ busca: '123.456.789-01' }).set(cabecalhos());

    assert.equal(ativos.status, 200);
    assert.deepEqual(
        ativos.body.data.map((p: { id: string }) => p.id),
        [anaId, carlaId],
    );
    assert.deepEqual(
        inativos.body.data.map((p: { id: string }) => p.id),
        [brunoId],
    );
    assert.deepEqual(
        areaUm.body.data.map((p: { id: string }) => p.id),
        [anaId],
    );
    assert.deepEqual(
        areaDoisInativos.body.data.map((p: { id: string }) => p.id),
        [brunoId],
    );
    assert.deepEqual(
        nome.body.data.map((p: { id: string }) => p.id),
        [anaId],
    );
    assert.deepEqual(
        cpf.body.data.map((p: { id: string }) => p.id),
        [anaId],
    );
});

test('GET deve validar filtros e recusar filtro por área de outro tenant ou inativa', async () => {
    for (const query of [
        { ativo: '1' },
        { busca: '   ' },
        { areaNegocioId: 'invalido' },
        { organizacao_id: organizacaoBId },
        { desconhecido: 'valor' },
    ]) {
        const response = await request(app).get(rota).query(query).set(cabecalhos());
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'FILTROS_PROFISSIONAIS_INVALIDOS');
    }

    for (const areaId of [areaBId, areaAInativaId]) {
        const response = await request(app)
            .get(rota)
            .query({ areaNegocioId: areaId })
            .set(cabecalhos());
        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');
    }
});

test('rotas devem exigir login, organização, área e módulo AGENDA', async () => {
    const semToken = await request(app)
        .get(rota)
        .set('x-organizacao-id', organizacaoAId)
        .set('x-area-negocio-id', areaA1Id);
    const semOrganizacao = await request(app)
        .get(rota)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-area-negocio-id', areaA1Id);
    const semArea = await request(app)
        .get(rota)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId);
    const semModulo = await request(app)
        .get(rota)
        .set(cabecalhos(adminAId, organizacaoAId, areaASemAgendaId));
    const outraOrganizacao = await request(app)
        .get(rota)
        .set(cabecalhos(adminAId, organizacaoBId, areaBId));

    assert.equal(semToken.status, 401);
    assert.equal(semToken.body.codigo, 'TOKEN_AUSENTE');
    assert.equal(semOrganizacao.status, 400);
    assert.equal(semOrganizacao.body.codigo, 'ORGANIZACAO_NAO_INFORMADA');
    assert.equal(semArea.status, 400);
    assert.equal(semArea.body.codigo, 'AREA_NEGOCIO_NAO_INFORMADA');
    assert.equal(semModulo.status, 403);
    assert.equal(semModulo.body.codigo, 'MODULO_NAO_HABILITADO');
    assert.equal(outraOrganizacao.status, 403);
    assert.equal(outraOrganizacao.body.codigo, 'ORGANIZACAO_NAO_AUTORIZADA');
});

test('OPERADOR pode ler, mas não pode criar, atualizar ou executar lifecycle', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional protegido',
        areas: [areaA1Id],
    });
    const headers = cabecalhos(operadorAId);
    const leitura = await request(app).get(`${rota}/${id}`).set(headers);
    const criacao = await request(app)
        .post(rota)
        .set(headers)
        .send({ nome: 'Tentativa', areas: [areaA1Id] });
    const edicao = await request(app)
        .patch(`${rota}/${id}`)
        .set(headers)
        .send({ nome: 'Alterado indevidamente' });
    const inativacao = await request(app).patch(`${rota}/${id}/inativar`).set(headers);
    const reativacao = await request(app).patch(`${rota}/${id}/reativar`).set(headers);

    assert.equal(leitura.status, 200);
    for (const response of [criacao, edicao, inativacao, reativacao]) {
        assert.equal(response.status, 403);
        assert.equal(response.body.codigo, 'PERFIL_NAO_AUTORIZADO');
    }
    const registro = await connection('profissionais').where('id', id).first();
    assert.equal(registro.nome, 'Profissional protegido');
    assert.equal(registro.ativo, true);
});

test('GET por ID deve rejeitar ID inválido, profissional de outro tenant e soft-deleted', async () => {
    const outroTenantId = await criarProfissionalTeste(organizacaoBId, {
        nome: 'Profissional B',
        areas: [areaBId],
    });
    const deletadoId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional deletado',
        deletadoEm: new Date(),
        areas: [areaA1Id],
    });
    const idInvalido = await request(app).get(`${rota}/invalido`).set(cabecalhos());
    assert.equal(idInvalido.status, 400);
    assert.equal(idInvalido.body.codigo, 'PROFISSIONAL_ID_INVALIDO');

    for (const id of [outroTenantId, deletadoId, crypto.randomUUID()]) {
        const response = await request(app).get(`${rota}/${id}`).set(cabecalhos());
        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'PROFISSIONAL_NAO_ENCONTRADO');
    }
});

test('PATCH deve atualizar parcialmente, limpar campos nullable e auditar nomes dos campos', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Nome original',
        cpf: '12345678901',
        email: 'antigo@teste.com',
        areas: [areaA1Id],
    });
    const response = await request(app)
        .patch(`${rota}/${id}`)
        .set(cabecalhos())
        .send({ nome: '  Nome atualizado  ', cpf: null, email: null, telefone: '(18) 98888-8888' });

    assert.equal(response.status, 200);
    assert.equal(response.body.message, 'Profissional atualizado com sucesso.');
    assert.equal(response.body.data.nome, 'Nome atualizado');
    assert.equal(response.body.data.cpf, null);
    assert.equal(response.body.data.email, null);
    assert.equal(response.body.data.telefone, '18988888888');
    assert.deepEqual(
        response.body.data.areas.map((area: { id: string }) => area.id),
        [areaA1Id],
    );

    const auditoria = await connection('registros_auditoria')
        .where({ acao: 'PROFISSIONAL.ATUALIZADO', recurso_id: id })
        .first();
    assert.ok(auditoria);
    assert.deepEqual(
        auditoria.dados_contexto.camposAlterados.sort(),
        ['nome', 'cpf', 'email', 'telefone'].sort(),
    );
    assert.equal(JSON.stringify(auditoria.dados_contexto).includes('18988888888'), false);
});

test('PATCH áreas deve sincronizar vínculos N:N sem excluir registros nem duplicá-los', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional multiarea',
        areas: [areaA1Id, areaA2Id],
    });

    const apenasA2 = await request(app)
        .patch(`${rota}/${id}`)
        .set(cabecalhos())
        .send({ areas: [areaA2Id] });
    assert.equal(apenasA2.status, 200);
    assert.deepEqual(
        apenasA2.body.data.areas.map((area: { id: string }) => area.id),
        [areaA2Id],
    );

    let vinculos = await connection('profissionais_areas')
        .select('area_negocio_id', 'ativo')
        .where('profissional_id', id);
    assert.equal(vinculos.length, 2);
    assert.equal(vinculos.find((v) => v.area_negocio_id === areaA1Id)?.ativo, false);
    assert.equal(vinculos.find((v) => v.area_negocio_id === areaA2Id)?.ativo, true);

    const reativarVinculos = await request(app)
        .patch(`${rota}/${id}`)
        .set(cabecalhos())
        .send({ areas: [areaA1Id, areaA2Id] });
    assert.equal(reativarVinculos.status, 200);
    assert.equal(reativarVinculos.body.data.areas.length, 2);

    vinculos = await connection('profissionais_areas')
        .select('area_negocio_id', 'ativo')
        .where('profissional_id', id);
    assert.equal(vinculos.length, 2);
    assert.equal(
        vinculos.every((v) => v.ativo),
        true,
    );

    const auditoria = await connection('registros_auditoria')
        .where({ acao: 'PROFISSIONAL.ATUALIZADO', recurso_id: id })
        .orderBy('criado_em', 'desc')
        .first();
    assert.ok(auditoria);
    assert.deepEqual(auditoria.dados_contexto.areasNovas.sort(), [areaA1Id, areaA2Id].sort());
});

test('PATCH deve rejeitar dados inválidos e área alheia sem alterar dados ou vínculos', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional intacto',
        areas: [areaA1Id],
    });
    for (const body of [
        {},
        { nome: null },
        { areas: [] },
        { areas: [areaA1Id, areaA1Id] },
        { cpf: 'invalido' },
        { ativo: false },
        { organizacao_id: organizacaoBId },
        { usuario_id: adminAId },
    ]) {
        const response = await request(app).patch(`${rota}/${id}`).set(cabecalhos()).send(body);
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_PROFISSIONAL_INVALIDOS');
    }
    const areaAlheia = await request(app)
        .patch(`${rota}/${id}`)
        .set(cabecalhos())
        .send({ nome: 'Não deve persistir', areas: [areaA1Id, areaBId] });
    assert.equal(areaAlheia.status, 404);
    assert.equal(areaAlheia.body.codigo, 'AREA_NEGOCIO_NAO_ENCONTRADA');

    const registro = await connection('profissionais').where('id', id).first();
    const vinculos = await connection('profissionais_areas').where('profissional_id', id);
    assert.equal(registro.nome, 'Profissional intacto');
    assert.equal(vinculos.length, 1);
    assert.equal(vinculos[0]?.area_negocio_id, areaA1Id);
});

test('PATCH e lifecycle não devem alterar outro tenant nem soft-deleted', async () => {
    const outroTenantId = await criarProfissionalTeste(organizacaoBId, {
        nome: 'Profissional B intacto',
        areas: [areaBId],
    });
    const deletadoId = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional deletado intacto',
        areas: [areaA1Id],
        deletadoEm: new Date(),
    });

    for (const id of [outroTenantId, deletadoId]) {
        for (const resposta of [
            await request(app).patch(`${rota}/${id}`).set(cabecalhos()).send({ nome: 'Invasão' }),
            await request(app).patch(`${rota}/${id}/inativar`).set(cabecalhos()),
            await request(app).patch(`${rota}/${id}/reativar`).set(cabecalhos()),
        ]) {
            assert.equal(resposta.status, 404);
            assert.equal(resposta.body.codigo, 'PROFISSIONAL_NAO_ENCONTRADO');
        }
    }

    const registros = await connection('profissionais').whereIn('id', [outroTenantId, deletadoId]);
    assert.equal(
        registros.every((registro) => registro.ativo === true),
        true,
    );
    assert.equal(
        registros.every((registro) => registro.nome !== 'Invasão'),
        true,
    );
});

test('lifecycle deve manter vínculos por área, registrar auditoria e rejeitar repetição', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional lifecycle',
        areas: [areaA1Id, areaA2Id],
    });

    const inativar = await request(app).patch(`${rota}/${id}/inativar`).set(cabecalhos());
    assert.equal(inativar.status, 200);
    assert.equal(inativar.body.data.ativo, false);
    assert.ok(inativar.body.data.inativado_em);

    const repetirInativacao = await request(app).patch(`${rota}/${id}/inativar`).set(cabecalhos());
    assert.equal(repetirInativacao.status, 409);
    assert.equal(repetirInativacao.body.codigo, 'PROFISSIONAL_JA_INATIVO');

    const reativar = await request(app).patch(`${rota}/${id}/reativar`).set(cabecalhos());
    assert.equal(reativar.status, 200);
    assert.equal(reativar.body.data.ativo, true);
    assert.equal(reativar.body.data.inativado_em, null);

    const repetirReativacao = await request(app).patch(`${rota}/${id}/reativar`).set(cabecalhos());
    assert.equal(repetirReativacao.status, 409);
    assert.equal(repetirReativacao.body.codigo, 'PROFISSIONAL_JA_ATIVO');

    const vinculos = await connection('profissionais_areas')
        .where('profissional_id', id)
        .orderBy('area_negocio_id');
    assert.equal(vinculos.length, 2);
    assert.equal(
        vinculos.every((vinculo) => vinculo.ativo),
        true,
    );

    const auditorias = await connection('registros_auditoria')
        .select('acao', 'dados_contexto')
        .where('recurso_id', id)
        .whereIn('acao', ['PROFISSIONAL.INATIVADO', 'PROFISSIONAL.REATIVADO'])
        .orderBy('criado_em', 'asc');
    assert.deepEqual(
        auditorias.map((auditoria) => auditoria.acao),
        ['PROFISSIONAL.INATIVADO', 'PROFISSIONAL.REATIVADO'],
    );
    assert.equal(auditorias[0]?.dados_contexto.estadoNovo, 'INATIVO');
    assert.equal(auditorias[1]?.dados_contexto.estadoNovo, 'ATIVO');
});

test('inativação concorrente deve retornar um sucesso e um conflito', async () => {
    const id = await criarProfissionalTeste(organizacaoAId, {
        nome: 'Profissional concorrente',
        areas: [areaA1Id],
    });
    const executar = () => request(app).patch(`${rota}/${id}/inativar`).set(cabecalhos());
    const respostas = await Promise.all([executar(), executar()]);

    assert.deepEqual(respostas.map((resposta) => resposta.status).sort(), [200, 409]);
});

test('escrita deve concluir mesmo quando a auditoria falhar', async () => {
    const registrarOriginal = auditoriaService.registrar;
    auditoriaService.registrar = async () => {
        throw new Error('Falha simulada na auditoria de profissional.');
    };

    try {
        const response = await request(app)
            .post(rota)
            .set(cabecalhos())
            .send({ nome: 'Profissional fail-open', areas: [areaA1Id] });
        assert.equal(response.status, 201);
        assert.equal(response.body.data.nome, 'Profissional fail-open');
    } finally {
        auditoriaService.registrar = registrarOriginal;
    }
});
