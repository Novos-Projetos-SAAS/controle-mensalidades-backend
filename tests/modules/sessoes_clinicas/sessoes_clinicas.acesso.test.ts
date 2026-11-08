import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import AppError from '../../../src/shared/errors/AppError.js';
import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';
import sessoesClinicasAcessoService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.acesso.service.js';
import sessoesClinicasLeiturasTransacionaisService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.leituras_transacionais.service.js';
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
    // O usuário autenticado e os metadados opcionais são encaminhados ao Service.
    assert.equal(argumentos?.[3], usuarioId);
    assert.equal(argumentos?.[4], undefined);
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

test('transactional read facade forwards list context, filters and audit metadata', async (t) => {
    const listar = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listar',
        async () => [sessaoExemplo],
    );
    const filtros = {
        inicio: '2026-10-01T00:00:00Z',
        fim: '2026-10-31T00:00:00Z',
        clienteId,
        profissionalId: outroProfissionalId,
    };
    const metadados = { requestId: 'request-lista' };

    const resultado = await sessoesClinicasAcessoService.listar(contexto, filtros, metadados);

    assert.deepEqual(resultado, [sessaoExemplo]);
    assert.deepEqual(listar.mock.calls[0]?.arguments, [contexto, filtros, metadados]);
});

test('transactional list facade propagates clinical access denial', async (t) => {
    t.mock.method(sessoesClinicasLeiturasTransacionaisService, 'listar', async () => {
        throw new AppError('Acesso clínico negado.', 403, 'ACESSO_CLINICO_NEGADO');
    });

    await assert.rejects(
        sessoesClinicasAcessoService.listar(contexto, {
            inicio: '2026-10-01T00:00:00Z',
            fim: '2026-10-31T00:00:00Z',
        }),
        verificarErro('ACESSO_CLINICO_NEGADO', 403),
    );
});

test('transactional read facade forwards individual session lookup', async (t) => {
    const buscar = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'buscarPorId',
        async () => sessaoExemplo,
    );
    const metadados = { requestId: 'request-detalhe' };

    const resultado = await sessoesClinicasAcessoService.buscarPorId(contexto, sessaoId, metadados);

    assert.equal(resultado.id, sessaoId);
    assert.deepEqual(buscar.mock.calls[0]?.arguments, [contexto, sessaoId, metadados]);
});

test('transactional detail facade preserves the 404 for a session owned by someone else', async (t) => {
    t.mock.method(sessoesClinicasLeiturasTransacionaisService, 'buscarPorId', async () => {
        throw new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
    });

    await assert.rejects(
        sessoesClinicasAcessoService.buscarPorId(contexto, crypto.randomUUID()),
        verificarErro('SESSAO_CLINICA_NAO_ENCONTRADA', 404),
    );
});

test('transactional read facade forwards clinical history lookup', async (t) => {
    const listarHistorico = t.mock.method(
        sessoesClinicasLeiturasTransacionaisService,
        'listarHistoricoCorrecoes',
        async () => [],
    );
    const metadados = { requestId: 'request-historico' };

    const resultado = await sessoesClinicasAcessoService.listarHistoricoCorrecoes(
        contexto,
        sessaoId,
        metadados,
    );

    assert.deepEqual(resultado, []);
    assert.deepEqual(listarHistorico.mock.calls[0]?.arguments, [contexto, sessaoId, metadados]);
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
        undefined,
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
