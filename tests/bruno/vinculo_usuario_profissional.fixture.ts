import crypto from 'node:crypto';

import argon2 from 'argon2';

import connection from '../../src/database/connection.js';

const prefixoOrganizacao = 'Fixture Bruno Vinculo Usuario Profissional ';
const prefixoEmail = 'bruno-vinculo-';
const nomeModuloFixture = 'Agenda Fixture Bruno Vinculo Usuario Profissional';

function exigirBancoDeTeste() {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('A fixture exige NODE_ENV=test e AMBIENTE_BANCO=teste.');
    }
}

async function limpar() {
    exigirBancoDeTeste();

    await connection.transaction(async (transaction) => {
        const organizacoes = await transaction('organizacoes')
            .select('id')
            .where('nome', 'like', `${prefixoOrganizacao}%`);
        const usuarios = await transaction('usuarios')
            .select('id')
            .where('email', 'like', `${prefixoEmail}%@teste.local`);

        const organizacoesIds = organizacoes.map((organizacao) => organizacao.id as string);
        const usuariosIds = usuarios.map((usuario) => usuario.id as string);
        const areas = organizacoesIds.length
            ? await transaction('areas_negocio')
                  .select('id')
                  .whereIn('organizacao_id', organizacoesIds)
            : [];
        const profissionais = organizacoesIds.length
            ? await transaction('profissionais')
                  .select('id')
                  .whereIn('organizacao_id', organizacoesIds)
            : [];

        const areasIds = areas.map((area) => area.id as string);
        const profissionaisIds = profissionais.map((profissional) => profissional.id as string);

        if (organizacoesIds.length > 0 || usuariosIds.length > 0) {
            const auditorias = transaction('registros_auditoria');

            if (organizacoesIds.length > 0) {
                auditorias.whereIn('organizacao_id', organizacoesIds);
            }

            if (usuariosIds.length > 0) {
                if (organizacoesIds.length > 0) {
                    auditorias.orWhereIn('usuario_id', usuariosIds);
                } else {
                    auditorias.whereIn('usuario_id', usuariosIds);
                }
            }

            await auditorias.del();
        }

        if (profissionaisIds.length > 0) {
            await transaction('profissionais_areas')
                .whereIn('profissional_id', profissionaisIds)
                .del();
            await transaction('profissionais').whereIn('id', profissionaisIds).del();
        }

        if (areasIds.length > 0) {
            await transaction('areas_modulos').whereIn('area_negocio_id', areasIds).del();
        }

        if (organizacoesIds.length > 0) {
            await transaction('organizacoes_modulos')
                .whereIn('organizacao_id', organizacoesIds)
                .del();
        }

        if (usuariosIds.length > 0) {
            await transaction('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
            await transaction('usuarios').whereIn('id', usuariosIds).del();
        }

        if (areasIds.length > 0) {
            await transaction('areas_negocio').whereIn('id', areasIds).del();
        }

        if (organizacoesIds.length > 0) {
            await transaction('organizacoes').whereIn('id', organizacoesIds).del();
        }

        const moduloFixture = await transaction('modulos')
            .select('id')
            .where({ codigo: 'AGENDA', nome: nomeModuloFixture })
            .first();

        if (moduloFixture) {
            const [vinculoOrganizacao, vinculoArea] = await Promise.all([
                transaction('organizacoes_modulos')
                    .select('organizacao_id')
                    .where('modulo_id', moduloFixture.id)
                    .first(),
                transaction('areas_modulos')
                    .select('area_negocio_id')
                    .where('modulo_id', moduloFixture.id)
                    .first(),
            ]);

            if (!vinculoOrganizacao && !vinculoArea) {
                await transaction('modulos').where('id', moduloFixture.id).del();
            }
        }
    });
}

async function preparar() {
    exigirBancoDeTeste();
    await limpar();

    const execucaoId = crypto.randomUUID();
    const fixture = {
        organizacaoId: crypto.randomUUID(),
        organizacaoOutraId: crypto.randomUUID(),
        areaNegocioId: crypto.randomUUID(),
        areaSemAgendaId: crypto.randomUUID(),
        areaOutraOrganizacaoId: crypto.randomUUID(),
        administradorId: crypto.randomUUID(),
        operadorId: crypto.randomUUID(),
        usuarioDisponivelId: crypto.randomUUID(),
        usuarioJaAssociadoId: crypto.randomUUID(),
        usuarioOutraOrganizacaoId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        outroProfissionalId: crypto.randomUUID(),
        profissionalOutraOrganizacaoId: crypto.randomUUID(),
        adminEmail: `${prefixoEmail}admin-${execucaoId}@teste.local`,
        adminSenha: `BrunoAdmin!${crypto.randomUUID()}Aa1`,
        operadorEmail: `${prefixoEmail}operador-${execucaoId}@teste.local`,
        operadorSenha: `BrunoOperador!${crypto.randomUUID()}Aa1`,
    };

    const [adminSenhaHash, operadorSenhaHash, senhaFicticiaHash] = await Promise.all([
        argon2.hash(fixture.adminSenha),
        argon2.hash(fixture.operadorSenha),
        argon2.hash(`BrunoFixture!${crypto.randomUUID()}Aa1`),
    ]);

    await connection.transaction(async (transaction) => {
        let moduloAgenda = await transaction('modulos')
            .select('id')
            .where({ codigo: 'AGENDA', ativo: true })
            .whereNull('deletado_em')
            .first();

        if (!moduloAgenda) {
            const moduloAgendaId = crypto.randomUUID();
            await transaction('modulos').insert({
                id: moduloAgendaId,
                codigo: 'AGENDA',
                nome: nomeModuloFixture,
                descricao: 'Modulo AGENDA criado exclusivamente pela fixture Bruno.',
                ativo: true,
            });
            moduloAgenda = { id: moduloAgendaId };
        }

        await transaction('organizacoes').insert([
            {
                id: fixture.organizacaoId,
                nome: `${prefixoOrganizacao}A ${execucaoId}`,
                ativo: true,
            },
            {
                id: fixture.organizacaoOutraId,
                nome: `${prefixoOrganizacao}B ${execucaoId}`,
                ativo: true,
            },
        ]);

        await transaction('areas_negocio').insert([
            {
                id: fixture.areaNegocioId,
                organizacao_id: fixture.organizacaoId,
                nome: 'Area Bruno com AGENDA',
                codigo: `VB-A-${execucaoId.slice(0, 8)}`,
                ativo: true,
            },
            {
                id: fixture.areaSemAgendaId,
                organizacao_id: fixture.organizacaoId,
                nome: 'Area Bruno sem AGENDA',
                codigo: `VB-S-${execucaoId.slice(0, 8)}`,
                ativo: true,
            },
            {
                id: fixture.areaOutraOrganizacaoId,
                organizacao_id: fixture.organizacaoOutraId,
                nome: 'Area Bruno outra organizacao',
                codigo: `VB-B-${execucaoId.slice(0, 8)}`,
                ativo: true,
            },
        ]);

        await transaction('usuarios').insert([
            {
                id: fixture.administradorId,
                nome: 'Administrador Bruno Vinculo',
                email: fixture.adminEmail,
                senha_hash: adminSenhaHash,
                ativo: true,
            },
            {
                id: fixture.operadorId,
                nome: 'Operador Bruno Vinculo',
                email: fixture.operadorEmail,
                senha_hash: operadorSenhaHash,
                ativo: true,
            },
            {
                id: fixture.usuarioDisponivelId,
                nome: 'Usuario disponivel Bruno Vinculo',
                email: `${prefixoEmail}disponivel-${execucaoId}@teste.local`,
                senha_hash: senhaFicticiaHash,
                ativo: true,
            },
            {
                id: fixture.usuarioJaAssociadoId,
                nome: 'Usuario associado Bruno Vinculo',
                email: `${prefixoEmail}associado-${execucaoId}@teste.local`,
                senha_hash: senhaFicticiaHash,
                ativo: true,
            },
            {
                id: fixture.usuarioOutraOrganizacaoId,
                nome: 'Usuario outra organizacao Bruno Vinculo',
                email: `${prefixoEmail}outra-org-${execucaoId}@teste.local`,
                senha_hash: senhaFicticiaHash,
                ativo: true,
            },
        ]);

        await transaction('usuarios_organizacoes').insert([
            {
                usuario_id: fixture.administradorId,
                organizacao_id: fixture.organizacaoId,
                perfil: 'ADMINISTRADOR',
                ativo: true,
            },
            ...[fixture.operadorId, fixture.usuarioDisponivelId, fixture.usuarioJaAssociadoId].map(
                (usuarioId) => ({
                    usuario_id: usuarioId,
                    organizacao_id: fixture.organizacaoId,
                    perfil: 'OPERADOR',
                    ativo: true,
                }),
            ),
            {
                usuario_id: fixture.usuarioOutraOrganizacaoId,
                organizacao_id: fixture.organizacaoOutraId,
                perfil: 'OPERADOR',
                ativo: true,
            },
        ]);

        await transaction('profissionais').insert([
            {
                id: fixture.profissionalId,
                organizacao_id: fixture.organizacaoId,
                usuario_id: null,
                nome: 'Profissional livre Bruno Vinculo',
                ativo: true,
            },
            {
                id: fixture.outroProfissionalId,
                organizacao_id: fixture.organizacaoId,
                usuario_id: fixture.usuarioJaAssociadoId,
                nome: 'Profissional associado Bruno Vinculo',
                ativo: true,
            },
            {
                id: fixture.profissionalOutraOrganizacaoId,
                organizacao_id: fixture.organizacaoOutraId,
                usuario_id: fixture.usuarioOutraOrganizacaoId,
                nome: 'Profissional outra organizacao Bruno Vinculo',
                ativo: true,
            },
        ]);

        await transaction('profissionais_areas').insert([
            {
                profissional_id: fixture.profissionalId,
                area_negocio_id: fixture.areaNegocioId,
                ativo: true,
                acesso_clinico_autorizado: true,
            },
            {
                profissional_id: fixture.outroProfissionalId,
                area_negocio_id: fixture.areaNegocioId,
                ativo: true,
                acesso_clinico_autorizado: true,
            },
            {
                profissional_id: fixture.profissionalOutraOrganizacaoId,
                area_negocio_id: fixture.areaOutraOrganizacaoId,
                ativo: true,
                acesso_clinico_autorizado: true,
            },
        ]);

        await transaction('organizacoes_modulos').insert([
            {
                organizacao_id: fixture.organizacaoId,
                modulo_id: moduloAgenda.id,
                habilitado: true,
            },
            {
                organizacao_id: fixture.organizacaoOutraId,
                modulo_id: moduloAgenda.id,
                habilitado: true,
            },
        ]);

        await transaction('areas_modulos').insert([
            {
                area_negocio_id: fixture.areaNegocioId,
                modulo_id: moduloAgenda.id,
                habilitado: true,
            },
            {
                area_negocio_id: fixture.areaSemAgendaId,
                modulo_id: moduloAgenda.id,
                habilitado: false,
            },
            {
                area_negocio_id: fixture.areaOutraOrganizacaoId,
                modulo_id: moduloAgenda.id,
                habilitado: true,
            },
        ]);
    });

    process.stdout.write(`${JSON.stringify(fixture)}\n`);
}

async function verificar() {
    exigirBancoDeTeste();

    const organizacao = await connection('organizacoes')
        .select('id')
        .where('nome', 'like', `${prefixoOrganizacao}A %`)
        .first();

    if (!organizacao) {
        throw new Error('A fixture de vinculo nao foi encontrada para verificacao.');
    }

    const profissional = await connection('profissionais')
        .select('id', 'usuario_id')
        .where({
            organizacao_id: organizacao.id,
            nome: 'Profissional livre Bruno Vinculo',
        })
        .first();

    if (!profissional || profissional.usuario_id !== null) {
        throw new Error('O profissional ficticio permaneceu vinculado apos a suite.');
    }

    const permissao = await connection('profissionais_areas')
        .select('acesso_clinico_autorizado')
        .where('profissional_id', profissional.id)
        .first();

    if (!permissao || permissao.acesso_clinico_autorizado !== false) {
        throw new Error('A autorizacao clinica antiga nao permaneceu revogada.');
    }

    const auditorias = await connection('registros_auditoria')
        .select('acao', 'dados_contexto')
        .where({
            organizacao_id: organizacao.id,
            recurso: 'PROFISSIONAL',
            recurso_id: profissional.id,
        })
        .whereIn('acao', ['PROFISSIONAL.USUARIO_VINCULADO', 'PROFISSIONAL.USUARIO_DESVINCULADO']);

    if (auditorias.length !== 2) {
        throw new Error('A suite nao produziu exatamente as auditorias de vinculo e desvinculo.');
    }

    if (
        auditorias.some(
            (auditoria) => auditoria.dados_contexto?.autorizacoesClinicasRevogadas !== true,
        )
    ) {
        throw new Error('A auditoria nao confirmou a revogacao das autorizacoes clinicas.');
    }

    process.stdout.write(
        `${JSON.stringify({ vinculoRemovido: true, acessoClinicoRevogado: true })}\n`,
    );
}

const comando = process.argv[2];

try {
    if (comando === 'setup') {
        await preparar();
    } else if (comando === 'verify') {
        await verificar();
    } else if (comando === 'cleanup') {
        await limpar();
    } else {
        throw new Error('Use setup, verify ou cleanup.');
    }
} finally {
    await connection.destroy();
}
