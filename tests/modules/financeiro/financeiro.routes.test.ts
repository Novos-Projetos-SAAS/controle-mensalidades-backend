import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const f = {
    organizacaoA: crypto.randomUUID(),
    organizacaoB: crypto.randomUUID(),
    areaA: crypto.randomUUID(),
    areaA2: crypto.randomUUID(),
    areaB: crypto.randomUUID(),
    adminA: crypto.randomUUID(),
    adminB: crypto.randomUUID(),
    operadorA: crypto.randomUUID(),
    clienteA: crypto.randomUUID(),
    clienteA2: crypto.randomUUID(),
    clienteB: crypto.randomUUID(),
    planoA: crypto.randomUUID(),
    planoGlobalA: crypto.randomUUID(),
    planoA2: crypto.randomUUID(),
    planoB: crypto.randomUUID(),
};

const base = '/api/v1/financeiro';
const dinheiro = '100.00';

function cabecalhos(usuarioId = f.adminA, organizacaoId = f.organizacaoA, areaId = f.areaA) {
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET de teste não definida.');
    const token = jwt.sign({}, env.JWT_SECRET, { subject: usuarioId, expiresIn: '1h' });
    return {
        Cookie: `token=${token}`,
        'x-organizacao-id': organizacaoId,
        'x-area-negocio-id': areaId,
    };
}

async function limpar() {
    const organizacoesIds = [f.organizacaoA, f.organizacaoB];
    const mensalidades = await connection('mensalidades')
        .select('id')
        .whereIn('organizacao_id', organizacoesIds);
    const mensalidadesIds = mensalidades.map((item) => item.id as string);

    if (mensalidadesIds.length) {
        await connection('historico_mensalidades').whereIn('mensalidade_id', mensalidadesIds).del();
    }
    await connection('registros_auditoria').whereIn('organizacao_id', organizacoesIds).del();
    await connection('pagamentos').whereIn('organizacao_id', organizacoesIds).del();
    await connection('mensalidades').whereIn('organizacao_id', organizacoesIds).del();
    await connection('contas_receber').whereIn('organizacao_id', organizacoesIds).del();
    await connection('assinaturas').whereIn('organizacao_id', organizacoesIds).del();
    await connection('planos_comerciais').whereIn('organizacao_id', organizacoesIds).del();
    await connection('clientes_areas')
        .whereIn('cliente_id', [f.clienteA, f.clienteA2, f.clienteB])
        .del();
    await connection('clientes').whereIn('id', [f.clienteA, f.clienteA2, f.clienteB]).del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [f.adminA, f.adminB, f.operadorA])
        .del();
    await connection('areas_negocio').whereIn('id', [f.areaA, f.areaA2, f.areaB]).del();
    await connection('usuarios').whereIn('id', [f.adminA, f.adminB, f.operadorA]).del();
    await connection('organizacoes').whereIn('id', organizacoesIds).del();
}

async function criarAssinatura(areaId = f.areaA, clienteId = f.clienteA, planoId = f.planoA) {
    const resposta = await request(app)
        .post(`${base}/assinaturas`)
        .set(cabecalhos(f.adminA, f.organizacaoA, areaId))
        .send({
            cliente_id: clienteId,
            plano_comercial_id: planoId,
            dia_vencimento: 5,
            inicio_em: '2024-01-01',
        });
    assert.equal(resposta.status, 201, JSON.stringify(resposta.body));
    return resposta.body.data as { id: string };
}

async function gerarMensalidade(assinaturaId: string, competencia: string) {
    const resposta = await request(app)
        .post(`${base}/assinaturas/${assinaturaId}/mensalidades`)
        .set(cabecalhos())
        .send({ competencia });
    assert.ok([200, 201].includes(resposta.status), JSON.stringify(resposta.body));
    return resposta;
}

before(async () => {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('É obrigatório utilizar o banco exclusivo de testes.');
    }

    await limpar();
    await connection('organizacoes').insert([
        { id: f.organizacaoA, nome: `Fixture Financeiro A ${f.organizacaoA}`, ativo: true },
        { id: f.organizacaoB, nome: `Fixture Financeiro B ${f.organizacaoB}`, ativo: true },
    ]);
    await connection('areas_negocio').insert([
        {
            id: f.areaA,
            organizacao_id: f.organizacaoA,
            nome: 'Financeiro Área A',
            codigo: `FIN-A-${f.areaA.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: f.areaA2,
            organizacao_id: f.organizacaoA,
            nome: 'Financeiro Área A2',
            codigo: `FIN-A2-${f.areaA2.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: f.areaB,
            organizacao_id: f.organizacaoB,
            nome: 'Financeiro Área B',
            codigo: `FIN-B-${f.areaB.slice(0, 8)}`,
            ativo: true,
        },
    ]);
    await connection('usuarios').insert([
        {
            id: f.adminA,
            nome: 'Admin Financeiro A',
            email: `financeiro-admin-a-${f.adminA}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        },
        {
            id: f.adminB,
            nome: 'Admin Financeiro B',
            email: `financeiro-admin-b-${f.adminB}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        },
        {
            id: f.operadorA,
            nome: 'Operador Financeiro A',
            email: `financeiro-operador-a-${f.operadorA}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        },
    ]);
    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: f.adminA,
            organizacao_id: f.organizacaoA,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: f.adminB,
            organizacao_id: f.organizacaoB,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: f.operadorA,
            organizacao_id: f.organizacaoA,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);
    await connection('clientes').insert([
        {
            id: f.clienteA,
            organizacao_id: f.organizacaoA,
            nome: 'Cliente Financeiro A',
            ativo: true,
        },
        {
            id: f.clienteA2,
            organizacao_id: f.organizacaoA,
            nome: 'Cliente Financeiro A2',
            ativo: true,
        },
        {
            id: f.clienteB,
            organizacao_id: f.organizacaoB,
            nome: 'Cliente Financeiro B',
            ativo: true,
        },
    ]);
    await connection('clientes_areas').insert([
        { cliente_id: f.clienteA, area_negocio_id: f.areaA, ativo: true },
        { cliente_id: f.clienteA2, area_negocio_id: f.areaA2, ativo: true },
        { cliente_id: f.clienteB, area_negocio_id: f.areaB, ativo: true },
    ]);
    await connection('planos_comerciais').insert([
        {
            id: f.planoA,
            organizacao_id: f.organizacaoA,
            area_negocio_id: f.areaA,
            nome: 'Plano Financeiro A',
            valor_base: dinheiro,
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoGlobalA,
            organizacao_id: f.organizacaoA,
            area_negocio_id: null,
            nome: 'Plano Financeiro Global',
            valor_base: '80.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoA2,
            organizacao_id: f.organizacaoA,
            area_negocio_id: f.areaA2,
            nome: 'Plano Financeiro A2',
            valor_base: '70.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
        {
            id: f.planoB,
            organizacao_id: f.organizacaoB,
            area_negocio_id: f.areaB,
            nome: 'Plano Financeiro B',
            valor_base: '60.00',
            periodicidade: 'MENSAL',
            ativo: true,
        },
    ]);
});

after(async () => {
    try {
        await connection.raw(
            'DROP TRIGGER IF EXISTS trg_test_financeiro_rollback ON historico_mensalidades',
        );
        await connection.raw('DROP FUNCTION IF EXISTS fn_test_financeiro_rollback()');
        await limpar();
    } finally {
        await connection.destroy();
    }
});

test('financeiro exige autenticação, perfil administrador e contexto multitenant', async () => {
    const semSessao = await request(app).get(`${base}/planos`);
    assert.equal(semSessao.status, 401);

    const operador = await request(app).get(`${base}/planos`).set(cabecalhos(f.operadorA));
    assert.equal(operador.status, 403);

    const organizacaoAlheia = await request(app)
        .get(`${base}/planos`)
        .set(cabecalhos(f.adminA, f.organizacaoB, f.areaB));
    assert.equal(organizacaoAlheia.status, 403);

    const areaAlheia = await request(app)
        .get(`${base}/planos/${f.planoA}`)
        .set(cabecalhos(f.adminA, f.organizacaoA, f.areaA2));
    assert.equal(areaAlheia.status, 404);
});

test('planos são limitados à organização e à área; body inválido é rejeitado', async () => {
    const lista = await request(app).get(`${base}/planos`).set(cabecalhos());
    assert.equal(lista.status, 200);
    assert.deepEqual(
        lista.body.data.map((plano: { id: string }) => plano.id).sort(),
        [f.planoA, f.planoGlobalA].sort(),
    );

    const detalhe = await request(app).get(`${base}/planos/${f.planoA}`).set(cabecalhos());
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.body.data.valor_base, dinheiro);

    const outroOrganizacao = await request(app)
        .get(`${base}/planos`)
        .set(cabecalhos(f.adminB, f.organizacaoB, f.areaB));
    assert.deepEqual(
        outroOrganizacao.body.data.map((plano: { id: string }) => plano.id),
        [f.planoB],
    );

    const invalido = await request(app)
        .post(`${base}/planos`)
        .set(cabecalhos())
        .send({ nome: 'Plano inválido', valor_base: -5 });
    assert.equal(invalido.status, 400);

    const criado = await request(app)
        .post(`${base}/planos`)
        .set(cabecalhos())
        .send({ nome: 'Plano criado pela API', valor_base: '125.90' });
    assert.equal(criado.status, 201, JSON.stringify(criado.body));
    assert.equal(criado.body.data.periodicidade, 'MENSAL');
});

test('assinaturas validam cliente/plano da área e permitem consulta paginada', async () => {
    const clienteOutraArea = await request(app).post(`${base}/assinaturas`).set(cabecalhos()).send({
        cliente_id: f.clienteA2,
        plano_comercial_id: f.planoA,
        dia_vencimento: 5,
        inicio_em: '2024-01-01',
    });
    assert.equal(clienteOutraArea.status, 404);

    const planoOutraArea = await request(app).post(`${base}/assinaturas`).set(cabecalhos()).send({
        cliente_id: f.clienteA,
        plano_comercial_id: f.planoA2,
        dia_vencimento: 5,
        inicio_em: '2024-01-01',
    });
    assert.equal(planoOutraArea.status, 404);

    const assinatura = await criarAssinatura();
    const detalhe = await request(app)
        .get(`${base}/assinaturas/${assinatura.id}`)
        .set(cabecalhos());
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.body.data.valor_contratado, dinheiro);

    const lista = await request(app)
        .get(`${base}/assinaturas?page=1&pageSize=10&clienteId=${f.clienteA}`)
        .set(cabecalhos());
    assert.equal(lista.status, 200);
    assert.equal(lista.body.data.items.length, 1);
    assert.equal(lista.body.data.pagination.total, 1);
});

test('mensalidade é gerada uma vez por competência e filtros retornam situação e vencimento', async () => {
    const assinatura = await criarAssinatura();
    const primeira = await gerarMensalidade(assinatura.id, '2024-02');
    assert.equal(primeira.status, 201);
    assert.equal(primeira.body.data.mensalidade.vencimento_em, '2024-02-05');

    const repetida = await gerarMensalidade(assinatura.id, '2024-02');
    assert.equal(repetida.status, 200);
    assert.equal(repetida.body.data.criada, false);
    assert.equal(repetida.body.data.mensalidade.id, primeira.body.data.mensalidade.id);

    const lista = await request(app)
        .get(`${base}/mensalidades?status=VENCIDA&vencimentoDe=2024-02-01&vencimentoAte=2024-02-29`)
        .set(cabecalhos());
    assert.equal(lista.status, 200);
    assert.equal(lista.body.data.items.length, 1);
    assert.equal(lista.body.data.items[0].status, 'VENCIDA');

    const detalhe = await request(app)
        .get(`${base}/mensalidades/${primeira.body.data.mensalidade.id}`)
        .set(cabecalhos());
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.body.data.saldo, dinheiro);

    const filtroInvalido = await request(app)
        .get(`${base}/mensalidades?vencimentoDe=2024-03-01&vencimentoAte=2024-02-01`)
        .set(cabecalhos());
    assert.equal(filtroInvalido.status, 400);
});

test('recebimento parcial, repetição idempotente, payload conflitante e quitação mantêm saldo exato', async () => {
    const assinatura = await criarAssinatura();
    const mensalidade = await gerarMensalidade(assinatura.id, '2024-03');
    const mensalidadeId = mensalidade.body.data.mensalidade.id as string;
    const endpoint = `${base}/mensalidades/${mensalidadeId}/recebimentos`;
    const primeiroBody = {
        valor: '30.10',
        forma_pagamento: 'PIX',
        pago_em: '2024-03-05T12:00:00-03:00',
    };

    const precisaoMaiorQueMillis = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': `precisao-${crypto.randomUUID()}` })
        .send({ ...primeiroBody, pago_em: '2024-03-05T12:00:00.1234Z' });
    assert.equal(precisaoMaiorQueMillis.status, 400);

    const parcial = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': `parcial-${crypto.randomUUID()}` })
        .send(primeiroBody);
    assert.equal(parcial.status, 201, JSON.stringify(parcial.body));
    assert.equal(parcial.body.data.mensalidade.valor_pago, '30.10');
    assert.equal(parcial.body.data.mensalidade.saldo, '69.90');

    const chave = `repeticao-${crypto.randomUUID()}`;
    const recebido = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': chave })
        .send({ valor: '10.00', forma_pagamento: 'DINHEIRO', pago_em: '2024-03-06T12:00:00Z' });
    assert.equal(recebido.status, 201);
    const repetido = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': chave })
        .send({ valor: '10.00', forma_pagamento: 'DINHEIRO', pago_em: '2024-03-06T12:00:00Z' });
    assert.equal(repetido.status, 200);
    assert.equal(repetido.body.data.repetido, true);
    assert.equal(repetido.body.data.pagamento.id, recebido.body.data.pagamento.id);

    const chaveIncompativel = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': chave })
        .send({ valor: '11.00', forma_pagamento: 'DINHEIRO', pago_em: '2024-03-06T12:00:00Z' });
    assert.equal(chaveIncompativel.status, 409);

    const excesso = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': `excesso-${crypto.randomUUID()}` })
        .send({ valor: '60.01', forma_pagamento: 'PIX', pago_em: '2024-03-07T12:00:00Z' });
    assert.equal(excesso.status, 409);

    const quitacao = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': `quitacao-${crypto.randomUUID()}` })
        .send({ valor: '59.90', forma_pagamento: 'PIX', pago_em: '2024-03-07T12:00:00Z' });
    assert.equal(quitacao.status, 201, JSON.stringify(quitacao.body));
    assert.equal(quitacao.body.data.mensalidade.status, 'PAGA');
    assert.equal(quitacao.body.data.mensalidade.saldo, '0.00');

    const pagamentoExtra = await request(app)
        .post(endpoint)
        .set({ ...cabecalhos(), 'Idempotency-Key': `extra-${crypto.randomUUID()}` })
        .send({ valor: '0.01', forma_pagamento: 'PIX', pago_em: '2024-03-08T12:00:00Z' });
    assert.equal(pagamentoExtra.status, 409);

    const pagamentos = await connection('pagamentos')
        .where('organizacao_id', f.organizacaoA)
        .andWhere('conta_receber_id', mensalidade.body.data.mensalidade.conta_receber_id);
    assert.equal(pagamentos.length, 3);
});

test('recebimentos concorrentes não ultrapassam o saldo e chave idempotente concorrente não duplica', async () => {
    const assinatura = await criarAssinatura();
    const mensalidade = await gerarMensalidade(assinatura.id, '2024-04');
    const id = mensalidade.body.data.mensalidade.id as string;
    const endpoint = `${base}/mensalidades/${id}/recebimentos`;
    const pagos = await Promise.all([
        request(app)
            .post(endpoint)
            .set({ ...cabecalhos(), 'Idempotency-Key': `conc-${crypto.randomUUID()}` })
            .send({ valor: '60.00', forma_pagamento: 'PIX', pago_em: '2024-04-05T12:00:00Z' }),
        request(app)
            .post(endpoint)
            .set({ ...cabecalhos(), 'Idempotency-Key': `conc-${crypto.randomUUID()}` })
            .send({ valor: '50.00', forma_pagamento: 'PIX', pago_em: '2024-04-05T12:00:00Z' }),
    ]);
    assert.deepEqual(pagos.map((item) => item.status).sort(), [201, 409]);

    const mensalidadeIdempotente = await gerarMensalidade(assinatura.id, '2024-05');
    const idempotenteId = mensalidadeIdempotente.body.data.mensalidade.id as string;
    const endpointIdempotente = `${base}/mensalidades/${idempotenteId}/recebimentos`;
    const chave = `conc-idem-${crypto.randomUUID()}`;
    const body = { valor: '25.00', forma_pagamento: 'PIX', pago_em: '2024-05-05T12:00:00Z' };
    const repeticoes = await Promise.all([
        request(app)
            .post(endpointIdempotente)
            .set({ ...cabecalhos(), 'Idempotency-Key': chave })
            .send(body),
        request(app)
            .post(endpointIdempotente)
            .set({ ...cabecalhos(), 'Idempotency-Key': chave })
            .send(body),
    ]);
    assert.deepEqual(repeticoes.map((item) => item.status).sort(), [200, 201]);
    assert.equal(repeticoes[0].body.data.pagamento.id, repeticoes[1].body.data.pagamento.id);

    const total = await connection('pagamentos')
        .where('organizacao_id', f.organizacaoA)
        .andWhere('conta_receber_id', mensalidadeIdempotente.body.data.mensalidade.conta_receber_id)
        .count({ total: '*' })
        .first();
    assert.equal(Number(total?.total), 1);
});

test('falha ao gravar histórico desfaz recebimento, conta e auditoria na mesma transação', async () => {
    const assinatura = await criarAssinatura();
    const mensalidade = await gerarMensalidade(assinatura.id, '2024-06');
    const mensalidadeId = mensalidade.body.data.mensalidade.id as string;
    await connection.raw(`
        CREATE OR REPLACE FUNCTION fn_test_financeiro_rollback() RETURNS trigger AS $$
        BEGIN
            IF NEW.tipo_evento = 'RECEBIMENTO_REGISTRADO' THEN
                RAISE EXCEPTION 'falha transacional de teste';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER trg_test_financeiro_rollback
        BEFORE INSERT ON historico_mensalidades
        FOR EACH ROW EXECUTE FUNCTION fn_test_financeiro_rollback();
    `);

    try {
        const resposta = await request(app)
            .post(`${base}/mensalidades/${mensalidadeId}/recebimentos`)
            .set({ ...cabecalhos(), 'Idempotency-Key': `rollback-${crypto.randomUUID()}` })
            .send({ valor: '25.00', forma_pagamento: 'PIX', pago_em: '2024-06-05T12:00:00Z' });
        assert.equal(resposta.status, 500);

        const dados = await connection('mensalidades as m')
            .innerJoin('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
            .select('cr.status')
            .where('m.id', mensalidadeId)
            .first();
        assert.equal(dados?.status, 'PENDENTE');

        const pagamentos = await connection('pagamentos').where(
            'conta_receber_id',
            mensalidade.body.data.mensalidade.conta_receber_id,
        );
        assert.equal(pagamentos.length, 0);

        const historicos = await connection('historico_mensalidades')
            .where('mensalidade_id', mensalidadeId)
            .andWhere('tipo_evento', 'RECEBIMENTO_REGISTRADO');
        assert.equal(historicos.length, 0);

        const auditorias = await connection('registros_auditoria')
            .where('organizacao_id', f.organizacaoA)
            .andWhere('recurso', 'MENSALIDADE')
            .andWhere('recurso_id', mensalidadeId)
            .andWhere('acao', 'FINANCEIRO.RECEBIMENTO_REGISTRADO');
        assert.equal(auditorias.length, 0);
    } finally {
        await connection.raw(
            'DROP TRIGGER IF EXISTS trg_test_financeiro_rollback ON historico_mensalidades',
        );
        await connection.raw('DROP FUNCTION IF EXISTS fn_test_financeiro_rollback()');
    }
});

test('resumo limita valores à área atual e valida intervalo', async () => {
    const resposta = await request(app)
        .get(`${base}/resumo?inicio=2024-01-01&fim=2024-12-31`)
        .set(cabecalhos());
    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.data.periodo.fim, '2024-12-31');

    const intervaloInvalido = await request(app)
        .get(`${base}/resumo?inicio=2024-12-31&fim=2024-01-01`)
        .set(cabecalhos());
    assert.equal(intervaloInvalido.status, 400);
});
