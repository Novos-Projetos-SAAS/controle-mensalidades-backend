import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import test, { after, type TestContext } from 'node:test';
import connection from '../../../src/database/connection.js';
import { AbacatePayService } from '../../../src/modules/pagamentos/abacatepay/abacatepay.service.js';
import { PagamentosService } from '../../../src/modules/pagamentos/pagamentos.service.js';
import { AbacatePayProvider } from '../../../src/modules/pagamentos/abacatepay/abacatepay.provider.js';

const key = Buffer.alloc(32, 19).toString('base64');
const secret = 'webhook_test_secret_exclusivo_32_caracteres';
const hmacKey =
    't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
after(async () => connection.destroy());

async function fixture(t: TestContext) {
    assert.equal(process.env.AMBIENTE_BANCO, 'teste');
    const org = randomUUID(),
        area = randomUUID(),
        cliente = randomUUID(),
        plano = randomUUID(),
        assinatura = randomUUID(),
        conta = randomUUID(),
        mensalidade = randomUUID();
    await connection('organizacoes').insert({ id: org, nome: 'Abacate QA' });
    await connection('areas_negocio').insert({
        id: area,
        organizacao_id: org,
        nome: 'Área QA',
        codigo: 'qa',
    });
    await connection('clientes').insert({
        id: cliente,
        organizacao_id: org,
        nome: 'Cliente Fictício',
        email: 'ficticio@example.test',
        telefone: '(11) 99999-9999',
    });
    await connection('planos_comerciais').insert({
        id: plano,
        organizacao_id: org,
        area_negocio_id: area,
        nome: 'Plano QA',
        valor_base: '100.00',
    });
    await connection('assinaturas').insert({
        id: assinatura,
        organizacao_id: org,
        area_negocio_id: area,
        cliente_id: cliente,
        plano_comercial_id: plano,
        valor_contratado: '100.00',
        dia_vencimento: 25,
        inicio_em: '2026-01-01',
    });
    await connection('contas_receber').insert({
        id: conta,
        organizacao_id: org,
        area_negocio_id: area,
        cliente_id: cliente,
        origem_tipo: 'MENSALIDADE',
        origem_id: mensalidade,
        descricao: 'Clínico nunca exportar',
        valor_original: '100.00',
        valor_final: '100.00',
        vencimento_em: '2026-11-25',
    });
    await connection('mensalidades').insert({
        id: mensalidade,
        organizacao_id: org,
        area_negocio_id: area,
        assinatura_id: assinatura,
        conta_receber_id: conta,
        competencia: '2026-11-01',
        valor_base: '100.00',
        valor_final: '100.00',
        vencimento_em: '2026-11-25',
    });
    const context = { organizacaoId: org, areaNegocioId: area, usuarioId: null };
    const checkouts = new Map<string, Record<string, unknown>>();
    const subscriptions = new Map<string, Record<string, unknown>>();
    let calls = 0,
        failCreate = false,
        now = new Date('2026-11-25T12:00:00Z');
    let customerPayload: Record<string, unknown> | null = null;
    const fetcher: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        let data: unknown;
        if (url.pathname.endsWith('/customers/get'))
            return Response.json(
                { data: null, success: false, error: 'Customer not found' },
                { status: 404 },
            );
        if (url.pathname.endsWith('/customers/create')) {
            customerPayload = body;
            data = {
                ...body,
                id: 'cust_qa',
                metadata: {},
                devMode: true,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            };
        } else if (url.pathname.endsWith('/products/get'))
            return Response.json(
                { data: null, success: false, error: 'Product not found' },
                { status: 404 },
            );
        else if (url.pathname.endsWith('/products/list')) data = [];
        else if (url.pathname.endsWith('/products/create'))
            data = {
                ...body,
                id: `prod_${calls}`,
                status: 'ACTIVE',
                description: '',
                devMode: true,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            };
        else if (
            url.pathname.endsWith('/checkouts/create') ||
            url.pathname.endsWith('/subscriptions/create')
        ) {
            calls++;
            data = {
                ...body,
                id: `bill_qa${calls}`,
                url: `https://app.abacatepay.com/pay/bill_qa${calls}`,
                amount: 10000,
                paidAmount: null,
                status: 'PENDING',
                devMode: true,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
                frequency: url.pathname.includes('/subscriptions/') ? 'SUBSCRIPTION' : 'ONE_TIME',
            };
            checkouts.set(String(body.externalId), data as Record<string, unknown>);
            if (failCreate) throw new Error('timeout após criação');
        } else if (
            url.pathname.endsWith('/checkouts/get') ||
            url.pathname.endsWith('/subscriptions/checkouts/get')
        ) {
            data =
                checkouts.get(url.searchParams.get('externalId') ?? '') ??
                [...checkouts.values()].find((x) => x.id === url.searchParams.get('id'));
        } else if (url.pathname.endsWith('/subscriptions/get'))
            data = [...subscriptions.values()].find(
                (x) =>
                    x.id === url.searchParams.get('id') ||
                    x.externalId === url.searchParams.get('externalId'),
            );
        else if (url.pathname.endsWith('/subscriptions/cancel')) {
            data = { ...subscriptions.get(body.id), status: 'CANCELLED' };
            subscriptions.set(body.id, data as Record<string, unknown>);
        } else if (url.pathname.endsWith('/subscriptions/checkouts/delete'))
            data = { success: true };
        else throw new Error(`Unexpected mock endpoint ${url.pathname}`);
        return Response.json({
            data,
            error: null,
            success: true,
            pagination: { hasMore: false, next: null, before: null },
        });
    };
    const service = new AbacatePayService({
        db: connection,
        key: () => key,
        now: () => now,
        origens: () => new Set(['https://plataforma.example']),
        ambiente: () => 'test',
        provider: new AbacatePayProvider({ fetcher }),
    });
    await service.atualizarConfiguracao(
        context,
        {
            ambiente: 'TESTE',
            ativo: true,
            api_key: 'abc_dev_test_ficticia',
            webhook_secret: secret,
            recorrencia_habilitada: true,
            cartao_recorrente: true,
        },
        'https://plataforma.example',
    );
    t.after(async () => {
        for (const table of [
            'eventos_webhook',
            'transacoes_pagamento',
            'pagamentos',
            'cobrancas_pagamento',
            'recorrencias_pagamento',
            'recursos_pagamento',
            'integracoes_pagamento',
            'registros_auditoria',
        ])
            await connection(table).where('organizacao_id', org).del();
        const ms = await connection('mensalidades').where('organizacao_id', org).select('id');
        await connection('historico_mensalidades')
            .whereIn(
                'mensalidade_id',
                ms.map((x) => x.id),
            )
            .del();
        for (const table of [
            'mensalidades',
            'contas_receber',
            'assinaturas',
            'planos_comerciais',
            'clientes',
            'areas_negocio',
        ])
            await connection(table).where('organizacao_id', org).del();
        await connection('organizacoes').where('id', org).del();
    });
    const envelope = async (
        event: string,
        paymentId: string,
        subscription?: Record<string, unknown>,
        amount = 10000,
        paidAt = now.toISOString(),
    ) => {
        const checkout = [...checkouts.values()][0]!;
        const payload = {
            id: `log_${randomUUID()}`,
            event,
            apiVersion: 2,
            devMode: true,
            data: {
                checkout: { ...checkout, status: 'PAID', paidAmount: amount },
                ...(subscription ? { subscription } : {}),
                payerInformation: { method: 'CARD' },
                ...(subscription && event.startsWith('subscription.')
                    ? {
                          payment: {
                              id: paymentId,
                              amount,
                              paidAmount: amount,
                              status: 'APPROVED',
                              methods: ['CARD'],
                              createdAt: paidAt,
                              updatedAt: paidAt,
                          },
                      }
                    : {}),
            },
        };
        checkouts.set(String(checkout.externalId), {
            ...checkout,
            status: 'PAID',
            paidAmount: 10000,
            updatedAt: paidAt,
        });
        const raw = Buffer.from(JSON.stringify(payload));
        const config = await service.lerConfiguracao(context);
        await service.receberWebhook(
            config.id!,
            raw,
            secret,
            createHmac('sha256', hmacKey).update(raw).digest('base64'),
        );
        await service.processarEventos();
        return raw;
    };
    return {
        org,
        area,
        cliente,
        plano,
        assinatura,
        conta,
        mensalidade,
        context,
        service,
        subscriptions,
        checkouts,
        envelope,
        get calls() {
            return calls;
        },
        get customerPayload() {
            return customerPayload;
        },
        set fail(value: boolean) {
            failCreate = value;
        },
        set now(value: Date) {
            now = value;
        },
    };
}

test('AbacatePay configuração cifra segredos e isola organização', async (t) => {
    const f = await fixture(t);
    const cfg = await f.service.lerConfiguracao(f.context);
    assert.equal(cfg.has_api_key, true);
    assert.equal(cfg.has_webhook_secret, true);
    assert.equal(JSON.stringify(cfg).includes('abc_dev_'), false);
    assert.equal(JSON.stringify(cfg).includes(secret), false);
    const row = await connection('integracoes_pagamento').where('id', cfg.id).first();
    assert.equal(row.configuracao_criptografada.includes('abc_dev_'), false);
    const foreign = await f.service.lerConfiguracao({ ...f.context, organizacaoId: randomUUID() });
    assert.equal(foreign.has_api_key, false);
    await assert.rejects(
        f.service.atualizarConfiguracao(f.context, {
            ambiente: 'PRODUCAO',
            api_key: 'abc_dev_fake',
        }),
        /ambiente/i,
    );
});

test('checkout avulso concorrente usa banco, preenche contato e não exporta saúde', async (t) => {
    const f = await fixture(t);
    const [a, b] = await Promise.all([
        f.service.gerarCobranca(f.context, f.mensalidade),
        f.service.gerarCobranca(f.context, f.mensalidade),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(f.calls, 1);
    assert.equal(a.valor, '100.00');
    assert.equal(f.customerPayload?.email, 'ficticio@example.test');
    assert.equal(f.customerPayload?.cellphone, '+5511999999999');
    assert.equal(JSON.stringify(f.customerPayload).includes('Clínico'), false);
    const row = await connection('cobrancas_pagamento').where('id', a.id).first();
    assert.equal(JSON.stringify(row.payload_checkout).includes('ficticio@'), false);
    await assert.rejects(
        f.service.atualizarConfiguracao(f.context, { api_key: 'abc_dev_other' }),
        /cobranças|pagamentos/i,
    );
});

test('checkout omite contatos ausentes e rejeita outro tenant', async (t) => {
    const f = await fixture(t);
    await connection('clientes').where('id', f.cliente).update({ email: null, telefone: null });
    await assert.rejects(
        f.service.gerarCobranca({ ...f.context, organizacaoId: randomUUID() }, f.mensalidade),
        /encontrada/i,
    );
    assert.equal(f.calls, 0);
    await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.equal(f.customerPayload, null);
});

test('timeout preserva intenção e reconcilia checkout sem segundo POST', async (t) => {
    const f = await fixture(t);
    f.fail = true;
    const c = await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.equal(c.status, 'CRIACAO_INCERTA');
    await f.service.conciliar(f.context, c.id);
    assert.equal(f.calls, 1);
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))?.status,
        'AGUARDANDO_PAGAMENTO',
    );
});

test('webhooks duplicados e eventos distintos do mesmo pagamento baixam uma vez', async (t) => {
    const f = await fixture(t);
    await f.service.gerarCobranca(f.context, f.mensalidade);
    const raw = await f.envelope('checkout.completed', 'card_pagamento1');
    const cfg = await f.service.lerConfiguracao(f.context);
    await f.service.receberWebhook(
        cfg.id!,
        raw,
        secret,
        createHmac('sha256', hmacKey).update(raw).digest('base64'),
    );
    await f.envelope('checkout.completed', 'card_pagamento1');
    const payments = await connection('pagamentos').where('organizacao_id', f.org);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].origem, 'ABACATEPAY');
    assert.equal((await connection('contas_receber').where('id', f.conta).first()).status, 'PAGO');
    await assert.rejects(f.service.gerarCobranca(f.context, f.mensalidade), /saldo|paga/i);
});

test('webhook falso ou valor divergente não baixa mensalidade', async (t) => {
    const f = await fixture(t);
    await f.service.gerarCobranca(f.context, f.mensalidade);
    const cfg = await f.service.lerConfiguracao(f.context);
    await assert.rejects(f.service.receberWebhook(cfg.id!, Buffer.from('{}'), secret, 'falso'));
    await f.envelope('checkout.completed', 'card_divergente', undefined, 9000);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 0);
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))?.status,
        'PAGO_EM_REVISAO',
    );
});

test('recorrência cria bill antes de subs, bloqueia avulso e Pix indisponível', async (t) => {
    const f = await fixture(t);
    await assert.rejects(
        f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'PIX' }),
        /Pix/i,
    );
    const r = await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    assert.equal(r.status, 'AGUARDANDO_AUTORIZACAO');
    assert.equal(r.assinatura_externa_id, null);
    await assert.rejects(
        f.service.gerarCobranca(f.context, f.mensalidade),
        /automático|recorrência/i,
    );
    assert.equal(
        (await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' })).id,
        r.id,
    );
    assert.equal(f.calls, 1);
    const infinite = new PagamentosService({
        db: connection,
        key: () => key,
        origens: () => new Set(['https://plataforma.example']),
        ambiente: () => 'test',
    });
    await assert.rejects(
        infinite.gerarCobranca(f.context, f.mensalidade),
        /automático|recorrência/i,
    );
});

test('primeiro pagamento e renovação vinculam competências e pagamentos distintos', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'BRL',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', sub);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    assert.equal((await f.service.consultarRecorrencia(f.context, f.assinatura))?.status, 'ATIVA');
    f.now = new Date('2026-12-25T12:00:00Z');
    await f.envelope('subscription.renewed', 'card_segundo', sub);
    await f.envelope('checkout.completed', 'card_segundo', sub);
    const ms = await connection('mensalidades')
        .where('assinatura_id', f.assinatura)
        .orderBy('competencia');
    assert.equal(ms.length, 2);
    assert.equal(
        String(ms[1].competencia).includes('Dec') || String(ms[1].competencia).includes('2026-12'),
        true,
    );
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 2);
});

test('falha não baixa, cancelamento não encerra contrato, evento atrasado não reativa', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'BRL',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', sub);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    f.now = new Date('2026-12-25T12:00:00Z');
    await f.envelope('subscription.payment_failed', 'card_recusado', sub);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
    await f.service.cancelarRecorrencia(f.context, f.assinatura);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    assert.equal(
        (await f.service.consultarRecorrencia(f.context, f.assinatura))?.status,
        'CANCELADA',
    );
    assert.equal(
        (await connection('assinaturas').where('id', f.assinatura).first()).status,
        'ATIVA',
    );
});

test('adesão impede vencimento incompatível e credenciais ausentes', async (t) => {
    const f = await fixture(t);
    await connection('assinaturas').where('id', f.assinatura).update({ dia_vencimento: 27 });
    await assert.rejects(
        f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' }),
        /vencimento/i,
    );
    await f.service.atualizarConfiguracao(f.context, { ativo: false });
    await assert.rejects(f.service.gerarCobranca(f.context, f.mensalidade), /configur|desativada/i);
});

test('eventos de falha antigos não regridem um ciclo já pago', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'BRL',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', sub);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    await f.envelope(
        'subscription.payment_failed',
        'card_falha_antiga',
        sub,
        10000,
        '2026-11-25T11:00:00Z',
    );
    assert.equal((await f.service.consultarRecorrencia(f.context, f.assinatura))?.status, 'ATIVA');
});

test('notificação atrasada fora do vencimento preserva recorrência cancelada', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'BRL',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', sub);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    await f.service.cancelarRecorrencia(f.context, f.assinatura);
    await f.envelope('subscription.renewed', 'card_atrasado', sub, 10000, '2026-12-26T12:00:00Z');
    assert.equal(
        (await f.service.consultarRecorrencia(f.context, f.assinatura))?.status,
        'CANCELADA',
    );
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
});

test('confirmação recebida após desativar integração continua verificável', async (t) => {
    const f = await fixture(t);
    await f.service.gerarCobranca(f.context, f.mensalidade);
    await f.service.atualizarConfiguracao(f.context, { ativo: false });
    await f.envelope('checkout.completed', 'card_confirmado');
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
});

test('recebimento manual anterior preserva histórico e envia pagamento externo para revisão', async (t) => {
    const f = await fixture(t);
    await f.service.gerarCobranca(f.context, f.mensalidade);
    const { registrarRecebimentoTransacional } =
        await import('../../../src/modules/financeiro/financeiro.service.js');
    await connection.transaction((trx) =>
        registrarRecebimentoTransacional(trx, f.context, f.mensalidade, 'manual-before-provider', {
            valor: '100.00',
            forma_pagamento: 'PIX',
            pago_em: '2026-11-25T11:00:00Z',
        }),
    );
    await f.envelope('checkout.completed', 'card_confirmado');
    const pays = await connection('pagamentos').where('organizacao_id', f.org);
    assert.equal(pays.length, 1);
    assert.equal(pays[0].origem, 'MANUAL');
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))?.status,
        'PAGO_EM_REVISAO',
    );
});

test('conciliação antes do webhook usa o mesmo pagamento sem duplicar recebimento', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const checkout = [...f.checkouts.values()][0]!;
    f.checkouts.set(String(checkout.externalId), {
        ...checkout,
        status: 'PAID',
        paidAmount: 10000,
        methods: ['CARD'],
    });
    await f.service.conciliar(f.context, charge.id);
    await f.envelope('checkout.completed', 'card_depois_consulta');
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
    assert.equal(
        (await connection('transacoes_pagamento').where('organizacao_id', f.org).first())
            .transaction_nsu,
        `TESTE:${checkout.id}`,
    );
});

test('recorrência com moeda divergente ou ambiente diferente não liquida mensalidade', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'USD',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', { ...sub, currency: 'BRL' });
    await f.envelope('subscription.completed', 'card_moeda_errada', sub);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 0);
});

test('renovação aprovada na retentativa do dia seguinte mantém competência e autorização', async (t) => {
    const f = await fixture(t);
    await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    const sub = {
        id: 'subs_qa',
        checkoutId: [...f.checkouts.values()][0]!.id,
        customerId: 'cust_qa',
        externalId: f.assinatura,
        amount: 10000,
        currency: 'BRL',
        status: 'ACTIVE',
        frequency: 'MONTHLY',
        method: 'CARD',
        devMode: true,
        createdAt: '2026-11-25T12:00:00Z',
        updatedAt: '2026-11-25T12:00:00Z',
    };
    f.subscriptions.set('subs_qa', sub);
    await f.envelope('subscription.completed', 'card_primeiro', sub);
    f.now = new Date('2026-12-26T12:00:00Z');
    await f.envelope('subscription.renewed', 'card_retry', sub);
    assert.equal((await f.service.consultarRecorrencia(f.context, f.assinatura))?.status, 'ATIVA');
    const ms = await connection('mensalidades').where('assinatura_id', f.assinatura);
    assert.equal(ms.length, 2);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 2);
});
test('contrato com término definido não inicia autorização sem encerramento programado', async (t) => {
    const f = await fixture(t);
    await connection('assinaturas').where('id', f.assinatura).update({ fim_em: '2026-12-31' });
    await assert.rejects(
        f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' }),
        /término|prazo/i,
    );
    assert.equal(f.calls, 0);
});

test('retoma intenção avulsa persistida antes de iniciar chamada externa', async (t) => {
    const f = await fixture(t);
    const c = await f.service.gerarCobranca(f.context, f.mensalidade);
    await connection('cobrancas_pagamento')
        .where('id', c.id)
        .update({
            status: 'AGUARDANDO_CRIACAO',
            recurso_externo_id: null,
            checkout_url: null,
            criacao_iniciada_em: null,
        });
    f.checkouts.clear();
    await f.service.recuperarIntencoes();
    assert.equal(f.calls, 2);
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))?.status,
        'AGUARDANDO_PAGAMENTO',
    );
});
test('retoma adesão persistida antes de iniciar checkout', async (t) => {
    const f = await fixture(t);
    const r = await f.service.criarRecorrencia(f.context, f.assinatura, { metodo: 'CARD' });
    await connection('recorrencias_pagamento')
        .where('id', r.id)
        .update({
            status: 'PREPARANDO',
            operacao_iniciada_em: null,
            checkout_externo_id: null,
            checkout_url: null,
        });
    f.checkouts.clear();
    await f.service.recuperarIntencoes();
    assert.equal(f.calls, 2);
    assert.equal(
        (await f.service.consultarRecorrencia(f.context, f.assinatura))?.status,
        'AGUARDANDO_AUTORIZACAO',
    );
});
