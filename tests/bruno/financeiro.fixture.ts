import crypto from 'node:crypto';

import argon2 from 'argon2';

import connection from '../../src/database/connection.js';

function exigirBancoDeTeste() {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('A fixture financeira exige NODE_ENV=test e AMBIENTE_BANCO=teste.');
    }
}

function obterRunId() {
    exigirBancoDeTeste();
    const runId = process.env.FINANCEIRO_BRUNO_RUN_ID;
    if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) {
        throw new Error('Informe FINANCEIRO_BRUNO_RUN_ID como UUID para isolar a fixture.');
    }
    return runId;
}

async function limpar() {
    const runId = obterRunId();
    const prefixoOrganizacao = `Fixture Bruno Financeiro ${runId}`;
    const prefixoEmail = `bruno-financeiro-${runId}-`;
    const organizacoes = await connection('organizacoes')
        .select('id')
        .where('nome', 'like', `${prefixoOrganizacao}%`);
    const organizacoesIds = organizacoes.map((item) => item.id as string);
    const usuarios = await connection('usuarios')
        .select('id')
        .where('email', 'like', `${prefixoEmail}%@teste.local`);
    const usuariosIds = usuarios.map((item) => item.id as string);
    const areas = organizacoesIds.length
        ? await connection('areas_negocio').select('id').whereIn('organizacao_id', organizacoesIds)
        : [];
    const areasIds = areas.map((item) => item.id as string);

    if (organizacoesIds.length) {
        const mensalidades = await connection('mensalidades')
            .select('id')
            .whereIn('organizacao_id', organizacoesIds);
        const mensalidadesIds = mensalidades.map((item) => item.id as string);
        if (mensalidadesIds.length) {
            await connection('historico_mensalidades')
                .whereIn('mensalidade_id', mensalidadesIds)
                .del();
        }
        await connection('registros_auditoria').whereIn('organizacao_id', organizacoesIds).del();
        await connection('pagamentos').whereIn('organizacao_id', organizacoesIds).del();
        await connection('mensalidades').whereIn('organizacao_id', organizacoesIds).del();
        await connection('contas_receber').whereIn('organizacao_id', organizacoesIds).del();
        await connection('assinaturas').whereIn('organizacao_id', organizacoesIds).del();
        await connection('planos_comerciais').whereIn('organizacao_id', organizacoesIds).del();
    }
    if (usuariosIds.length) {
        await connection('registros_auditoria').whereIn('usuario_id', usuariosIds).del();
        await connection('usuarios_organizacoes').whereIn('usuario_id', usuariosIds).del();
    }
    if (areasIds.length)
        await connection('clientes_areas').whereIn('area_negocio_id', areasIds).del();
    if (organizacoesIds.length)
        await connection('clientes').whereIn('organizacao_id', organizacoesIds).del();
    if (areasIds.length) await connection('areas_negocio').whereIn('id', areasIds).del();
    if (usuariosIds.length) await connection('usuarios').whereIn('id', usuariosIds).del();
    if (organizacoesIds.length)
        await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

async function preparar() {
    const runId = obterRunId();
    await limpar();

    const f = {
        organizacaoId: crypto.randomUUID(),
        organizacaoAlternativaId: crypto.randomUUID(),
        areaId: crypto.randomUUID(),
        areaAlternativaId: crypto.randomUUID(),
        areaOutraOrganizacaoId: crypto.randomUUID(),
        administradorId: crypto.randomUUID(),
        operadorId: crypto.randomUUID(),
        clienteId: crypto.randomUUID(),
        clienteOutraAreaId: crypto.randomUUID(),
        planoId: crypto.randomUUID(),
        planoGlobalId: crypto.randomUUID(),
        planoOutraAreaId: crypto.randomUUID(),
        planoOutraOrganizacaoId: crypto.randomUUID(),
        adminEmail: `bruno-financeiro-${runId}-admin@teste.local`,
        operadorEmail: `bruno-financeiro-${runId}-operador@teste.local`,
        adminSenha: `Financeiro-${crypto.randomBytes(12).toString('hex')}!`,
        operadorSenha: `Financeiro-${crypto.randomBytes(12).toString('hex')}!`,
    };

    await connection('organizacoes').insert([
        {
            id: f.organizacaoId,
            nome: `Fixture Bruno Financeiro ${runId} - A`,
            ativo: true,
        },
        {
            id: f.organizacaoAlternativaId,
            nome: `Fixture Bruno Financeiro ${runId} - B`,
            ativo: true,
        },
    ]);
    await connection('areas_negocio').insert([
        {
            id: f.areaId,
            organizacao_id: f.organizacaoId,
            codigo: `FBR-A-${runId.slice(0, 8)}`,
            nome: 'Financeiro Bruno A',
            ativo: true,
        },
        {
            id: f.areaAlternativaId,
            organizacao_id: f.organizacaoId,
            codigo: `FBR-A2-${runId.slice(0, 8)}`,
            nome: 'Financeiro Bruno A2',
            ativo: true,
        },
        {
            id: f.areaOutraOrganizacaoId,
            organizacao_id: f.organizacaoAlternativaId,
            codigo: `FBR-B-${runId.slice(0, 8)}`,
            nome: 'Financeiro Bruno B',
            ativo: true,
        },
    ]);
    await connection('usuarios').insert([
        {
            id: f.administradorId,
            nome: 'Administrador Bruno Financeiro',
            email: f.adminEmail,
            senha_hash: await argon2.hash(f.adminSenha),
            ativo: true,
        },
        {
            id: f.operadorId,
            nome: 'Operador Bruno Financeiro',
            email: f.operadorEmail,
            senha_hash: await argon2.hash(f.operadorSenha),
            ativo: true,
        },
    ]);
    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: f.administradorId,
            organizacao_id: f.organizacaoId,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: f.operadorId,
            organizacao_id: f.organizacaoId,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);
    await connection('clientes').insert([
        {
            id: f.clienteId,
            organizacao_id: f.organizacaoId,
            nome: 'Cliente Bruno Financeiro',
            ativo: true,
        },
        {
            id: f.clienteOutraAreaId,
            organizacao_id: f.organizacaoId,
            nome: 'Cliente Bruno Financeiro Outra Área',
            ativo: true,
        },
    ]);
    await connection('clientes_areas').insert([
        { cliente_id: f.clienteId, area_negocio_id: f.areaId, ativo: true },
        { cliente_id: f.clienteOutraAreaId, area_negocio_id: f.areaAlternativaId, ativo: true },
    ]);
    await connection('planos_comerciais').insert([
        {
            id: f.planoId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaId,
            nome: 'Plano Bruno Financeiro A',
            valor_base: '100.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoGlobalId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: null,
            nome: 'Plano Bruno Financeiro Global',
            valor_base: '80.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoOutraAreaId,
            organizacao_id: f.organizacaoId,
            area_negocio_id: f.areaAlternativaId,
            nome: 'Plano Bruno Financeiro Outra Área',
            valor_base: '70.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoOutraOrganizacaoId,
            organizacao_id: f.organizacaoAlternativaId,
            area_negocio_id: f.areaOutraOrganizacaoId,
            nome: 'Plano Bruno Financeiro Outra Organização',
            valor_base: '60.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
    ]);

    process.stdout.write(
        `${JSON.stringify({
            organizacaoId: f.organizacaoId,
            organizacaoAlternativaId: f.organizacaoAlternativaId,
            areaId: f.areaId,
            areaAlternativaId: f.areaAlternativaId,
            areaOutraOrganizacaoId: f.areaOutraOrganizacaoId,
            adminEmail: f.adminEmail,
            adminSenha: f.adminSenha,
            operadorEmail: f.operadorEmail,
            operadorSenha: f.operadorSenha,
            clienteId: f.clienteId,
            clienteOutraAreaId: f.clienteOutraAreaId,
            planoId: f.planoId,
            planoGlobalId: f.planoGlobalId,
            planoOutraAreaId: f.planoOutraAreaId,
        })}\n`,
    );
}

async function verificar() {
    const runId = obterRunId();
    const org = await connection('organizacoes')
        .select('id')
        .where('nome', `Fixture Bruno Financeiro ${runId} - A`)
        .first();
    if (!org) throw new Error('Organização da fixture Bruno financeira não encontrada.');

    const assinatura = await connection('assinaturas')
        .select('id')
        .where('organizacao_id', org.id)
        .first();
    if (!assinatura) throw new Error('O Bruno não criou a assinatura financeira.');

    const mensalidade = await connection('mensalidades')
        .select('id', 'conta_receber_id')
        .where('organizacao_id', org.id)
        .where('assinatura_id', assinatura.id)
        .first();
    if (!mensalidade) throw new Error('O Bruno não gerou a mensalidade financeira.');

    const estado = await connection('contas_receber')
        .select('status', 'valor_final')
        .where({
            id: mensalidade.conta_receber_id,
            organizacao_id: org.id,
        })
        .first();
    const pagamentos = await connection('pagamentos')
        .where({
            organizacao_id: org.id,
            conta_receber_id: mensalidade.conta_receber_id,
        })
        .count({ total: '*' })
        .sum({ valor_total: 'valor' })
        .first();
    if (estado?.status !== 'PAGO' || Number(pagamentos?.total) !== 2) {
        throw new Error('A verificação Bruno esperava dois pagamentos e a conta quitada.');
    }
    if (String(pagamentos?.valor_total) !== String(estado.valor_final)) {
        throw new Error('O total recebido não corresponde ao valor final da mensalidade.');
    }

    process.stdout.write('Fixture Bruno financeira verificada: dois recebimentos e conta paga.\n');
}

const comando = process.argv[2];

try {
    if (comando === 'setup') await preparar();
    else if (comando === 'verify') await verificar();
    else if (comando === 'cleanup') await limpar();
    else throw new Error('Use setup, verify ou cleanup.');
} finally {
    await connection.destroy();
}
