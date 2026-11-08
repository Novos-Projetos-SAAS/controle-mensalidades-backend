import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import permissoesClinicasService from '../../../src/modules/profissionais/permissoes_clinicas.service.js';
import vinculoUsuarioService from '../../../src/modules/profissionais/vinculo_usuario.service.js';
import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';
import sessoesClinicasService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.service.js';
import AppError from '../../../src/shared/errors/AppError.js';

type Fixture = {
    organizacaoId: string;
    areaId: string;
    administradorId: string;
    usuarioId: string;
    profissionalId: string;
    clienteId: string;
    sessaoBaseId: string;
};

const TEXTO_ORIGINAL = 'Evolucao original ficticia.';
const TEXTO_CORRIGIDO = 'Evolucao corrigida ficticia.';
const DATA_SESSAO = '2026-10-01T14:00:00Z';
const fixtures: Fixture[] = [];

function exigirBancoTeste(): void {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Teste de concorrencia exige NODE_ENV=test e AMBIENTE_BANCO=teste.');
    }
}

function novosIds(): Fixture {
    return {
        organizacaoId: crypto.randomUUID(),
        areaId: crypto.randomUUID(),
        administradorId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        clienteId: crypto.randomUUID(),
        sessaoBaseId: crypto.randomUUID(),
    };
}

async function prepararFixture(incluirSessaoBase: boolean): Promise<Fixture> {
    exigirBancoTeste();
    const f = novosIds();

    await connection.transaction(async (tx) => {
        await tx('organizacoes').insert({
            id: f.organizacaoId,
            nome: 'Organizacao ficticia concorrencia clinica',
            ativo: true,
        });
        await tx('areas_negocio').insert({
            id: f.areaId,
            organizacao_id: f.organizacaoId,
            codigo: `CONC-${f.areaId.slice(0, 8)}`,
            nome: 'Fisioterapia ficticia',
            ativo: true,
        });
        await tx('usuarios').insert([
            {
                id: f.administradorId,
                nome: 'Administrador ficticio',
                email: `conc-admin-${f.administradorId}@teste.local`,
                senha_hash: 'hash-ficticio',
                ativo: true,
            },
            {
                id: f.usuarioId,
                nome: 'Profissional ficticio',
                email: `conc-prof-${f.usuarioId}@teste.local`,
                senha_hash: 'hash-ficticio',
                ativo: true,
            },
        ]);
        await tx('usuarios_organizacoes').insert([
            {
                usuario_id: f.administradorId,
                organizacao_id: f.organizacaoId,
                perfil: 'ADMINISTRADOR',
                ativo: true,
            },
            {
                usuario_id: f.usuarioId,
                organizacao_id: f.organizacaoId,
                perfil: 'OPERADOR',
                ativo: true,
            },
        ]);
        await tx('clientes').insert({
            id: f.clienteId,
            organizacao_id: f.organizacaoId,
            nome: 'Paciente ficticio',
            ativo: true,
        });
        await tx('clientes_areas').insert({
            cliente_id: f.clienteId,
            area_negocio_id: f.areaId,
            ativo: true,
        });
        await tx('profissionais').insert({
            id: f.profissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.usuarioId,
            nome: 'Fisioterapeuta ficticio',
            ativo: true,
        });
        await tx('profissionais_areas').insert({
            profissional_id: f.profissionalId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        });

        if (incluirSessaoBase) {
            await tx('sessoes_clinicas').insert({
                id: f.sessaoBaseId,
                organizacao_id: f.organizacaoId,
                area_negocio_id: f.areaId,
                cliente_id: f.clienteId,
                profissional_id: f.profissionalId,
                data_sessao: new Date(DATA_SESSAO),
                evolucao: TEXTO_ORIGINAL,
            });
        }
    });

    fixtures.push(f);
    return f;
}

function revogar(f: Fixture) {
    return permissoesClinicasService.alterar({
        organizacaoId: f.organizacaoId,
        areaNegocioId: f.areaId,
        administradorId: f.administradorId,
        profissionalId: f.profissionalId,
        autorizado: false,
        requestId: crypto.randomUUID(),
    });
}

function erroAcessoNegado(error: unknown): boolean {
    return (
        error instanceof AppError &&
        error.statusCode === 403 &&
        error.code === 'ACESSO_CLINICO_NEGADO'
    );
}

function erroBloqueio(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03';
}

async function aguardarBloqueioPostgres(pid: number): Promise<boolean> {
    const prazo = Date.now() + 5000;

    while (Date.now() < prazo) {
        const atividade = await connection('pg_stat_activity')
            .select('wait_event_type')
            .select(connection.raw('pg_blocking_pids(pid) as bloqueadores'))
            .where({ pid })
            .first();

        if (
            atividade?.wait_event_type === 'Lock' &&
            Array.isArray(atividade.bloqueadores) &&
            atividade.bloqueadores.length > 0
        ) {
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
    }

    return false;
}

// Prova um conflito real entre duas conexoes, sem usar sleeps ou delays.
async function exigirBloqueioDoVinculo(f: Fixture): Promise<void> {
    await assert.rejects(
        connection.transaction(async (probe) => {
            await probe('profissionais_areas')
                .select('profissional_id')
                .where({
                    profissional_id: f.profissionalId,
                    area_negocio_id: f.areaId,
                })
                .forUpdate()
                .noWait()
                .first();
        }),
        erroBloqueio,
    );
}

// Reaproveita o metodo transacional real, mas mantem a transacao externa
// aberta para simular outra conexao tentando revogar a permissao.
async function executarDentroDaTransacao<T>(
    tx: Knex.Transaction,
    executar: () => Promise<T>,
): Promise<T> {
    const original = sessoesClinicasRepository.executarEmTransacao;
    sessoesClinicasRepository.executarEmTransacao = async <R>(
        operacao: (interna: Knex.Transaction) => Promise<R>,
    ): Promise<R> => tx.transaction(operacao);

    try {
        return await executar();
    } finally {
        sessoesClinicasRepository.executarEmTransacao = original;
    }
}

// O historico clinico e imutavel: a correcao experimental faz rollback;
// nunca desabilitamos o trigger nem tentamos apagar historico confirmado.
after(async () => {
    try {
        exigirBancoTeste();
        for (const f of fixtures.reverse()) {
            await connection.transaction(async (tx) => {
                const historico = await tx('historico_correcoes_sessoes_clinicas as hc')
                    .innerJoin('sessoes_clinicas as sc', 'sc.id', 'hc.sessao_clinica_id')
                    .select('hc.id')
                    .where('sc.organizacao_id', f.organizacaoId)
                    .first();
                if (historico) {
                    throw new Error(
                        'Fixture possui historico clinico imutavel: limpeza interrompida.',
                    );
                }

                await tx('registros_auditoria').where('organizacao_id', f.organizacaoId).del();
                await tx('sessoes_clinicas').where('organizacao_id', f.organizacaoId).del();
                await tx('profissionais_areas').where('profissional_id', f.profissionalId).del();
                await tx('clientes_areas').where('cliente_id', f.clienteId).del();
                await tx('profissionais').where('id', f.profissionalId).del();
                await tx('clientes').where('id', f.clienteId).del();
                await tx('usuarios_organizacoes').where('organizacao_id', f.organizacaoId).del();
                await tx('usuarios').whereIn('id', [f.administradorId, f.usuarioId]).del();
                await tx('areas_negocio').where('id', f.areaId).del();
                await tx('organizacoes').where('id', f.organizacaoId).del();
            });
        }
    } finally {
        await connection.destroy();
    }
});

test('criacao clinica mantem lock ate commit e revogacao impede nova criacao', async () => {
    const f = await prepararFixture(false);
    let tx: Knex.Transaction | undefined;
    let revogacao: ReturnType<typeof revogar> | undefined;

    try {
        tx = await connection.transaction();
        const sessao = await executarDentroDaTransacao(tx, () =>
            sessoesClinicasService.criar(
                f.organizacaoId,
                f.areaId,
                {
                    cliente_id: f.clienteId,
                    profissional_id: f.profissionalId,
                    data_sessao: DATA_SESSAO,
                    evolucao: TEXTO_ORIGINAL,
                },
                f.usuarioId,
                { requestId: crypto.randomUUID() },
            ),
        );

        assert.equal(sessao.profissional_id, f.profissionalId);

        const auditoriaNoTx = await tx('registros_auditoria').where({
            organizacao_id: f.organizacaoId,
            recurso_id: sessao.id,
            acao: 'SESSAO_CLINICA.CRIADA',
        });
        assert.equal(auditoriaNoTx.length, 1);

        // Enquanto a criacao ainda nao tem commit, FOR UPDATE NOWAIT falha.
        await exigirBloqueioDoVinculo(f);

        // Dispara a revogacao em outra conexao enquanto a criacao esta ativa.
        revogacao = revogar(f);
        void revogacao.catch(() => undefined);

        await tx.commit();
        tx = undefined;

        const alteracao = await revogacao;
        assert.equal(alteracao.autorizado, false);

        const persistida = await connection('sessoes_clinicas').where('id', sessao.id).first();
        assert.ok(persistida);

        const auditoriaPersistida = await connection('registros_auditoria').where({
            organizacao_id: f.organizacaoId,
            recurso_id: sessao.id,
            acao: 'SESSAO_CLINICA.CRIADA',
        });
        assert.equal(auditoriaPersistida.length, 1);

        await assert.rejects(
            sessoesClinicasService.criar(
                f.organizacaoId,
                f.areaId,
                {
                    cliente_id: f.clienteId,
                    profissional_id: f.profissionalId,
                    data_sessao: DATA_SESSAO,
                    evolucao: 'Nova sessao indevida.',
                },
                f.usuarioId,
            ),
            erroAcessoNegado,
        );
    } finally {
        try {
            if (tx && !tx.isCompleted()) await tx.rollback();
        } finally {
            if (revogacao) await revogacao.catch(() => undefined);
        }
    }
});

test('correcao mantem lock, faz rollback externo e revogacao impede novo PATCH', async () => {
    const f = await prepararFixture(true);
    let tx: Knex.Transaction | undefined;
    let revogacao: ReturnType<typeof revogar> | undefined;

    try {
        tx = await connection.transaction();

        const resultado = await executarDentroDaTransacao(tx, () =>
            sessoesClinicasService.corrigir(
                f.organizacaoId,
                f.areaId,
                f.usuarioId,
                f.sessaoBaseId,
                { evolucao: TEXTO_CORRIGIDO },
                { requestId: crypto.randomUUID() },
            ),
        );
        assert.equal(resultado.sessao.evolucao, TEXTO_CORRIGIDO);

        const historicoNaTx = await tx('historico_correcoes_sessoes_clinicas').where(
            'sessao_clinica_id',
            f.sessaoBaseId,
        );
        assert.equal(historicoNaTx.length, 1);

        const auditoriaNaTx = await tx('registros_auditoria').where({
            organizacao_id: f.organizacaoId,
            recurso_id: f.sessaoBaseId,
            acao: 'SESSAO_CLINICA.CORRIGIDA',
        });
        assert.equal(auditoriaNaTx.length, 1);

        // O vinculo permanece protegido ate o final da transacao.
        await exigirBloqueioDoVinculo(f);

        revogacao = revogar(f);
        void revogacao.catch(() => undefined);

        // Rollback da correcao ficticia: nenhum historico imutavel e confirmado.
        await tx.rollback();
        tx = undefined;

        const alteracao = await revogacao;
        assert.equal(alteracao.autorizado, false);

        const sessaoOriginal = await connection('sessoes_clinicas')
            .select('evolucao')
            .where('id', f.sessaoBaseId)
            .first();
        assert.equal(sessaoOriginal?.evolucao, TEXTO_ORIGINAL);

        const historicoPersistido = await connection('historico_correcoes_sessoes_clinicas').where(
            'sessao_clinica_id',
            f.sessaoBaseId,
        );
        assert.equal(historicoPersistido.length, 0);

        const auditoriaPersistida = await connection('registros_auditoria').where({
            organizacao_id: f.organizacaoId,
            recurso_id: f.sessaoBaseId,
            acao: 'SESSAO_CLINICA.CORRIGIDA',
        });
        assert.equal(auditoriaPersistida.length, 0);

        await assert.rejects(
            sessoesClinicasService.corrigir(
                f.organizacaoId,
                f.areaId,
                f.usuarioId,
                f.sessaoBaseId,
                { evolucao: TEXTO_CORRIGIDO },
            ),
            erroAcessoNegado,
        );
    } finally {
        try {
            if (tx && !tx.isCompleted()) await tx.rollback();
        } finally {
            if (revogacao) await revogacao.catch(() => undefined);
        }
    }
});

test('correcoes concorrentes da mesma sessao sao serializadas pelo PostgreSQL', async (t) => {
    const f = await prepararFixture(true);
    let primeiraTx: Knex.Transaction | undefined;
    let segundaTx: Knex.Transaction | undefined;
    let liberarPrimeiraCorrecao: (() => void) | undefined;
    let informarPrimeiraCorrecaoPausada: (() => void) | undefined;
    let informarPidSegundaTx: ((pid: number) => void) | undefined;
    const primeiraCorrecaoLiberada = new Promise<void>((resolve) => {
        liberarPrimeiraCorrecao = resolve;
    });
    const primeiraCorrecaoPausada = new Promise<void>((resolve) => {
        informarPrimeiraCorrecaoPausada = resolve;
    });
    const pidSegundaTx = new Promise<number>((resolve) => {
        informarPidSegundaTx = resolve;
    });

    const registrarHistoricoOriginal =
        sessoesClinicasRepository.registrarHistoricoCorrecao.bind(sessoesClinicasRepository);
    let chamadasHistorico = 0;
    const registrarHistorico = t.mock.method(
        sessoesClinicasRepository,
        'registrarHistoricoCorrecao',
        async (...argumentos: Parameters<typeof registrarHistoricoOriginal>) => {
            chamadasHistorico += 1;
            if (chamadasHistorico === 1) {
                informarPrimeiraCorrecaoPausada?.();
                await primeiraCorrecaoLiberada;
            }

            return registrarHistoricoOriginal(...argumentos);
        },
    );

    let primeira: ReturnType<typeof sessoesClinicasService.corrigir> | undefined;
    let segunda: ReturnType<typeof sessoesClinicasService.corrigir> | undefined;

    try {
        exigirBancoTeste();
        primeiraTx = await connection.transaction();
        segundaTx = await connection.transaction();

        const transacaoOriginal = connection.transaction.bind(connection);
        const transacoesExternas = [primeiraTx, segundaTx];
        t.mock.method(
            connection,
            'transaction',
            (callback: (tx: Knex.Transaction) => Promise<unknown>) => {
                const externa = transacoesExternas.shift();
                if (!externa) {
                    return transacaoOriginal(callback);
                }

                return externa.transaction(async (interna) => {
                    if (externa === segundaTx) {
                        const resultado = await interna.raw('select pg_backend_pid() as pid');
                        informarPidSegundaTx?.(Number(resultado.rows[0].pid));
                    }

                    return callback(interna);
                });
            },
        );

        primeira = sessoesClinicasService.corrigir(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoBaseId,
            { evolucao: 'Primeira correcao concorrente.' },
            { requestId: crypto.randomUUID() },
        );
        await Promise.race([
            primeiraCorrecaoPausada,
            primeira.then(() => {
                throw new Error('A primeira correcao deveria estar pausada antes do historico.');
            }),
        ]);

        segunda = sessoesClinicasService.corrigir(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoBaseId,
            { evolucao: 'Segunda correcao concorrente.' },
            { requestId: crypto.randomUUID() },
        );

        const pid = await pidSegundaTx;
        const prazo = Date.now() + 5000;
        let bloqueadaPelaPrimeira = false;

        while (Date.now() < prazo) {
            const atividade = await connection('pg_stat_activity')
                .select('wait_event_type')
                .select(connection.raw('pg_blocking_pids(pid) as bloqueadores'))
                .where({ pid })
                .first();

            if (
                atividade?.wait_event_type === 'Lock' &&
                Array.isArray(atividade.bloqueadores) &&
                atividade.bloqueadores.length > 0
            ) {
                bloqueadaPelaPrimeira = true;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        assert.equal(
            bloqueadaPelaPrimeira,
            true,
            'a segunda correcao deve aguardar o lock da primeira no PostgreSQL',
        );
        assert.equal(registrarHistorico.mock.callCount(), 1);

        // A primeira transacao ficticia sofre rollback; a segunda continua e
        // deve calcular o historico a partir da versao efetivamente confirmada.
        liberarPrimeiraCorrecao?.();
        const resultadoPrimeira = await primeira;
        assert.equal(resultadoPrimeira.sessao.evolucao, 'Primeira correcao concorrente.');
        await primeiraTx.rollback();
        primeiraTx = undefined;

        const resultadoSegunda = await segunda;
        assert.equal(resultadoSegunda.sessao.evolucao, 'Segunda correcao concorrente.');

        const historico = await segundaTx('historico_correcoes_sessoes_clinicas')
            .select('dados_anteriores', 'dados_novos')
            .where('sessao_clinica_id', f.sessaoBaseId);
        assert.equal(historico.length, 1);
        assert.deepEqual(historico[0].dados_anteriores, { evolucao: TEXTO_ORIGINAL });
        assert.deepEqual(historico[0].dados_novos, {
            evolucao: 'Segunda correcao concorrente.',
        });
    } finally {
        liberarPrimeiraCorrecao?.();
        await primeira?.catch(() => undefined);
        if (primeiraTx && !primeiraTx.isCompleted()) await primeiraTx.rollback();
        await segunda?.catch(() => undefined);
        if (segundaTx && !segundaTx.isCompleted()) await segundaTx.rollback();
        registrarHistorico.mock.restore();
    }
});

test('vinculo de usuario aguarda criacao clinica e preserva a titularidade', async (t) => {
    const f = await prepararFixture(false);
    let tx: Knex.Transaction | undefined;
    let alteracaoVinculo: ReturnType<typeof vinculoUsuarioService.alterar> | undefined;
    let informarPidVinculo: ((pid: number) => void) | undefined;
    const pidVinculo = new Promise<number>((resolve) => {
        informarPidVinculo = resolve;
    });

    try {
        tx = await connection.transaction();
        const sessao = await executarDentroDaTransacao(tx, () =>
            sessoesClinicasService.criar(
                f.organizacaoId,
                f.areaId,
                {
                    cliente_id: f.clienteId,
                    profissional_id: f.profissionalId,
                    data_sessao: DATA_SESSAO,
                    evolucao: TEXTO_ORIGINAL,
                },
                f.usuarioId,
                { requestId: crypto.randomUUID() },
            ),
        );
        assert.equal(sessao.profissional_id, f.profissionalId);

        const transacaoOriginal = connection.transaction.bind(connection);
        t.mock.method(
            connection,
            'transaction',
            (callback: (tx: Knex.Transaction) => Promise<unknown>) =>
                transacaoOriginal(async (vinculoTx) => {
                    const resultado = await vinculoTx.raw('select pg_backend_pid() as pid');
                    informarPidVinculo?.(Number(resultado.rows[0].pid));
                    return callback(vinculoTx);
                }),
        );

        alteracaoVinculo = vinculoUsuarioService.alterar({
            organizacaoId: f.organizacaoId,
            areaNegocioId: f.areaId,
            administradorId: f.administradorId,
            profissionalId: f.profissionalId,
            usuarioId: null,
            requestId: crypto.randomUUID(),
        });
        void alteracaoVinculo.catch(() => undefined);

        const bloqueada = await aguardarBloqueioPostgres(await pidVinculo);
        assert.equal(bloqueada, true, 'a desvinculacao deve aguardar o lock da criacao clinica');

        await tx.commit();
        tx = undefined;

        await assert.rejects(
            alteracaoVinculo,
            (error: unknown) =>
                error instanceof AppError &&
                error.statusCode === 409 &&
                error.code === 'PROFISSIONAL_COM_HISTORICO_CLINICO',
        );

        const profissional = await connection('profissionais')
            .select('usuario_id')
            .where('id', f.profissionalId)
            .first();
        assert.equal(profissional?.usuario_id, f.usuarioId);
        assert.ok(await connection('sessoes_clinicas').where('id', sessao.id).first());
    } finally {
        if (tx && !tx.isCompleted()) await tx.rollback();
        await alteracaoVinculo?.catch(() => undefined);
    }
});

test('revogacoes administrativas simultaneas sao serializadas e auditadas uma vez', async (t) => {
    const f = await prepararFixture(false);
    let tx: Knex.Transaction | undefined;
    let primeiraRevogacao: ReturnType<typeof revogar> | undefined;
    let segundaRevogacao: ReturnType<typeof revogar> | undefined;
    let informarPidSegundaRevogacao: ((pid: number) => void) | undefined;
    const pidSegundaRevogacao = new Promise<number>((resolve) => {
        informarPidSegundaRevogacao = resolve;
    });

    try {
        tx = await connection.transaction();
        const transacaoOriginal = connection.transaction.bind(connection);
        let primeiraTransacao = true;

        t.mock.method(
            connection,
            'transaction',
            (callback: (tx: Knex.Transaction) => Promise<unknown>) => {
                if (primeiraTransacao) {
                    primeiraTransacao = false;
                    return tx!.transaction(callback);
                }

                return transacaoOriginal(async (revogacaoTx) => {
                    const resultado = await revogacaoTx.raw('select pg_backend_pid() as pid');
                    informarPidSegundaRevogacao?.(Number(resultado.rows[0].pid));
                    return callback(revogacaoTx);
                });
            },
        );

        primeiraRevogacao = revogar(f);
        const resultadoPrimeiro = await primeiraRevogacao;
        assert.equal(resultadoPrimeiro.autorizado, false);

        segundaRevogacao = revogar(f);
        void segundaRevogacao.catch(() => undefined);

        const bloqueada = await aguardarBloqueioPostgres(await pidSegundaRevogacao);
        assert.equal(bloqueada, true, 'a segunda revogacao deve aguardar o lock administrativo');

        await tx.commit();
        tx = undefined;

        await assert.rejects(
            segundaRevogacao,
            (error: unknown) =>
                error instanceof AppError &&
                error.statusCode === 409 &&
                error.code === 'PERMISSAO_CLINICA_SEM_ALTERACAO',
        );

        const auditorias = await connection('registros_auditoria').where({
            organizacao_id: f.organizacaoId,
            acao: 'PERMISSAO_CLINICA.REVOGADA',
            recurso_id: f.profissionalId,
        });
        assert.equal(auditorias.length, 1);
    } finally {
        if (tx && !tx.isCompleted()) await tx.rollback();
        await primeiraRevogacao?.catch(() => undefined);
        await segundaRevogacao?.catch(() => undefined);
    }
});
