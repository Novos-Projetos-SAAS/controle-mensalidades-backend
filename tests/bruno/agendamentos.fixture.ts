import argon2 from 'argon2';

import connection from '../../src/database/connection.js';

export const fixtureBrunoAgendamentos = {
    organizacaoId: '00000000-0000-4000-8000-0000000000a1',
    organizacaoAlternativaId: '00000000-0000-4000-8000-0000000000b1',
    areaId: '00000000-0000-4000-8000-0000000000a2',
    usuarioId: '00000000-0000-4000-8000-0000000000a3',
    clienteId: '00000000-0000-4000-8000-0000000000a4',
    profissionalId: '00000000-0000-4000-8000-0000000000a5',
    servicoId: '00000000-0000-4000-8000-0000000000a6',
    email: 'bruno-agendamentos@teste.local',
    senha: 'SenhaTeste123!',
} as const;

async function limpar() {
    const fixture = fixtureBrunoAgendamentos;

    await connection('registros_auditoria').where('organizacao_id', fixture.organizacaoId).del();
    await connection('agendamentos').where('organizacao_id', fixture.organizacaoId).del();
    await connection('clientes_areas').where('cliente_id', fixture.clienteId).del();
    await connection('profissionais_areas').where('profissional_id', fixture.profissionalId).del();
    await connection('servicos').where('id', fixture.servicoId).del();
    await connection('clientes').where('id', fixture.clienteId).del();
    await connection('profissionais').where('id', fixture.profissionalId).del();
    await connection('areas_modulos').where('area_negocio_id', fixture.areaId).del();
    await connection('organizacoes_modulos').where('organizacao_id', fixture.organizacaoId).del();
    await connection('usuarios_organizacoes').where('usuario_id', fixture.usuarioId).del();
    await connection('areas_negocio').where('id', fixture.areaId).del();
    await connection('usuarios')
        .where('id', fixture.usuarioId)
        .orWhere('email', fixture.email)
        .del();
    await connection('organizacoes').where('id', fixture.organizacaoId).del();
}

async function preparar() {
    const fixture = fixtureBrunoAgendamentos;
    await limpar();

    let moduloAgenda = await connection('modulos')
        .select('id')
        .where({ codigo: 'AGENDA', ativo: true })
        .whereNull('deletado_em')
        .first();

    if (!moduloAgenda) {
        const [criado] = await connection('modulos')
            .insert({
                codigo: 'AGENDA',
                nome: 'Agenda',
                descricao: 'Módulo de agenda.',
                ativo: true,
            })
            .returning('id');
        moduloAgenda = criado;
    }

    await connection('organizacoes').insert({
        id: fixture.organizacaoId,
        nome: 'Organização Bruno Agendamentos',
        ativo: true,
    });
    await connection('areas_negocio').insert({
        id: fixture.areaId,
        organizacao_id: fixture.organizacaoId,
        nome: 'Área Bruno Agendamentos',
        codigo: 'BRUNO-AGENDA',
        ativo: true,
    });
    await connection('usuarios').insert({
        id: fixture.usuarioId,
        nome: 'Usuário Bruno Agendamentos',
        email: fixture.email,
        senha_hash: await argon2.hash(fixture.senha),
        ativo: true,
    });
    await connection('usuarios_organizacoes').insert({
        usuario_id: fixture.usuarioId,
        organizacao_id: fixture.organizacaoId,
        perfil: 'ADMINISTRADOR',
        ativo: true,
    });
    await connection('organizacoes_modulos').insert({
        organizacao_id: fixture.organizacaoId,
        modulo_id: moduloAgenda.id,
        habilitado: true,
    });
    await connection('areas_modulos').insert({
        area_negocio_id: fixture.areaId,
        modulo_id: moduloAgenda.id,
        habilitado: true,
    });
    await connection('clientes').insert({
        id: fixture.clienteId,
        organizacao_id: fixture.organizacaoId,
        nome: 'Cliente Bruno',
        ativo: true,
    });
    await connection('clientes_areas').insert({
        cliente_id: fixture.clienteId,
        area_negocio_id: fixture.areaId,
        ativo: true,
    });
    await connection('profissionais').insert({
        id: fixture.profissionalId,
        organizacao_id: fixture.organizacaoId,
        nome: 'Profissional Bruno',
        ativo: true,
    });
    await connection('profissionais_areas').insert({
        profissional_id: fixture.profissionalId,
        area_negocio_id: fixture.areaId,
        ativo: true,
    });
    await connection('servicos').insert({
        id: fixture.servicoId,
        organizacao_id: fixture.organizacaoId,
        area_negocio_id: fixture.areaId,
        nome: 'Serviço Bruno',
        duracao_minutos: 60,
        ativo: true,
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
