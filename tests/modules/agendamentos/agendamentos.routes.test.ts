import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const rota = '/api/v1/agendamentos';
const organizacaoAId = crypto.randomUUID();
const organizacaoBId = crypto.randomUUID();
const areaA1Id = crypto.randomUUID();
const areaA2Id = crypto.randomUUID();
const areaSemAgendaId = crypto.randomUUID();
const areaBId = crypto.randomUUID();
const adminAId = crypto.randomUUID();
const operadorAId = crypto.randomUUID();
const perfilNaoPermitidoId = crypto.randomUUID();
const adminBId = crypto.randomUUID();

const clienteAId = crypto.randomUUID();
const clienteA2Id = crypto.randomUUID();
const clienteInativoId = crypto.randomUUID();
const clienteDeletadoId = crypto.randomUUID();
const clienteSemVinculoId = crypto.randomUUID();
const clienteVinculoInativoId = crypto.randomUUID();
const clienteBId = crypto.randomUUID();

const profissionalAId = crypto.randomUUID();
const profissionalA2Id = crypto.randomUUID();
const profissionalInativoId = crypto.randomUUID();
const profissionalDeletadoId = crypto.randomUUID();
const profissionalSemVinculoId = crypto.randomUUID();
const profissionalVinculoInativoId = crypto.randomUUID();
const profissionalBId = crypto.randomUUID();

const servicoA60Id = crypto.randomUUID();
const servicoA30Id = crypto.randomUUID();
const servicoA2Id = crypto.randomUUID();
const servicoInativoId = crypto.randomUUID();
const servicoDeletadoId = crypto.randomUUID();
const servicoBId = crypto.randomUUID();

let moduloAgendaId: string | undefined;

function cookieDoUsuario(usuarioId: string) {
    if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET não definida no ambiente de teste.');
    }

    return `token=${jwt.sign({}, env.JWT_SECRET, { subject: usuarioId, expiresIn: '1h' })}`;
}

function cabecalhos(usuarioId = adminAId, organizacaoId = organizacaoAId, areaId = areaA1Id) {
    return {
        Cookie: cookieDoUsuario(usuarioId),
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

async function limparAgendamentosEAuditorias() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
    await connection('agendamentos')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
}

async function limparDadosTeste() {
    await limparAgendamentosEAuditorias();
    await connection('clientes_areas')
        .whereIn('cliente_id', [
            clienteAId,
            clienteA2Id,
            clienteInativoId,
            clienteDeletadoId,
            clienteVinculoInativoId,
            clienteBId,
        ])
        .del();
    await connection('profissionais_areas')
        .whereIn('profissional_id', [
            profissionalAId,
            profissionalA2Id,
            profissionalInativoId,
            profissionalDeletadoId,
            profissionalVinculoInativoId,
            profissionalBId,
        ])
        .del();
    await connection('servicos')
        .whereIn('id', [
            servicoA60Id,
            servicoA30Id,
            servicoA2Id,
            servicoInativoId,
            servicoDeletadoId,
            servicoBId,
        ])
        .del();
    await connection('clientes')
        .whereIn('id', [
            clienteAId,
            clienteA2Id,
            clienteInativoId,
            clienteDeletadoId,
            clienteSemVinculoId,
            clienteVinculoInativoId,
            clienteBId,
        ])
        .del();
    await connection('profissionais')
        .whereIn('id', [
            profissionalAId,
            profissionalA2Id,
            profissionalInativoId,
            profissionalDeletadoId,
            profissionalSemVinculoId,
            profissionalVinculoInativoId,
            profissionalBId,
        ])
        .del();
    await connection('areas_modulos')
        .whereIn('area_negocio_id', [areaA1Id, areaA2Id, areaSemAgendaId, areaBId])
        .del();
    await connection('organizacoes_modulos')
        .whereIn('organizacao_id', [organizacaoAId, organizacaoBId])
        .del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [adminAId, operadorAId, perfilNaoPermitidoId, adminBId])
        .del();
    await connection('areas_negocio')
        .whereIn('id', [areaA1Id, areaA2Id, areaSemAgendaId, areaBId])
        .del();
    await connection('usuarios')
        .whereIn('id', [adminAId, operadorAId, perfilNaoPermitidoId, adminBId])
        .del();
    await connection('organizacoes').whereIn('id', [organizacaoAId, organizacaoBId]).del();

    // AGENDA é catálogo global compartilhado por suítes paralelas; somente os vínculos próprios
    // são removidos acima para não invalidar requisições de outras suítes em andamento.
}

before(async () => {
    await limparDadosTeste();

    await connection('organizacoes').insert([
        { id: organizacaoAId, nome: 'Organização A Agenda', ativo: true },
        { id: organizacaoBId, nome: 'Organização B Agenda', ativo: true },
    ]);
    await connection('areas_negocio').insert([
        {
            id: areaA1Id,
            organizacao_id: organizacaoAId,
            nome: 'Área A1 Agenda',
            codigo: `AGEN-A1-${areaA1Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaA2Id,
            organizacao_id: organizacaoAId,
            nome: 'Área A2 Agenda',
            codigo: `AGEN-A2-${areaA2Id.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaSemAgendaId,
            organizacao_id: organizacaoAId,
            nome: 'Área sem Agenda',
            codigo: `AGEN-SEM-${areaSemAgendaId.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: areaBId,
            organizacao_id: organizacaoBId,
            nome: 'Área B Agenda',
            codigo: `AGEN-B-${areaBId.slice(0, 8)}`,
            ativo: true,
        },
    ]);
    await connection('usuarios').insert([
        {
            id: adminAId,
            nome: 'Admin A Agenda',
            email: `admin-agenda-${adminAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: operadorAId,
            nome: 'Operador A Agenda',
            email: `operador-agenda-${operadorAId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: perfilNaoPermitidoId,
            nome: 'Perfil não permitido',
            email: `perfil-agenda-${perfilNaoPermitidoId}@teste.com`,
            senha_hash: 'hash-teste',
            ativo: true,
        },
        {
            id: adminBId,
            nome: 'Admin B Agenda',
            email: `admin-b-agenda-${adminBId}@teste.com`,
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
            usuario_id: perfilNaoPermitidoId,
            organizacao_id: organizacaoAId,
            perfil: 'CONSULTOR',
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
        await connection('modulos').insert({
            id: moduloAgendaId,
            codigo: 'AGENDA',
            nome: 'Agenda',
            descricao: 'Módulo utilizado pelos testes de agendamentos.',
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

    await connection('clientes').insert([
        { id: clienteAId, organizacao_id: organizacaoAId, nome: 'Cliente A', ativo: true },
        { id: clienteA2Id, organizacao_id: organizacaoAId, nome: 'Cliente A2', ativo: true },
        {
            id: clienteInativoId,
            organizacao_id: organizacaoAId,
            nome: 'Cliente inativo',
            ativo: false,
        },
        {
            id: clienteDeletadoId,
            organizacao_id: organizacaoAId,
            nome: 'Cliente deletado',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: clienteSemVinculoId,
            organizacao_id: organizacaoAId,
            nome: 'Cliente sem vínculo',
            ativo: true,
        },
        {
            id: clienteVinculoInativoId,
            organizacao_id: organizacaoAId,
            nome: 'Cliente vínculo inativo',
            ativo: true,
        },
        { id: clienteBId, organizacao_id: organizacaoBId, nome: 'Cliente B', ativo: true },
    ]);
    await connection('clientes_areas').insert([
        { cliente_id: clienteAId, area_negocio_id: areaA1Id, ativo: true },
        { cliente_id: clienteAId, area_negocio_id: areaA2Id, ativo: true },
        { cliente_id: clienteA2Id, area_negocio_id: areaA1Id, ativo: true },
        { cliente_id: clienteInativoId, area_negocio_id: areaA1Id, ativo: true },
        { cliente_id: clienteDeletadoId, area_negocio_id: areaA1Id, ativo: true },
        { cliente_id: clienteVinculoInativoId, area_negocio_id: areaA1Id, ativo: false },
        { cliente_id: clienteBId, area_negocio_id: areaBId, ativo: true },
    ]);

    await connection('profissionais').insert([
        {
            id: profissionalAId,
            organizacao_id: organizacaoAId,
            nome: 'Profissional A',
            ativo: true,
        },
        {
            id: profissionalA2Id,
            organizacao_id: organizacaoAId,
            nome: 'Profissional A2',
            ativo: true,
        },
        {
            id: profissionalInativoId,
            organizacao_id: organizacaoAId,
            nome: 'Profissional inativo',
            ativo: false,
        },
        {
            id: profissionalDeletadoId,
            organizacao_id: organizacaoAId,
            nome: 'Profissional deletado',
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: profissionalSemVinculoId,
            organizacao_id: organizacaoAId,
            nome: 'Profissional sem vínculo',
            ativo: true,
        },
        {
            id: profissionalVinculoInativoId,
            organizacao_id: organizacaoAId,
            nome: 'Profissional vínculo inativo',
            ativo: true,
        },
        {
            id: profissionalBId,
            organizacao_id: organizacaoBId,
            nome: 'Profissional B',
            ativo: true,
        },
    ]);
    await connection('profissionais_areas').insert([
        { profissional_id: profissionalAId, area_negocio_id: areaA1Id, ativo: true },
        { profissional_id: profissionalAId, area_negocio_id: areaA2Id, ativo: true },
        { profissional_id: profissionalA2Id, area_negocio_id: areaA1Id, ativo: true },
        { profissional_id: profissionalInativoId, area_negocio_id: areaA1Id, ativo: true },
        { profissional_id: profissionalDeletadoId, area_negocio_id: areaA1Id, ativo: true },
        {
            profissional_id: profissionalVinculoInativoId,
            area_negocio_id: areaA1Id,
            ativo: false,
        },
        { profissional_id: profissionalBId, area_negocio_id: areaBId, ativo: true },
    ]);

    await connection('servicos').insert([
        {
            id: servicoA60Id,
            organizacao_id: organizacaoAId,
            area_negocio_id: areaA1Id,
            nome: 'Serviço 60',
            duracao_minutos: 60,
            ativo: true,
        },
        {
            id: servicoA30Id,
            organizacao_id: organizacaoAId,
            area_negocio_id: areaA1Id,
            nome: 'Serviço 30',
            duracao_minutos: 30,
            ativo: true,
        },
        {
            id: servicoA2Id,
            organizacao_id: organizacaoAId,
            area_negocio_id: areaA2Id,
            nome: 'Serviço A2',
            duracao_minutos: 45,
            ativo: true,
        },
        {
            id: servicoInativoId,
            organizacao_id: organizacaoAId,
            area_negocio_id: areaA1Id,
            nome: 'Serviço inativo',
            duracao_minutos: 60,
            ativo: false,
        },
        {
            id: servicoDeletadoId,
            organizacao_id: organizacaoAId,
            area_negocio_id: areaA1Id,
            nome: 'Serviço deletado',
            duracao_minutos: 60,
            ativo: true,
            deletado_em: new Date(),
        },
        {
            id: servicoBId,
            organizacao_id: organizacaoBId,
            area_negocio_id: areaBId,
            nome: 'Serviço B',
            duracao_minutos: 60,
            ativo: true,
        },
    ]);
});

beforeEach(limparAgendamentosEAuditorias);

after(async () => {
    try {
        await limparDadosTeste();
    } finally {
        await connection.destroy();
    }
});

function bodyValido(inicio = '2026-11-10T14:00:00-03:00') {
    return {
        cliente_id: clienteAId,
        profissional_id: profissionalAId,
        servico_id: servicoA60Id,
        inicio_em: inicio,
        observacao: 'Primeira avaliação',
    };
}

async function criarViaApi(body: Record<string, unknown> = bodyValido(), headers = cabecalhos()) {
    return request(app).post(rota).set(headers).send(body);
}

async function criarDireto(dados: {
    organizacaoId?: string;
    areaId?: string;
    clienteId?: string;
    profissionalId?: string;
    servicoId?: string;
    inicio: string;
    fim: string;
    status?: string;
    deletadoEm?: Date;
}) {
    const id = crypto.randomUUID();
    await connection('agendamentos').insert({
        id,
        organizacao_id: dados.organizacaoId ?? organizacaoAId,
        area_negocio_id: dados.areaId ?? areaA1Id,
        cliente_id: dados.clienteId ?? clienteAId,
        profissional_id: dados.profissionalId ?? profissionalAId,
        servico_id: dados.servicoId ?? servicoA60Id,
        inicio_em: new Date(dados.inicio),
        fim_em: new Date(dados.fim),
        status: dados.status ?? 'AGENDADO',
        deletado_em: dados.deletadoEm ?? null,
    });
    return id;
}

test('POST deve calcular duração em tempo real, normalizar offset e ocultar colunas internas', async () => {
    const response = await criarViaApi();

    assert.equal(response.status, 201);
    assert.equal(response.body.status, 'success');
    assert.equal(response.body.data.inicio_em, '2026-11-10T17:00:00.000Z');
    assert.equal(response.body.data.fim_em, '2026-11-10T18:00:00.000Z');
    assert.equal(response.body.data.status, 'AGENDADO');
    assert.equal(response.body.data.cliente_nome, 'Cliente A');
    assert.equal(response.body.data.profissional_nome, 'Profissional A');
    assert.equal(response.body.data.servico_nome, 'Serviço 60');
    for (const proibido of [
        'organizacao_id',
        'area_negocio_id',
        'deletado_em',
        'criado_em',
        'atualizado_em',
    ]) {
        assert.equal(proibido in response.body.data, false);
    }
});

test('POST deve aceitar escrita por OPERADOR e rejeitar perfil fora do MVP', async () => {
    const operador = await criarViaApi(bodyValido(), cabecalhos(operadorAId));
    const outroPerfil = await criarViaApi(
        { ...bodyValido(), inicio_em: '2026-11-10T16:00:00-03:00' },
        cabecalhos(perfilNaoPermitidoId),
    );

    assert.equal(operador.status, 201);
    assert.equal(outroPerfil.status, 403);
    assert.equal(outroPerfil.body.codigo, 'PERFIL_NAO_AUTORIZADO');
});

test('rotas devem exigir login, organização, área e módulo AGENDA nesta ordem', async () => {
    const semToken = await request(app)
        .get(rota)
        .query({ inicio: '2026-11-10T00:00:00Z', fim: '2026-11-11T00:00:00Z' });
    const semOrganizacao = await request(app)
        .get(rota)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-area-negocio-id', areaA1Id)
        .query({ inicio: '2026-11-10T00:00:00Z', fim: '2026-11-11T00:00:00Z' });
    const semArea = await request(app)
        .get(rota)
        .set('Cookie', cookieDoUsuario(adminAId))
        .set('x-organizacao-id', organizacaoAId)
        .query({ inicio: '2026-11-10T00:00:00Z', fim: '2026-11-11T00:00:00Z' });
    const semModulo = await request(app)
        .get(rota)
        .set(cabecalhos(adminAId, organizacaoAId, areaSemAgendaId))
        .query({ inicio: '2026-11-10T00:00:00Z', fim: '2026-11-11T00:00:00Z' });

    assert.equal(semToken.status, 401);
    assert.equal(semToken.body.codigo, 'TOKEN_AUSENTE');
    assert.equal(semOrganizacao.body.codigo, 'ORGANIZACAO_NAO_INFORMADA');
    assert.equal(semArea.body.codigo, 'AREA_NEGOCIO_NAO_INFORMADA');
    assert.equal(semModulo.body.codigo, 'MODULO_NAO_HABILITADO');
});

test('POST deve rejeitar body não estrito e horário local ambíguo', async () => {
    for (const body of [
        {},
        { ...bodyValido(), inicio_em: '2026-11-10T14:00:00' },
        { ...bodyValido(), fim_em: '2026-11-10T15:00:00-03:00' },
        { ...bodyValido(), status: 'CONFIRMADO' },
        { ...bodyValido(), organizacao_id: organizacaoBId },
        { ...bodyValido(), cliente_id: 'inválido' },
    ]) {
        const response = await criarViaApi(body);
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_AGENDAMENTO_INVALIDOS');
    }
});

test('POST deve rejeitar referências inativas, deletadas, sem vínculo, de outra área ou tenant', async () => {
    const casos = [
        [{ cliente_id: clienteInativoId }, 'CLIENTE_NAO_DISPONIVEL'],
        [{ cliente_id: clienteDeletadoId }, 'CLIENTE_NAO_DISPONIVEL'],
        [{ cliente_id: clienteSemVinculoId }, 'CLIENTE_NAO_DISPONIVEL'],
        [{ cliente_id: clienteVinculoInativoId }, 'CLIENTE_NAO_DISPONIVEL'],
        [{ cliente_id: clienteBId }, 'CLIENTE_NAO_DISPONIVEL'],
        [{ profissional_id: profissionalInativoId }, 'PROFISSIONAL_NAO_DISPONIVEL'],
        [{ profissional_id: profissionalDeletadoId }, 'PROFISSIONAL_NAO_DISPONIVEL'],
        [{ profissional_id: profissionalSemVinculoId }, 'PROFISSIONAL_NAO_DISPONIVEL'],
        [{ profissional_id: profissionalVinculoInativoId }, 'PROFISSIONAL_NAO_DISPONIVEL'],
        [{ profissional_id: profissionalBId }, 'PROFISSIONAL_NAO_DISPONIVEL'],
        [{ servico_id: servicoInativoId }, 'SERVICO_NAO_DISPONIVEL'],
        [{ servico_id: servicoDeletadoId }, 'SERVICO_NAO_DISPONIVEL'],
        [{ servico_id: servicoA2Id }, 'SERVICO_NAO_DISPONIVEL'],
        [{ servico_id: servicoBId }, 'SERVICO_NAO_DISPONIVEL'],
    ] as const;

    for (const [alteracao, codigo] of casos) {
        const response = await criarViaApi({ ...bodyValido(), ...alteracao });
        assert.equal(response.status, 404, JSON.stringify(alteracao));
        assert.equal(response.body.codigo, codigo);
    }
});

test('GET deve aplicar sobreposição [inicio, fim), atravessar meia-noite e ordenar deterministicamente', async () => {
    const anterior = await criarDireto({
        clienteId: clienteA2Id,
        profissionalId: profissionalA2Id,
        inicio: '2026-11-09T23:30:00Z',
        fim: '2026-11-10T00:30:00Z',
    });
    const dentro = await criarDireto({
        clienteId: clienteAId,
        profissionalId: profissionalAId,
        inicio: '2026-11-10T00:30:00Z',
        fim: '2026-11-10T01:00:00Z',
        status: 'CONFIRMADO',
    });
    await criarDireto({
        clienteId: clienteA2Id,
        profissionalId: profissionalA2Id,
        inicio: '2026-11-10T02:00:00Z',
        fim: '2026-11-10T03:00:00Z',
    });
    await criarDireto({
        areaId: areaA2Id,
        clienteId: clienteAId,
        profissionalId: profissionalAId,
        servicoId: servicoA2Id,
        inicio: '2026-11-10T03:00:00Z',
        fim: '2026-11-10T04:00:00Z',
    });

    const response = await request(app)
        .get(rota)
        .set(cabecalhos())
        .query({ inicio: '2026-11-10T00:00:00Z', fim: '2026-11-10T02:00:00Z' });

    assert.equal(response.status, 200);
    assert.deepEqual(
        response.body.data.map((item: { id: string }) => item.id),
        [anterior, dentro],
    );
});

test('GET deve validar janela de até 31 dias, query estrita e filtros', async () => {
    const id = await criarDireto({
        clienteId: clienteA2Id,
        profissionalId: profissionalA2Id,
        inicio: '2026-11-10T12:00:00Z',
        fim: '2026-11-10T13:00:00Z',
        status: 'CONFIRMADO',
    });
    const base = { inicio: '2026-11-01T00:00:00Z', fim: '2026-12-01T00:00:00Z' };
    const filtrado = await request(app)
        .get(rota)
        .set(cabecalhos())
        .query({
            ...base,
            profissionalId: profissionalA2Id,
            clienteId: clienteA2Id,
            status: 'CONFIRMADO',
        });
    assert.equal(filtrado.status, 200);
    assert.deepEqual(
        filtrado.body.data.map((item: { id: string }) => item.id),
        [id],
    );

    for (const query of [
        {},
        { inicio: '2026-11-10T00:00:00Z', fim: '2026-11-10T00:00:00Z' },
        { inicio: '2026-11-10T00:00:00Z', fim: '2026-12-12T00:00:00Z' },
        { ...base, desconhecido: 'x' },
        { ...base, status: 'PENDENTE' },
        { ...base, inicio: '2026-11-01T00:00:00' },
    ]) {
        const response = await request(app).get(rota).set(cabecalhos()).query(query);
        assert.equal(response.status, 400, JSON.stringify(query));
        assert.equal(response.body.codigo, 'FILTROS_AGENDAMENTOS_INVALIDOS');
    }
});

test('GET por ID deve isolar tenant, área e soft-delete', async () => {
    const areaA2 = await criarDireto({
        areaId: areaA2Id,
        servicoId: servicoA2Id,
        inicio: '2026-11-10T10:00:00Z',
        fim: '2026-11-10T11:00:00Z',
    });
    const deletado = await criarDireto({
        inicio: '2026-11-10T12:00:00Z',
        fim: '2026-11-10T13:00:00Z',
        deletadoEm: new Date(),
    });
    const outroTenant = await criarDireto({
        organizacaoId: organizacaoBId,
        areaId: areaBId,
        clienteId: clienteBId,
        profissionalId: profissionalBId,
        servicoId: servicoBId,
        inicio: '2026-11-10T14:00:00Z',
        fim: '2026-11-10T15:00:00Z',
    });

    for (const id of [areaA2, deletado, outroTenant, crypto.randomUUID()]) {
        const response = await request(app).get(`${rota}/${id}`).set(cabecalhos());
        assert.equal(response.status, 404);
        assert.equal(response.body.codigo, 'AGENDAMENTO_NAO_ENCONTRADO');
    }
    const invalido = await request(app).get(`${rota}/invalido`).set(cabecalhos());
    assert.equal(invalido.body.codigo, 'AGENDAMENTO_ID_INVALIDO');
});

test('PATCH deve preservar duração histórica na remarcação e recalcular ao trocar serviço', async () => {
    const criado = await criarViaApi();
    const id = criado.body.data.id as string;
    await connection('servicos').where('id', servicoA60Id).update({ duracao_minutos: 90 });

    try {
        const remarcado = await request(app)
            .patch(`${rota}/${id}`)
            .set(cabecalhos())
            .send({ inicio_em: '2026-11-11T10:00:00-03:00' });
        assert.equal(remarcado.status, 200);
        assert.equal(remarcado.body.data.inicio_em, '2026-11-11T13:00:00.000Z');
        assert.equal(remarcado.body.data.fim_em, '2026-11-11T14:00:00.000Z');

        const novoServico = await request(app)
            .patch(`${rota}/${id}`)
            .set(cabecalhos())
            .send({ servico_id: servicoA30Id });
        assert.equal(novoServico.status, 200);
        assert.equal(novoServico.body.data.fim_em, '2026-11-11T13:30:00.000Z');
    } finally {
        await connection('servicos').where('id', servicoA60Id).update({ duracao_minutos: 60 });
    }
});

test('PATCH somente observação deve funcionar com recursos posteriormente inativos e não auditar texto livre', async () => {
    const criado = await criarViaApi();
    const id = criado.body.data.id as string;
    await connection('clientes').where('id', clienteAId).update({ ativo: false });
    await connection('profissionais').where('id', profissionalAId).update({ ativo: false });
    await connection('servicos').where('id', servicoA60Id).update({ ativo: false });

    try {
        const response = await request(app)
            .patch(`${rota}/${id}`)
            .set(cabecalhos())
            .send({ observacao: 'Dado clínico que não pode ir para auditoria' });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.observacao, 'Dado clínico que não pode ir para auditoria');
        const auditoria = await connection('registros_auditoria')
            .where({ recurso_id: id, acao: 'AGENDAMENTO.ATUALIZADO' })
            .first();
        assert.deepEqual(auditoria.dados_contexto.camposAlterados, ['observacao']);
        assert.equal(JSON.stringify(auditoria.dados_contexto).includes('Dado clínico'), false);
    } finally {
        await connection('clientes').where('id', clienteAId).update({ ativo: true });
        await connection('profissionais').where('id', profissionalAId).update({ ativo: true });
        await connection('servicos').where('id', servicoA60Id).update({ ativo: true });
    }
});

test('PATCH deve rejeitar cliente mutável, body vazio e conflitos de atualização', async () => {
    const primeiro = await criarViaApi();
    const segundo = await criarViaApi({
        ...bodyValido('2026-11-10T16:00:00-03:00'),
        cliente_id: clienteA2Id,
        profissional_id: profissionalA2Id,
    });
    for (const body of [{}, { cliente_id: clienteA2Id }, { status: 'CANCELADO' }]) {
        const response = await request(app)
            .patch(`${rota}/${primeiro.body.data.id}`)
            .set(cabecalhos())
            .send(body);
        assert.equal(response.status, 400);
        assert.equal(response.body.codigo, 'DADOS_AGENDAMENTO_INVALIDOS');
    }
    const conflito = await request(app)
        .patch(`${rota}/${segundo.body.data.id}`)
        .set(cabecalhos())
        .send({ inicio_em: '2026-11-10T14:30:00-03:00', profissional_id: profissionalAId });
    assert.equal(conflito.status, 409);
    assert.equal(conflito.body.codigo, 'AGENDAMENTO_HORARIO_OCUPADO');
});

test('status deve respeitar transições, registrar cancelamento e manter estados terminais', async () => {
    const confirmadoCriado = await criarViaApi();
    const confirmadoId = confirmadoCriado.body.data.id as string;
    const confirmado = await request(app)
        .patch(`${rota}/${confirmadoId}/confirmar`)
        .set(cabecalhos(operadorAId));
    assert.equal(confirmado.status, 200);
    assert.equal(confirmado.body.data.status, 'CONFIRMADO');
    const concluido = await request(app)
        .patch(`${rota}/${confirmadoId}/concluir`)
        .set(cabecalhos());
    assert.equal(concluido.status, 200);
    assert.equal(concluido.body.data.status, 'CONCLUIDO');

    const editarTerminal = await request(app)
        .patch(`${rota}/${confirmadoId}`)
        .set(cabecalhos())
        .send({ observacao: 'não pode' });
    const cancelarTerminal = await request(app)
        .patch(`${rota}/${confirmadoId}/cancelar`)
        .set(cabecalhos())
        .send({ motivo_cancelamento: 'não pode' });
    for (const response of [editarTerminal, cancelarTerminal]) {
        assert.equal(response.status, 409);
        assert.equal(response.body.codigo, 'AGENDAMENTO_ESTADO_INCOMPATIVEL');
    }

    const cancelavel = await criarViaApi({
        ...bodyValido('2026-11-11T14:00:00-03:00'),
        cliente_id: clienteA2Id,
        profissional_id: profissionalA2Id,
    });
    const cancelado = await request(app)
        .patch(`${rota}/${cancelavel.body.data.id}/cancelar`)
        .set(cabecalhos(operadorAId))
        .send({ motivo_cancelamento: 'Solicitação particular do cliente' });
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.data.status, 'CANCELADO');
    assert.equal(cancelado.body.data.cancelado_por_usuario_id, operadorAId);
    assert.ok(cancelado.body.data.cancelado_em);
    assert.equal(cancelado.body.data.motivo_cancelamento, 'Solicitação particular do cliente');

    const auditoria = await connection('registros_auditoria')
        .where({ recurso_id: cancelavel.body.data.id, acao: 'AGENDAMENTO.CANCELADO' })
        .first();
    assert.ok(auditoria);
    assert.equal(
        JSON.stringify(auditoria.dados_contexto).includes('Solicitação particular'),
        false,
    );
});

test('conflitos devem abranger profissional e cliente entre áreas, permitir adjacência e liberar após cancelar', async () => {
    const primeiro = await criarViaApi();
    assert.equal(primeiro.status, 201);
    const adjacente = await criarViaApi({
        ...bodyValido('2026-11-10T15:00:00-03:00'),
        cliente_id: clienteA2Id,
    });
    assert.equal(adjacente.status, 201);

    const conflitoProfissionalOutraArea = await criarViaApi(
        {
            cliente_id: clienteAId,
            profissional_id: profissionalAId,
            servico_id: servicoA2Id,
            inicio_em: '2026-11-10T14:30:00-03:00',
        },
        cabecalhos(adminAId, organizacaoAId, areaA2Id),
    );
    assert.equal(conflitoProfissionalOutraArea.status, 409);

    const conflitoCliente = await criarViaApi({
        ...bodyValido('2026-11-10T14:30:00-03:00'),
        profissional_id: profissionalA2Id,
    });
    assert.equal(conflitoCliente.status, 409);

    const cancelado = await request(app)
        .patch(`${rota}/${primeiro.body.data.id}/cancelar`)
        .set(cabecalhos())
        .send({});
    assert.equal(cancelado.status, 200);
    const reutilizado = await criarViaApi({
        ...bodyValido(),
        profissional_id: profissionalA2Id,
    });
    assert.equal(reutilizado.status, 201);
});

test('duas criações concorrentes em conflito devem resultar em um 201 e um 409', async () => {
    const executar = () => criarViaApi();
    const respostas = await Promise.all([executar(), executar()]);

    assert.deepEqual(respostas.map((resposta) => resposta.status).sort(), [201, 409]);
    assert.equal(
        respostas.find((resposta) => resposta.status === 409)?.body.codigo,
        'AGENDAMENTO_HORARIO_OCUPADO',
    );
    const quantidade = await connection('agendamentos')
        .where({ organizacao_id: organizacaoAId, cliente_id: clienteAId })
        .whereNull('deletado_em')
        .count<{ count: string }>('id as count')
        .first();
    assert.equal(Number(quantidade?.count), 1);
});
