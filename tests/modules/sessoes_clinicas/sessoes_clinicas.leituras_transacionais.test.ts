import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before, beforeEach } from 'node:test';

import type { Knex } from 'knex';

import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import permissoesClinicasService from '../../../src/modules/profissionais/permissoes_clinicas.service.js';
import auditoriaClinicaTransacional from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.auditoria_transacional.js';
import sessoesClinicasLeiturasTransacionaisService from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.leituras_transacionais.service.js';
import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';
import AppError from '../../../src/shared/errors/AppError.js';

const ids = {
    organizacaoId: crypto.randomUUID(),
    areaNegocioId: crypto.randomUUID(),
    administradorId: crypto.randomUUID(),
    usuarioTitularId: crypto.randomUUID(),
    usuarioOutroId: crypto.randomUUID(),
    profissionalTitularId: crypto.randomUUID(),
    profissionalOutroId: crypto.randomUUID(),
    clienteTitularId: crypto.randomUUID(),
    clienteOutroId: crypto.randomUUID(),
    sessaoTitularId: crypto.randomUUID(),
    sessaoOutraId: crypto.randomUUID(),
};

const textoClinico = 'Texto clínico fictício exclusivo da integração transacional.';
const acoesLeitura = [
    'SESSAO_CLINICA.LISTADA',
    'SESSAO_CLINICA.CONSULTADA',
    'SESSAO_CLINICA.HISTORICO_CONSULTADO',
];
const contexto = {
    usuarioId: ids.usuarioTitularId,
    organizacaoId: ids.organizacaoId,
    areaNegocioId: ids.areaNegocioId,
};
const filtros = {
    inicio: '2026-10-01T00:00:00Z',
    fim: '2026-10-02T00:00:00Z',
};
const metadados = {
    requestId: crypto.randomUUID(),
    ip: '127.0.0.1',
    userAgent: 'Suite transacional PostgreSQL',
};

function exigirBancoTeste(): void {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Este teste exige NODE_ENV=test e AMBIENTE_BANCO=teste.');
    }
}

function erroAcessoNegado(erro: unknown): boolean {
    return (
        erro instanceof AppError && erro.statusCode === 403 && erro.code === 'ACESSO_CLINICO_NEGADO'
    );
}

async function limparAuditorias(): Promise<void> {
    await connection('registros_auditoria').where('organizacao_id', ids.organizacaoId).del();
}

before(async () => {
    exigirBancoTeste();

    await connection.transaction(async (tx) => {
        await tx('organizacoes').insert({
            id: ids.organizacaoId,
            nome: `Organizacao ficticia leitura clinica ${ids.organizacaoId}`,
            ativo: true,
        });

        await tx('areas_negocio').insert({
            id: ids.areaNegocioId,
            organizacao_id: ids.organizacaoId,
            codigo: `LEIT-${ids.areaNegocioId.slice(0, 8)}`,
            nome: 'Area ficticia de leitura clinica',
            ativo: true,
        });

        await tx('usuarios').insert(
            [ids.administradorId, ids.usuarioTitularId, ids.usuarioOutroId].map((id) => ({
                id,
                nome: 'Usuario ficticio de teste clinico',
                email: `leitura-${id}@teste.local`,
                senha_hash: 'hash-ficticio',
                ativo: true,
            })),
        );

        await tx('usuarios_organizacoes').insert([
            {
                usuario_id: ids.administradorId,
                organizacao_id: ids.organizacaoId,
                perfil: 'ADMINISTRADOR',
                ativo: true,
            },
            ...[ids.usuarioTitularId, ids.usuarioOutroId].map((usuarioId) => ({
                usuario_id: usuarioId,
                organizacao_id: ids.organizacaoId,
                perfil: 'OPERADOR',
                ativo: true,
            })),
        ]);

        await tx('clientes').insert([
            {
                id: ids.clienteTitularId,
                organizacao_id: ids.organizacaoId,
                nome: 'Paciente ficticio titular',
                ativo: true,
            },
            {
                id: ids.clienteOutroId,
                organizacao_id: ids.organizacaoId,
                nome: 'Paciente ficticio outro profissional',
                ativo: true,
            },
        ]);

        await tx('clientes_areas').insert(
            [ids.clienteTitularId, ids.clienteOutroId].map((clienteId) => ({
                cliente_id: clienteId,
                area_negocio_id: ids.areaNegocioId,
                ativo: true,
            })),
        );

        await tx('profissionais').insert([
            {
                id: ids.profissionalTitularId,
                organizacao_id: ids.organizacaoId,
                usuario_id: ids.usuarioTitularId,
                nome: 'Profissional ficticio titular',
                ativo: true,
            },
            {
                id: ids.profissionalOutroId,
                organizacao_id: ids.organizacaoId,
                usuario_id: ids.usuarioOutroId,
                nome: 'Outro profissional ficticio',
                ativo: true,
            },
        ]);

        await tx('profissionais_areas').insert(
            [ids.profissionalTitularId, ids.profissionalOutroId].map((profissionalId) => ({
                profissional_id: profissionalId,
                area_negocio_id: ids.areaNegocioId,
                ativo: true,
                acesso_clinico_autorizado: true,
            })),
        );

        await tx('sessoes_clinicas').insert([
            {
                id: ids.sessaoTitularId,
                organizacao_id: ids.organizacaoId,
                area_negocio_id: ids.areaNegocioId,
                cliente_id: ids.clienteTitularId,
                profissional_id: ids.profissionalTitularId,
                data_sessao: new Date('2026-10-01T14:00:00Z'),
                evolucao: textoClinico,
            },
            {
                id: ids.sessaoOutraId,
                organizacao_id: ids.organizacaoId,
                area_negocio_id: ids.areaNegocioId,
                cliente_id: ids.clienteOutroId,
                profissional_id: ids.profissionalOutroId,
                data_sessao: new Date('2026-10-01T15:00:00Z'),
                evolucao: 'Texto ficticio de outro profissional.',
            },
        ]);
    });
});

beforeEach(async () => {
    exigirBancoTeste();
    await limparAuditorias();
    await connection('profissionais_areas')
        .whereIn('profissional_id', [ids.profissionalTitularId, ids.profissionalOutroId])
        .update({ acesso_clinico_autorizado: true });
});

after(async () => {
    try {
        exigirBancoTeste();

        const historico = await connection('historico_correcoes_sessoes_clinicas as hc')
            .innerJoin('sessoes_clinicas as sc', 'sc.id', 'hc.sessao_clinica_id')
            .select('hc.id')
            .where('sc.organizacao_id', ids.organizacaoId)
            .first();

        if (historico) {
            throw new Error('Limpeza interrompida: a fixture contém histórico clínico imutável.');
        }

        await connection.transaction(async (tx) => {
            await tx('registros_auditoria').where('organizacao_id', ids.organizacaoId).del();
            await tx('sessoes_clinicas')
                .whereIn('id', [ids.sessaoTitularId, ids.sessaoOutraId])
                .del();
            await tx('profissionais_areas')
                .whereIn('profissional_id', [ids.profissionalTitularId, ids.profissionalOutroId])
                .del();
            await tx('clientes_areas')
                .whereIn('cliente_id', [ids.clienteTitularId, ids.clienteOutroId])
                .del();
            await tx('profissionais')
                .whereIn('id', [ids.profissionalTitularId, ids.profissionalOutroId])
                .del();
            await tx('clientes').whereIn('id', [ids.clienteTitularId, ids.clienteOutroId]).del();
            await tx('usuarios_organizacoes').where('organizacao_id', ids.organizacaoId).del();
            await tx('usuarios')
                .whereIn('id', [ids.administradorId, ids.usuarioTitularId, ids.usuarioOutroId])
                .del();
            await tx('areas_negocio').where('id', ids.areaNegocioId).del();
            await tx('organizacoes').where('id', ids.organizacaoId).del();
        });
    } finally {
        await connection.destroy();
    }
});

test('audita no PostgreSQL a listagem, consulta individual e histórico', async () => {
    const sessoes = await sessoesClinicasLeiturasTransacionaisService.listar(
        contexto,
        { ...filtros, profissionalId: ids.profissionalOutroId },
        { ...metadados, requestId: crypto.randomUUID() },
    );
    const sessao = await sessoesClinicasLeiturasTransacionaisService.buscarPorId(
        contexto,
        ids.sessaoTitularId,
        { ...metadados, requestId: crypto.randomUUID() },
    );
    const historico = await sessoesClinicasLeiturasTransacionaisService.listarHistoricoCorrecoes(
        contexto,
        ids.sessaoTitularId,
        { ...metadados, requestId: crypto.randomUUID() },
    );

    assert.deepEqual(
        sessoes.map((item) => item.profissional_id),
        [ids.profissionalTitularId],
        'filtro de outro profissional não deve escapar da identidade autenticada',
    );
    assert.equal(sessao.id, ids.sessaoTitularId);
    assert.equal(sessao.evolucao, textoClinico);
    assert.deepEqual(historico, []);

    const registros = await connection('registros_auditoria')
        .select(
            'organizacao_id',
            'area_negocio_id',
            'usuario_id',
            'acao',
            'recurso',
            'recurso_id',
            'dados_contexto',
        )
        .where('organizacao_id', ids.organizacaoId)
        .whereIn('acao', acoesLeitura);

    assert.equal(registros.length, 3);
    assert.deepEqual(new Set(registros.map((registro) => registro.acao)), new Set(acoesLeitura));

    for (const registro of registros) {
        assert.equal(registro.organizacao_id, ids.organizacaoId);
        assert.equal(registro.area_negocio_id, ids.areaNegocioId);
        assert.equal(registro.usuario_id, ids.usuarioTitularId);
        assert.equal(registro.recurso, 'SESSAO_CLINICA');
        assert.equal(JSON.stringify(registro).includes(textoClinico), false);
    }

    const auditoriaLista = registros.find((registro) => registro.acao === 'SESSAO_CLINICA.LISTADA');
    const auditoriaConsulta = registros.find(
        (registro) => registro.acao === 'SESSAO_CLINICA.CONSULTADA',
    );
    const auditoriaHistorico = registros.find(
        (registro) => registro.acao === 'SESSAO_CLINICA.HISTORICO_CONSULTADO',
    );

    assert.equal(auditoriaLista?.recurso_id, null);
    assert.equal(auditoriaConsulta?.recurso_id, ids.sessaoTitularId);
    assert.equal(auditoriaHistorico?.recurso_id, ids.sessaoTitularId);
    assert.ok(auditoriaLista?.dados_contexto?.requestId);
    assert.ok(auditoriaConsulta?.dados_contexto?.requestId);
    assert.ok(auditoriaHistorico?.dados_contexto?.requestId);
});

test('revogação clínica bloqueia listagem, consulta e histórico seguintes', async () => {
    await permissoesClinicasService.alterar({
        organizacaoId: ids.organizacaoId,
        areaNegocioId: ids.areaNegocioId,
        administradorId: ids.administradorId,
        profissionalId: ids.profissionalTitularId,
        autorizado: false,
        requestId: crypto.randomUUID(),
    });

    const vinculo = await connection('profissionais_areas')
        .select('acesso_clinico_autorizado')
        .where({
            profissional_id: ids.profissionalTitularId,
            area_negocio_id: ids.areaNegocioId,
        })
        .first();
    assert.equal(vinculo?.acesso_clinico_autorizado, false);

    await assert.rejects(
        sessoesClinicasLeiturasTransacionaisService.listar(contexto, filtros),
        erroAcessoNegado,
    );
    await assert.rejects(
        sessoesClinicasLeiturasTransacionaisService.buscarPorId(contexto, ids.sessaoTitularId),
        erroAcessoNegado,
    );
    await assert.rejects(
        sessoesClinicasLeiturasTransacionaisService.listarHistoricoCorrecoes(
            contexto,
            ids.sessaoTitularId,
        ),
        erroAcessoNegado,
    );
});

test('falha real da auditoria reverte a transação da consulta', async (t) => {
    const registrarOriginal = auditoriaClinicaTransacional.registrar.bind(
        auditoriaClinicaTransacional,
    );
    const registrar = t.mock.method(
        auditoriaClinicaTransacional,
        'registrar',
        async (tx: Knex.Transaction, dados: Parameters<typeof registrarOriginal>[1]) => {
            await tx('registros_auditoria').insert({
                organizacao_id: ids.organizacaoId,
                area_negocio_id: ids.areaNegocioId,
                usuario_id: ids.usuarioTitularId,
                acao: 'SESSAO_CLINICA.AUDITORIA_PARCIAL_TESTE',
                recurso: 'SESSAO_CLINICA',
                recurso_id: ids.sessaoTitularId,
            });

            await registrarOriginal(tx, {
                ...dados,
                organizacaoId: crypto.randomUUID(),
            });
        },
    );

    await assert.rejects(
        sessoesClinicasLeiturasTransacionaisService.buscarPorId(
            contexto,
            ids.sessaoTitularId,
            metadados,
        ),
        (erro: unknown) =>
            erro instanceof AppError &&
            erro.statusCode === 503 &&
            erro.code === 'AUDITORIA_CLINICA_INDISPONIVEL',
    );

    assert.equal(registrar.mock.callCount(), 1);

    const registros = await connection('registros_auditoria')
        .where('organizacao_id', ids.organizacaoId)
        .where('recurso_id', ids.sessaoTitularId);
    assert.deepEqual(registros, [], 'auditoria parcial e leitura devem sofrer rollback');
});

test('leitura autorizada mantém lock até o commit antes da revogação', async (t) => {
    let liberarLeitura: (() => void) | undefined;
    let informarLeituraConcluida: (() => void) | undefined;
    const leituraLiberada = new Promise<void>((resolve) => {
        liberarLeitura = resolve;
    });
    const leituraConcluida = new Promise<void>((resolve) => {
        informarLeituraConcluida = resolve;
    });
    const listarOriginal =
        sessoesClinicasRepository.listarAutorizadas.bind(sessoesClinicasRepository);
    const listar = t.mock.method(
        sessoesClinicasRepository,
        'listarAutorizadas',
        async (...argumentos: Parameters<typeof listarOriginal>) => {
            const resultado = await listarOriginal(...argumentos);
            informarLeituraConcluida?.();
            await leituraLiberada;
            return resultado;
        },
    );

    const transacaoOriginal = connection.transaction.bind(connection);
    let capturarPidDaRevogacao = false;
    let resolverPidDaRevogacao: ((pid: number) => void) | undefined;
    const pidDaRevogacao = new Promise<number>((resolve) => {
        resolverPidDaRevogacao = resolve;
    });
    t.mock.method(
        connection,
        'transaction',
        (callback: (tx: Knex.Transaction) => Promise<unknown>) =>
            transacaoOriginal(async (tx) => {
                if (capturarPidDaRevogacao) {
                    capturarPidDaRevogacao = false;
                    const resultado = await tx.raw('select pg_backend_pid() as pid');
                    resolverPidDaRevogacao?.(Number(resultado.rows[0].pid));
                }

                return callback(tx);
            }),
    );

    let leitura: Promise<unknown> | undefined;
    let revogacao: Promise<unknown> | undefined;
    let revogacaoConcluida = false;

    try {
        leitura = sessoesClinicasLeiturasTransacionaisService.listar(contexto, filtros, metadados);
        await leituraConcluida;

        capturarPidDaRevogacao = true;
        revogacao = permissoesClinicasService
            .alterar({
                organizacaoId: ids.organizacaoId,
                areaNegocioId: ids.areaNegocioId,
                administradorId: ids.administradorId,
                profissionalId: ids.profissionalTitularId,
                autorizado: false,
                requestId: crypto.randomUUID(),
            })
            .then((resultado) => {
                revogacaoConcluida = true;
                return resultado;
            });

        const pid = await pidDaRevogacao;
        const prazo = Date.now() + 5000;
        let bloqueadaPorLeitura = false;

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
                bloqueadaPorLeitura = true;
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        assert.equal(bloqueadaPorLeitura, true, 'PostgreSQL deve mostrar a revogação bloqueada');
        assert.equal(revogacaoConcluida, false);
        assert.equal(listar.mock.callCount(), 1);

        liberarLeitura?.();
        await leitura;
        await revogacao;

        assert.equal(revogacaoConcluida, true);

        const vinculo = await connection('profissionais_areas')
            .select('acesso_clinico_autorizado')
            .where({
                profissional_id: ids.profissionalTitularId,
                area_negocio_id: ids.areaNegocioId,
            })
            .first();
        assert.equal(vinculo?.acesso_clinico_autorizado, false);

        await assert.rejects(
            sessoesClinicasLeiturasTransacionaisService.listar(contexto, filtros),
            erroAcessoNegado,
        );
        await assert.rejects(
            sessoesClinicasLeiturasTransacionaisService.buscarPorId(contexto, ids.sessaoTitularId),
            erroAcessoNegado,
        );
        await assert.rejects(
            sessoesClinicasLeiturasTransacionaisService.listarHistoricoCorrecoes(
                contexto,
                ids.sessaoTitularId,
            ),
            erroAcessoNegado,
        );
    } finally {
        liberarLeitura?.();
        await leitura?.catch(() => undefined);
        await revogacao?.catch(() => undefined);
    }
});
