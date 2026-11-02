import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import AppError from '../../../src/shared/errors/AppError.js';

import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';
import sessoesClinicasAcessoService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.acesso.service.js';
import sessoesClinicasService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.service.js';

// ============================================================
// DADOS FICTÍCIOS DOS TESTES
// ============================================================

const organizacaoId = crypto.randomUUID();
const areaNegocioId = crypto.randomUUID();
const usuarioId = crypto.randomUUID();
const profissionalId = crypto.randomUUID();
const outroProfissionalId = crypto.randomUUID();
const clienteId = crypto.randomUUID();
const sessaoId = crypto.randomUUID();

const contexto = {
    usuarioId,
    organizacaoId,
    areaNegocioId,
};

const dadosCriacao = {
    cliente_id: clienteId,
    profissional_id: profissionalId,
    data_sessao: '2026-10-01T14:00:00Z',
    evolucao: 'Evolução clínica fictícia.',
};

const sessaoExemplo = {
    id: sessaoId,
    cliente_id: clienteId,
    profissional_id: profissionalId,
    agendamento_id: null,
    data_sessao: new Date('2026-10-01T14:00:00Z'),
    corrigido_em: null,
    cliente_nome: 'Paciente fictício',
    profissional_nome: 'Profissional fictício',
    evolucao: 'Evolução clínica fictícia.',
    diagnostico_fisioterapeutico: null,
    prognostico: null,
    plano_terapeutico: null,
    observacoes: null,
    corrigido_por_usuario_id: null,
};

// ============================================================
// FUNÇÃO AUXILIAR PARA VERIFICAR ERROS
// ============================================================

function verificarErro(codigo: string, statusCode: number) {
    return (error: unknown): boolean =>
        error instanceof AppError && error.code === codigo && error.statusCode === statusCode;
}

// ============================================================
// TESTE 1 — CRIAÇÃO AUTORIZADA
// ============================================================

test('permite criar sessão para o próprio profissional autorizado', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'identificarProfissional', async () => ({
        profissionalId,
    }));

    const criar = t.mock.method(sessoesClinicasService, 'criar', async () => sessaoExemplo);

    const resultado = await sessoesClinicasAcessoService.criar(contexto, dadosCriacao);

    assert.equal(resultado.id, sessaoId);
    assert.equal(criar.mock.callCount(), 1);

    const argumentos = criar.mock.calls[0]?.arguments;

    assert.equal(argumentos?.[0], organizacaoId);
    assert.equal(argumentos?.[1], areaNegocioId);
    assert.deepEqual(argumentos?.[2], dadosCriacao);
});

// ============================================================
// TESTE 2 — BLOQUEIO DE CRIAÇÃO EM NOME DE OUTRO PROFISSIONAL
// ============================================================

test('impede criar sessão em nome de outro profissional', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'identificarProfissional', async () => ({
        profissionalId,
    }));

    const criar = t.mock.method(sessoesClinicasService, 'criar', async () => sessaoExemplo);

    await assert.rejects(
        sessoesClinicasAcessoService.criar(contexto, {
            ...dadosCriacao,
            profissional_id: outroProfissionalId,
        }),
        verificarErro('PROFISSIONAL_CLINICO_NAO_AUTORIZADO', 403),
    );

    // Nenhuma criação deve ser executada.
    assert.equal(criar.mock.callCount(), 0);
});

// ============================================================
// TESTE 3 — CRIAÇÃO SEM AUTORIZAÇÃO CLÍNICA
// ============================================================

test('nega criação quando usuário não possui permissão clínica', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'identificarProfissional', async () => {
        throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    const criar = t.mock.method(sessoesClinicasService, 'criar', async () => sessaoExemplo);

    await assert.rejects(
        sessoesClinicasAcessoService.criar(contexto, dadosCriacao),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );

    assert.equal(criar.mock.callCount(), 0);
});

// ============================================================
// TESTE 4 — LISTAGEM LIMITADA AO PROFISSIONAL AUTENTICADO
// ============================================================

test('listagem força o filtro do próprio profissional', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'identificarProfissional', async () => ({
        profissionalId,
    }));

    // ATUALIZADO: agora testamos listarAutorizadas().
    const listar = t.mock.method(sessoesClinicasService, 'listarAutorizadas', async () => []);

    const filtros = {
        inicio: '2026-10-01T00:00:00Z',
        fim: '2026-10-31T00:00:00Z',
        clienteId,
        profissionalId: outroProfissionalId,
    };

    const resultado = await sessoesClinicasAcessoService.listar(contexto, filtros);

    assert.deepEqual(resultado, []);
    assert.equal(listar.mock.callCount(), 1);

    const argumentos = listar.mock.calls[0]?.arguments;

    // Agora o Service recebe:
    // 0: organizacaoId
    // 1: areaNegocioId
    // 2: usuarioId
    // 3: filtros
    assert.equal(argumentos?.[0], organizacaoId);
    assert.equal(argumentos?.[1], areaNegocioId);
    assert.equal(argumentos?.[2], usuarioId);

    const filtrosAplicados = argumentos?.[3];

    // Não pode consultar os atendimentos de outro profissional.
    assert.equal(filtrosAplicados?.profissionalId, profissionalId);

    // Os demais filtros devem ser preservados.
    assert.equal(filtrosAplicados?.clienteId, clienteId);
    assert.equal(filtrosAplicados?.inicio, filtros.inicio);
    assert.equal(filtrosAplicados?.fim, filtros.fim);
});

// ============================================================
// TESTE 5 — LISTAGEM APÓS REVOGAÇÃO DE PERMISSÃO
// ============================================================

test('listagem é negada quando autorização clínica foi revogada', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'identificarProfissional', async () => {
        throw new AppError('Permissão clínica revogada.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    // ATUALIZADO
    const listar = t.mock.method(sessoesClinicasService, 'listarAutorizadas', async () => []);

    await assert.rejects(
        sessoesClinicasAcessoService.listar(contexto, {
            inicio: '2026-10-01T00:00:00Z',
            fim: '2026-10-31T00:00:00Z',
        }),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );

    // A listagem não deve ser executada.
    assert.equal(listar.mock.callCount(), 0);
});

// ============================================================
// TESTE 6 — CONSULTA DA PRÓPRIA SESSÃO
// ============================================================

test('permite consultar a própria sessão autorizada', async (t) => {
    const verificarTitularidade = t.mock.method(
        autorizacaoClinicaService,
        'exigirTitularidadeSessao',
        async () => ({ profissionalId }),
    );

    // ATUALIZADO: busca protegida no SQL.
    const buscar = t.mock.method(
        sessoesClinicasService,
        'buscarPorIdAutorizada',
        async () => sessaoExemplo,
    );

    const resultado = await sessoesClinicasAcessoService.buscarPorId(contexto, sessaoId);

    assert.equal(resultado.id, sessaoId);
    assert.equal(verificarTitularidade.mock.callCount(), 1);
    assert.equal(buscar.mock.callCount(), 1);

    // Verifica os argumentos da autorização.
    assert.deepEqual(verificarTitularidade.mock.calls[0]?.arguments.slice(0, 4), [
        usuarioId,
        organizacaoId,
        areaNegocioId,
        sessaoId,
    ]);

    // Verifica os argumentos da consulta SQL autorizada.
    const argumentosBusca = buscar.mock.calls[0]?.arguments;

    assert.equal(argumentosBusca?.[0], organizacaoId);
    assert.equal(argumentosBusca?.[1], areaNegocioId);
    assert.equal(argumentosBusca?.[2], usuarioId);
    assert.equal(argumentosBusca?.[3], sessaoId);
});

// ============================================================
// TESTE 7 — CONSULTA DE SESSÃO DE OUTRO PROFISSIONAL
// ============================================================

test('sessão de outro profissional não pode ser consultada', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => {
        throw new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    });

    // ATUALIZADO
    const buscar = t.mock.method(
        sessoesClinicasService,
        'buscarPorIdAutorizada',
        async () => sessaoExemplo,
    );

    await assert.rejects(
        sessoesClinicasAcessoService.buscarPorId(contexto, crypto.randomUUID()),
        verificarErro('SESSAO_CLINICA_NAO_ENCONTRADA', 404),
    );

    // A consulta SQL não deve ser executada.
    assert.equal(buscar.mock.callCount(), 0);
});

// ============================================================
// TESTE 8 — USUÁRIO SEM AUTORIZAÇÃO NÃO CONSULTA POR ID
// ============================================================

test('usuário sem permissão não pode consultar sessão por ID', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => {
        throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    // ATUALIZADO
    const buscar = t.mock.method(
        sessoesClinicasService,
        'buscarPorIdAutorizada',
        async () => sessaoExemplo,
    );

    await assert.rejects(
        sessoesClinicasAcessoService.buscarPorId(contexto, sessaoId),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );

    assert.equal(buscar.mock.callCount(), 0);
});

test('permite corrigir sessão do profissional titular autorizado', async (t) => {
    const verificarTitularidade = t.mock.method(
        autorizacaoClinicaService,
        'exigirTitularidadeSessao',
        async () => ({ profissionalId }),
    );

    const corrigir = t.mock.method(sessoesClinicasService, 'corrigir', async () => ({
        sessao: sessaoExemplo,
        camposAlterados: ['evolucao'],
    }));

    const dadosCorrecao = {
        evolucao: 'Evolução clínica corrigida.',
    };

    const resultado = await sessoesClinicasAcessoService.corrigir(
        contexto,
        sessaoId,
        dadosCorrecao,
    );

    assert.equal(resultado.sessao.id, sessaoId);
    assert.deepEqual(resultado.camposAlterados, ['evolucao']);

    assert.equal(verificarTitularidade.mock.callCount(), 1);
    assert.equal(corrigir.mock.callCount(), 1);

    assert.deepEqual(corrigir.mock.calls[0]?.arguments, [
        organizacaoId,
        areaNegocioId,
        usuarioId,
        sessaoId,
        dadosCorrecao,
    ]);
});

test('impede corrigir sessão de outro profissional', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => {
        throw new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    });

    const corrigir = t.mock.method(sessoesClinicasService, 'corrigir', async () => ({
        sessao: sessaoExemplo,
        camposAlterados: ['evolucao'],
    }));

    await assert.rejects(
        sessoesClinicasAcessoService.corrigir(contexto, crypto.randomUUID(), {
            evolucao: 'Tentativa de alteração indevida.',
        }),
        verificarErro('SESSAO_CLINICA_NAO_ENCONTRADA', 404),
    );

    assert.equal(corrigir.mock.callCount(), 0);
});

test('impede corrigir sessão sem autorização clínica', async (t) => {
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => {
        throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    const corrigir = t.mock.method(sessoesClinicasService, 'corrigir', async () => ({
        sessao: sessaoExemplo,
        camposAlterados: ['evolucao'],
    }));

    await assert.rejects(
        sessoesClinicasAcessoService.corrigir(contexto, sessaoId, {
            evolucao: 'Alteração não autorizada.',
        }),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );

    assert.equal(corrigir.mock.callCount(), 0);
});

test('propaga revogação detectada pela validação transacional', async (t) => {
    // Simula autorização inicial válida.
    t.mock.method(autorizacaoClinicaService, 'exigirTitularidadeSessao', async () => ({
        profissionalId,
    }));

    // Simula revogação detectada posteriormente pelo Service.
    const corrigir = t.mock.method(sessoesClinicasService, 'corrigir', async () => {
        throw new AppError('Autorização clínica revogada.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    await assert.rejects(
        sessoesClinicasAcessoService.corrigir(contexto, sessaoId, {
            evolucao: 'Alteração após revogação.',
        }),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );

    assert.equal(corrigir.mock.callCount(), 1);
});
