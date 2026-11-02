import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after } from 'node:test';

import type { Knex } from 'knex';

import connection from '../../../src/database/connection.js';

import autorizacaoClinicaService from '../../../src/modules/sessoes_clinicas/autorizacao_clinica.service.js';

import sessoesClinicasRepository from '../../../src/modules/sessoes_clinicas/sessoes_clinicas.repository.js';

// ============================================================
// TIPOS E FIXTURES
// ============================================================

type Fixture = {
    organizacaoId: string;
    areaId: string;
    usuarioId: string;
    outroUsuarioId: string;
    recepcionistaId: string;
    administradorId: string;
    profissionalId: string;
    outroProfissionalId: string;
    clienteId: string;
    sessaoId: string;
    outraSessaoId: string;
};

function novosIds(): Fixture {
    return {
        organizacaoId: crypto.randomUUID(),
        areaId: crypto.randomUUID(),
        usuarioId: crypto.randomUUID(),
        outroUsuarioId: crypto.randomUUID(),
        recepcionistaId: crypto.randomUUID(),
        administradorId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        outroProfissionalId: crypto.randomUUID(),
        clienteId: crypto.randomUUID(),
        sessaoId: crypto.randomUUID(),
        outraSessaoId: crypto.randomUUID(),
    };
}

// ============================================================
// PREPARAÇÃO DOS DADOS DE TESTE
// ============================================================

async function prepararFixture(transaction: Knex.Transaction, f: Fixture): Promise<void> {
    // Organização fictícia
    await transaction('organizacoes').insert({
        id: f.organizacaoId,
        nome: 'Clínica — Autorização',
        ativo: true,
    });

    // Área clínica
    await transaction('areas_negocio').insert({
        id: f.areaId,
        organizacao_id: f.organizacaoId,
        codigo: `CLIN-${f.areaId.slice(0, 8)}`,
        nome: 'Fisioterapia',
        ativo: true,
    });

    // Usuários fictícios
    await transaction('usuarios').insert(
        [f.usuarioId, f.outroUsuarioId, f.recepcionistaId, f.administradorId].map((id) => ({
            id,
            nome: 'Usuário fictício',
            email: `autor-clin-${id}@teste.local`,
            senha_hash: 'hash-ficticio',
            ativo: true,
        })),
    );

    // Vínculos dos usuários com a organização
    await transaction('usuarios_organizacoes').insert([
        ...[f.usuarioId, f.outroUsuarioId, f.recepcionistaId].map((usuarioId) => ({
            usuario_id: usuarioId,
            organizacao_id: f.organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        })),
        {
            usuario_id: f.administradorId,
            organizacao_id: f.organizacaoId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
    ]);

    // Paciente fictício
    await transaction('clientes').insert({
        id: f.clienteId,
        organizacao_id: f.organizacaoId,
        nome: 'Paciente fictício',
        ativo: true,
    });

    // Dois profissionais da mesma clínica
    await transaction('profissionais').insert([
        {
            id: f.profissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.usuarioId,
            nome: 'Profissional titular',
            ativo: true,
        },
        {
            id: f.outroProfissionalId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.outroUsuarioId,
            nome: 'Outro profissional',
            ativo: true,
        },
    ]);

    // Os dois profissionais possuem autorização clínica,
    // mas cada um deve acessar somente suas próprias sessões.
    await transaction('profissionais_areas').insert([
        {
            profissional_id: f.profissionalId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
        {
            profissional_id: f.outroProfissionalId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        },
    ]);

    // Duas sessões do mesmo paciente,
    // realizadas por profissionais diferentes.
    await transaction('sessoes_clinicas').insert([
        {
            id: f.sessaoId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaId,
            cliente_id: f.clienteId,
            profissional_id: f.profissionalId,
            data_sessao: new Date('2026-10-01T14:00:00Z'),
            evolucao: 'Registro clínico fictício do titular.',
        },
        {
            id: f.outraSessaoId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaId,
            cliente_id: f.clienteId,
            profissional_id: f.outroProfissionalId,
            data_sessao: new Date('2026-10-01T15:00:00Z'),
            evolucao: 'Registro clínico fictício de outro profissional.',
        },
    ]);
}

// ============================================================
// ISOLAMENTO DOS TESTES
// ============================================================

// Todos os dados são inseridos em uma transação.
// Ao final do teste, executamos um rollback intencional,
// sem deixar dados fictícios persistidos no PostgreSQL.

async function comFixture(
    executar: (tx: Knex.Transaction, f: Fixture) => Promise<void>,
): Promise<void> {
    const f = novosIds();

    const rollbackIntencional = new Error('ROLLBACK_INTENCIONAL_AUTORIZACAO_CLINICA');

    try {
        await connection.transaction(async (tx) => {
            await prepararFixture(tx, f);

            await executar(tx, f);

            throw rollbackIntencional;
        });
    } catch (error) {
        if (error !== rollbackIntencional) {
            throw error;
        }
    }
}

// ============================================================
// FUNÇÃO AUXILIAR PARA VERIFICAR ERROS
// ============================================================

function verificarErro(codigo: string, statusCode: number) {
    return (error: unknown): boolean =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === codigo &&
        'statusCode' in error &&
        error.statusCode === statusCode;
}

// ============================================================
// ENCERRAMENTO DA CONEXÃO
// ============================================================

after(async () => {
    await connection.destroy();
});

// ============================================================
// TESTE 1 — PROFISSIONAL AUTORIZADO
// ============================================================

test('identifica profissional com vínculo e permissão clínica explícita', async () => {
    await comFixture(async (tx, f) => {
        const identidade = await autorizacaoClinicaService.identificarProfissional(
            f.usuarioId,
            f.organizacaoId,
            f.areaId,
            tx,
        );

        assert.equal(identidade.profissionalId, f.profissionalId);
    });
});

// ============================================================
// TESTE 2 — PERMISSÃO CLÍNICA DESATIVADA
// ============================================================

test('nega acesso quando a permissão clínica está desligada', async () => {
    await comFixture(async (tx, f) => {
        await tx('profissionais_areas')
            .where({
                profissional_id: f.profissionalId,
                area_negocio_id: f.areaId,
            })
            .update({
                acesso_clinico_autorizado: false,
            });

        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                f.organizacaoId,
                f.areaId,
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );
    });
});

// ============================================================
// TESTE 3 — RECEPCIONISTA E ADMINISTRADOR
// ============================================================

test('nega acesso a recepcionista e administrador sem vínculo profissional', async () => {
    await comFixture(async (tx, f) => {
        for (const usuarioId of [f.recepcionistaId, f.administradorId]) {
            await assert.rejects(
                autorizacaoClinicaService.identificarProfissional(
                    usuarioId,
                    f.organizacaoId,
                    f.areaId,
                    tx,
                ),
                verificarErro('ACESSO_CLINICO_NEGADO', 403),
            );
        }
    });
});

// ============================================================
// TESTE 4 — ISOLAMENTO ENTRE ORGANIZAÇÕES E ÁREAS
// ============================================================

test('nega acesso em outra organização ou área', async () => {
    await comFixture(async (tx, f) => {
        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                crypto.randomUUID(),
                f.areaId,
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );

        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                f.organizacaoId,
                crypto.randomUUID(),
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );
    });
});

// ============================================================
// TESTE 5 — PROFISSIONAL OU VÍNCULO INATIVO
// ============================================================

test('nega acesso quando profissional está inativo ou vínculo está inativo', async () => {
    await comFixture(async (tx, f) => {
        // Desativa o profissional.
        await tx('profissionais').where('id', f.profissionalId).update({ ativo: false });

        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                f.organizacaoId,
                f.areaId,
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );

        // Reativa o profissional.
        await tx('profissionais').where('id', f.profissionalId).update({ ativo: true });

        // Desativa somente o vínculo com a área.
        await tx('profissionais_areas')
            .where({
                profissional_id: f.profissionalId,
                area_negocio_id: f.areaId,
            })
            .update({ ativo: false });

        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                f.organizacaoId,
                f.areaId,
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );
    });
});

// ============================================================
// TESTE 6 — TITULARIDADE DA SESSÃO
// ============================================================

test('permite a própria sessão e oculta a sessão de outro profissional', async () => {
    await comFixture(async (tx, f) => {
        const identidade = await autorizacaoClinicaService.exigirTitularidadeSessao(
            f.usuarioId,
            f.organizacaoId,
            f.areaId,
            f.sessaoId,
            tx,
        );

        assert.equal(identidade.profissionalId, f.profissionalId);

        await assert.rejects(
            autorizacaoClinicaService.exigirTitularidadeSessao(
                f.usuarioId,
                f.organizacaoId,
                f.areaId,
                f.outraSessaoId,
                tx,
            ),
            verificarErro('SESSAO_CLINICA_NAO_ENCONTRADA', 404),
        );
    });
});

// ============================================================
// TESTE 7 — IDENTIDADE PROFISSIONAL AMBÍGUA
// ============================================================

test('nega identidades profissionais ambíguas na mesma área', async () => {
    await comFixture(async (tx, f) => {
        const profissionalDuplicadoId = crypto.randomUUID();

        await tx('profissionais').insert({
            id: profissionalDuplicadoId,
            organizacao_id: f.organizacaoId,
            usuario_id: f.usuarioId,
            nome: 'Outro cadastro do mesmo profissional',
            ativo: true,
        });

        await tx('profissionais_areas').insert({
            profissional_id: profissionalDuplicadoId,
            area_negocio_id: f.areaId,
            ativo: true,
            acesso_clinico_autorizado: true,
        });

        await assert.rejects(
            autorizacaoClinicaService.identificarProfissional(
                f.usuarioId,
                f.organizacaoId,
                f.areaId,
                tx,
            ),
            verificarErro('ACESSO_CLINICO_NEGADO', 403),
        );
    });
});

// ============================================================
// FILTROS UTILIZADOS PELOS TESTES SQL
// ============================================================

const filtrosSqlAutorizado = {
    inicio: new Date('2026-10-01T00:00:00Z'),
    fim: new Date('2026-10-02T00:00:00Z'),
};

// ============================================================
// TESTE 8 — SQL LISTA SOMENTE SESSÕES PRÓPRIAS
// ============================================================

test('SQL lista somente sessões do profissional autenticado', async () => {
    await comFixture(async (tx, f) => {
        const sessoes = await sessoesClinicasRepository.listarAutorizadas(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            filtrosSqlAutorizado,
            tx,
        );

        assert.deepEqual(
            sessoes.map((sessao) => sessao.id),
            [f.sessaoId],
        );

        // Tentativa de manipular o filtro para obter
        // sessões de outro profissional.
        const filtrosManipulados = await sessoesClinicasRepository.listarAutorizadas(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            {
                ...filtrosSqlAutorizado,
                profissionalId: f.outroProfissionalId,
            },
            tx,
        );

        assert.deepEqual(filtrosManipulados, []);
    });
});

// ============================================================
// TESTE 9 — SQL BLOQUEIA CONSULTA POR ID ALHEIO
// ============================================================

test('SQL não permite consultar sessão clínica de outro profissional', async () => {
    await comFixture(async (tx, f) => {
        // O titular consegue acessar sua própria sessão.
        const propria = await sessoesClinicasRepository.buscarPorIdAutorizada(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        assert.ok(propria);

        assert.equal(propria.id, f.sessaoId);

        assert.equal(propria.profissional_id, f.profissionalId);

        // O mesmo profissional não acessa
        // a sessão registrada por seu colega.
        const alheia = await sessoesClinicasRepository.buscarPorIdAutorizada(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.outraSessaoId,
            tx,
        );

        assert.equal(alheia, undefined);

        // O segundo profissional também não pode
        // consultar a sessão do primeiro.
        const outroUsuario = await sessoesClinicasRepository.buscarPorIdAutorizada(
            f.organizacaoId,
            f.areaId,
            f.outroUsuarioId,
            f.sessaoId,
            tx,
        );

        assert.equal(outroUsuario, undefined);
    });
});

// ============================================================
// TESTE 10 — SQL BLOQUEIA APÓS REVOGAÇÃO
// ============================================================

test('SQL bloqueia leitura após revogação da permissão clínica', async () => {
    await comFixture(async (tx, f) => {
        // Revoga a autorização do titular.
        await tx('profissionais_areas')
            .where({
                profissional_id: f.profissionalId,
                area_negocio_id: f.areaId,
            })
            .update({
                acesso_clinico_autorizado: false,
            });

        // A listagem deixa de retornar registros.
        const lista = await sessoesClinicasRepository.listarAutorizadas(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            filtrosSqlAutorizado,
            tx,
        );

        // A consulta por ID também é bloqueada.
        const detalhe = await sessoesClinicasRepository.buscarPorIdAutorizada(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        assert.deepEqual(lista, []);

        assert.equal(detalhe, undefined);
    });
});

// ============================================================
// TESTE 11 — SQL RESPEITA TENANT, ÁREA E VÍNCULOS
// ============================================================

test('SQL restringe organização, área e vínculos ativos', async () => {
    await comFixture(async (tx, f) => {
        // Não permite consultar em outra organização.
        const outraOrganizacao = await sessoesClinicasRepository.listarAutorizadas(
            crypto.randomUUID(),
            f.areaId,
            f.usuarioId,
            filtrosSqlAutorizado,
            tx,
        );

        // Não permite consultar em outra área.
        const outraArea = await sessoesClinicasRepository.listarAutorizadas(
            f.organizacaoId,
            crypto.randomUUID(),
            f.usuarioId,
            filtrosSqlAutorizado,
            tx,
        );

        assert.deepEqual(outraOrganizacao, []);

        assert.deepEqual(outraArea, []);

        // Desativa o vínculo do usuário
        // com a organização.
        await tx('usuarios_organizacoes')
            .where({
                usuario_id: f.usuarioId,
                organizacao_id: f.organizacaoId,
            })
            .update({ ativo: false });

        const semVinculo = await sessoesClinicasRepository.listarAutorizadas(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            filtrosSqlAutorizado,
            tx,
        );

        assert.deepEqual(semVinculo, []);

        // Reativa o vínculo do usuário.
        await tx('usuarios_organizacoes')
            .where({
                usuario_id: f.usuarioId,
                organizacao_id: f.organizacaoId,
            })
            .update({ ativo: true });

        // Desativa o profissional.
        await tx('profissionais').where('id', f.profissionalId).update({ ativo: false });

        const profissionalInativo = await sessoesClinicasRepository.buscarPorIdAutorizada(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        assert.equal(profissionalInativo, undefined);
    });
});

test('SQL retorna o histórico somente ao profissional titular', async () => {
    await comFixture(async (tx, f) => {
        await tx('historico_correcoes_sessoes_clinicas').insert([
            {
                sessao_clinica_id: f.sessaoId,
                corrigido_por_usuario_id: f.usuarioId,
                campos_alterados: ['evolucao'],
                dados_anteriores: JSON.stringify({
                    evolucao: 'Primeiro texto.',
                }),
                dados_novos: JSON.stringify({
                    evolucao: 'Segundo texto.',
                }),
                criado_em: new Date('2026-10-02T12:00:00Z'),
            },
            {
                sessao_clinica_id: f.sessaoId,
                corrigido_por_usuario_id: f.usuarioId,
                campos_alterados: ['evolucao'],
                dados_anteriores: JSON.stringify({
                    evolucao: 'Segundo texto.',
                }),
                dados_novos: JSON.stringify({
                    evolucao: 'Terceiro texto.',
                }),
                criado_em: new Date('2026-10-03T12:00:00Z'),
            },
        ]);

        const historico = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        assert.equal(historico.length, 2);

        assert.deepEqual(
            historico.map((item) => item.dados_anteriores.evolucao),
            ['Primeiro texto.', 'Segundo texto.'],
        );

        assert.deepEqual(
            historico.map((item) => item.dados_novos.evolucao),
            ['Segundo texto.', 'Terceiro texto.'],
        );
    });
});

test('SQL não expõe histórico de outro profissional', async () => {
    await comFixture(async (tx, f) => {
        await tx('historico_correcoes_sessoes_clinicas').insert({
            sessao_clinica_id: f.outraSessaoId,
            corrigido_por_usuario_id: f.outroUsuarioId,
            campos_alterados: ['evolucao'],
            dados_anteriores: JSON.stringify({
                evolucao: 'Informação original.',
            }),
            dados_novos: JSON.stringify({
                evolucao: 'Informação corrigida.',
            }),
        });

        const historico = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.outraSessaoId,
            tx,
        );

        assert.deepEqual(historico, []);
    });
});

test('SQL bloqueia histórico após revogação clínica', async () => {
    await comFixture(async (tx, f) => {
        await tx('historico_correcoes_sessoes_clinicas').insert({
            sessao_clinica_id: f.sessaoId,
            corrigido_por_usuario_id: f.usuarioId,
            campos_alterados: ['evolucao'],
            dados_anteriores: JSON.stringify({
                evolucao: 'Anterior.',
            }),
            dados_novos: JSON.stringify({
                evolucao: 'Novo.',
            }),
        });

        await tx('profissionais_areas')
            .where({
                profissional_id: f.profissionalId,
                area_negocio_id: f.areaId,
            })
            .update({ acesso_clinico_autorizado: false });

        const historico = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            f.organizacaoId,
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        assert.deepEqual(historico, []);
    });
});

test('SQL protege histórico contra outros tenants e áreas', async () => {
    await comFixture(async (tx, f) => {
        await tx('historico_correcoes_sessoes_clinicas').insert({
            sessao_clinica_id: f.sessaoId,
            corrigido_por_usuario_id: f.usuarioId,
            campos_alterados: ['evolucao'],
            dados_anteriores: JSON.stringify({
                evolucao: 'Anterior.',
            }),
            dados_novos: JSON.stringify({
                evolucao: 'Novo.',
            }),
        });

        const outraOrganizacao = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            crypto.randomUUID(),
            f.areaId,
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        const outraArea = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            f.organizacaoId,
            crypto.randomUUID(),
            f.usuarioId,
            f.sessaoId,
            tx,
        );

        const administrador = await sessoesClinicasRepository.listarHistoricoCorrecoesAutorizado(
            f.organizacaoId,
            f.areaId,
            f.administradorId,
            f.sessaoId,
            tx,
        );

        assert.deepEqual(outraOrganizacao, []);
        assert.deepEqual(outraArea, []);
        assert.deepEqual(administrador, []);
    });
});
