import crypto from 'node:crypto';

import argon2 from 'argon2';

import connection from '../../src/database/connection.js';

const prefixoOrganizacao = 'Fixture Bruno Permissoes Clinicas ';
const prefixoEmail = 'bruno-clinico-';

function exigirAmbienteDeTeste() {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('A fixture Bruno de permissões clínicas só pode usar NODE_ENV=test.');
    }
}

async function limpar() {
    exigirAmbienteDeTeste();

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
    });
}

async function preparar() {
    exigirAmbienteDeTeste();
    await limpar();

    const execucaoId = crypto.randomUUID();
    const fixture = {
        organizacaoId: crypto.randomUUID(),
        areaNegocioId: crypto.randomUUID(),
        administradorId: crypto.randomUUID(),
        operadorId: crypto.randomUUID(),
        profissionalId: crypto.randomUUID(),
        adminEmail: `${prefixoEmail}admin-${execucaoId}@teste.local`,
        adminSenha: `BrunoAdmin!${crypto.randomUUID()}Aa1`,
        operadorEmail: `${prefixoEmail}operador-${execucaoId}@teste.local`,
        operadorSenha: `BrunoOperador!${crypto.randomUUID()}Aa1`,
    };

    const [adminSenhaHash, operadorSenhaHash] = await Promise.all([
        argon2.hash(fixture.adminSenha),
        argon2.hash(fixture.operadorSenha),
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
                nome: 'Agenda',
                descricao: 'Módulo de agenda.',
                ativo: true,
            });
            moduloAgenda = { id: moduloAgendaId };
        }

        await transaction('organizacoes').insert({
            id: fixture.organizacaoId,
            nome: `${prefixoOrganizacao}${execucaoId}`,
            ativo: true,
        });
        await transaction('areas_negocio').insert({
            id: fixture.areaNegocioId,
            organizacao_id: fixture.organizacaoId,
            nome: 'Fisioterapia Bruno',
            codigo: `BC-${execucaoId.slice(0, 8)}`,
            ativo: true,
        });
        await transaction('usuarios').insert([
            {
                id: fixture.administradorId,
                nome: 'Administrador Bruno Clínico',
                email: fixture.adminEmail,
                senha_hash: adminSenhaHash,
                ativo: true,
            },
            {
                id: fixture.operadorId,
                nome: 'Operador Bruno Clínico',
                email: fixture.operadorEmail,
                senha_hash: operadorSenhaHash,
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
            {
                usuario_id: fixture.operadorId,
                organizacao_id: fixture.organizacaoId,
                perfil: 'OPERADOR',
                ativo: true,
            },
        ]);
        await transaction('profissionais').insert({
            id: fixture.profissionalId,
            organizacao_id: fixture.organizacaoId,
            usuario_id: fixture.operadorId,
            nome: 'Profissional Bruno Clínico',
            ativo: true,
        });
        await transaction('profissionais_areas').insert({
            profissional_id: fixture.profissionalId,
            area_negocio_id: fixture.areaNegocioId,
            ativo: true,
            acesso_clinico_autorizado: false,
        });
        await transaction('organizacoes_modulos').insert({
            organizacao_id: fixture.organizacaoId,
            modulo_id: moduloAgenda.id,
            habilitado: true,
        });
        await transaction('areas_modulos').insert({
            area_negocio_id: fixture.areaNegocioId,
            modulo_id: moduloAgenda.id,
            habilitado: true,
        });
    });

    process.stdout.write(`${JSON.stringify(fixture)}\n`);
}

const comando = process.argv[2];

try {
    if (comando === 'setup') {
        await preparar();
    } else if (comando === 'cleanup') {
        await limpar();
    } else {
        throw new Error('Use setup ou cleanup.');
    }
} finally {
    await connection.destroy();
}
