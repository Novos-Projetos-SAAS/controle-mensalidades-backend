import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, type TestContext } from 'node:test';

import connection from '../../../src/database/connection.js';
import app from '../../../src/app.js';
import request from 'supertest';
import { PagamentosService } from '../../../src/modules/pagamentos/pagamentos.service.js';
import { cifrarSegredo } from '../../../src/modules/pagamentos/credenciais.js';

const key = Buffer.alloc(32, 7).toString('base64');
const clock = new Date('2026-11-25T12:00:00Z');
after(async () => connection.destroy());

async function fixture(t: TestContext, vencimento = '2026-11-27') {
    assert.equal(process.env.AMBIENTE_BANCO, 'teste');
    const org = randomUUID(),
        area = randomUUID(),
        cliente = randomUUID(),
        plano = randomUUID(),
        assinatura = randomUUID(),
        conta = randomUUID(),
        mensalidade = randomUUID();
    await connection('organizacoes').insert({ id: org, nome: 'Pagamento teste' });
    await connection('areas_negocio').insert({
        id: area,
        organizacao_id: org,
        nome: 'Área teste',
        codigo: 'teste',
    });
    await connection('clientes').insert({
        id: cliente,
        organizacao_id: org,
        nome: 'Cliente Checkout Teste',
    });
    await connection('planos_comerciais').insert({
        id: plano,
        organizacao_id: org,
        area_negocio_id: area,
        nome: 'Plano teste',
        valor_base: '100.00',
    });
    await connection('assinaturas').insert({
        id: assinatura,
        organizacao_id: org,
        area_negocio_id: area,
        cliente_id: cliente,
        plano_comercial_id: plano,
        valor_contratado: '100.00',
        dia_vencimento: 27,
        inicio_em: '2026-01-01',
    });
    await connection('contas_receber').insert({
        id: conta,
        organizacao_id: org,
        area_negocio_id: area,
        cliente_id: cliente,
        origem_tipo: 'MENSALIDADE',
        origem_id: mensalidade,
        descricao: 'Descrição clínica privada',
        valor_original: '100.00',
        valor_final: '100.00',
        vencimento_em: vencimento,
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
        vencimento_em: vencimento,
    });
    const context = { organizacaoId: org, areaNegocioId: area, usuarioId: null };
    let creates = 0,
        checks = 0;
    let payload: Record<string, unknown> = {};
    let evidence: unknown = {
        success: true,
        paid: true,
        amount: 10000,
        paid_amount: 10100,
        capture_method: 'pix',
        installments: 1,
    };
    let failCreate = false;
    let failCheck = false;
    const checkKeys: string[] = [];
    const service = new PagamentosService({
        db: connection,
        key: () => key,
        now: () => clock,
        origens: () => new Set(['https://plataforma.example']),
        ambiente: () => 'test',
        provider: {
            async createLink(_apiKey: string, input: Record<string, unknown>) {
                creates++;
                payload = input;
                if (failCreate) throw new Error('timeout');
                return { url: 'https://buy.infinitepay.io/teste' };
            },
            async checkPayment(apiKey: string) {
                checks++;
                checkKeys.push(apiKey);
                if (failCheck) throw new Error('timeout');
                return evidence;
            },
        },
    });
    await service.atualizarConfiguracao(
        context,
        {
            ativo: true,
            geracao_automatica: false,
            dias_antecedencia: 2,
            handle: 'lojista',
            api_key: 'inchk_test_only',
        },
        'https://plataforma.example',
    );
    t.after(async () => {
        await connection('eventos_webhook').where('organizacao_id', org).del();
        await connection('transacoes_pagamento').where('organizacao_id', org).del();
        await connection('pagamentos').where('organizacao_id', org).del();
        await connection('cobrancas_pagamento').where('organizacao_id', org).del();
        await connection('integracoes_pagamento').where('organizacao_id', org).del();
        await connection('historico_mensalidades').where('mensalidade_id', mensalidade).del();
        await connection('registros_auditoria').where('organizacao_id', org).del();
        await connection('mensalidades').where('id', mensalidade).del();
        await connection('contas_receber').where('id', conta).del();
        await connection('assinaturas').where('id', assinatura).del();
        await connection('planos_comerciais').where('id', plano).del();
        await connection('clientes').where('id', cliente).del();
        await connection('areas_negocio').where('id', area).del();
        await connection('organizacoes').where('id', org).del();
    });
    return {
        org,
        area,
        cliente,
        conta,
        mensalidade,
        context,
        service,
        get creates() {
            return creates;
        },
        get checks() {
            return checks;
        },
        get payload() {
            return payload;
        },
        checkKeys,
        evidence: (value: unknown) => {
            evidence = value;
        },
        failCreate: () => {
            failCreate = true;
        },
        failCheck: (value: boolean) => {
            failCheck = value;
        },
    };
}

function tokenOf(charge: { url_plataforma: string }) {
    return charge.url_plataforma.split('/').at(-1)!;
}
async function identifiers(charge: { id: string }, transaction = randomUUID()) {
    const row = await connection('cobrancas_pagamento').where('id', charge.id).first();
    return {
        order_nsu: String(row.identificador_externo),
        transaction_nsu: transaction,
        slug: 'invoice-test',
    };
}

test('configuração cifra credencial, recusa origem forjada e aceita apenas 1 ou 2 dias', async (t) => {
    const f = await fixture(t);
    const config = await f.service.lerConfiguracao(f.context);
    assert.equal(config.has_api_key, true);
    assert.equal(JSON.stringify(config).includes('inchk_'), false);
    const stored = await connection('integracoes_pagamento').where('organizacao_id', f.org).first();
    assert.equal(stored.configuracao_criptografada.includes('inchk_'), false);
    await assert.rejects(
        f.service.atualizarConfiguracao(
            f.context,
            { dias_antecedencia: 3 },
            'https://plataforma.example',
        ),
    );
    await assert.rejects(
        f.service.atualizarConfiguracao(f.context, { ativo: true }, 'https://evil.example'),
    );
});

test('geração concorrente cria um único checkout e usa URLs fixas da plataforma sem dados clínicos', async (t) => {
    const f = await fixture(t);
    const charges = await Promise.all(
        Array.from({ length: 4 }, () => f.service.gerarCobranca(f.context, f.mensalidade)),
    );
    assert.equal(new Set(charges.map((c) => c.id)).size, 1);
    assert.equal(f.creates, 1);
    const charge = await f.service.consultarCobranca(f.context, f.mensalidade);
    assert.equal(charge!.status, 'AGUARDANDO_PAGAMENTO');
    assert.equal(charge!.valor, '100.00');
    assert.equal(new URL(String(f.payload.redirect_url)).pathname, '/pagamento/retorno');
    assert.equal(new URL(String(f.payload.redirect_url)).origin, 'https://plataforma.example');
    assert.equal(
        (f.payload.webhook as { url: string }).url,
        'https://plataforma.example/api/v1/pagamentos/webhook/infinitepay',
    );
    assert.equal(JSON.stringify(f.payload).includes('clínica'), false);
    assert.deepEqual(f.payload.customer, { name: 'Cliente Checkout Teste' });
    assert.equal(JSON.stringify(f.payload).includes('cpf'), false);
    assert.equal(await connection('pagamentos').where('organizacao_id', f.org).first(), undefined);
});

test('token público é opaco, não revela identidade e não permite outra organização/área', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const token = tokenOf(charge);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const publicCharge = await f.service.consultarPublica(token);
    assert.deepEqual(Object.keys(publicCharge).sort(), [
        'checkout_url',
        'expira_em',
        'status',
        'valor',
        'vencimento_em',
    ]);
    await assert.rejects(f.service.consultarPublica(randomUUID()));
    await assert.rejects(
        f.service.consultarCobranca({ ...f.context, organizacaoId: randomUUID() }, f.mensalidade),
    );
    await assert.rejects(
        f.service.consultarCobranca({ ...f.context, areaNegocioId: randomUUID() }, f.mensalidade),
    );
    const stored = await connection('cobrancas_pagamento').where('id', charge.id).first();
    assert.equal(JSON.stringify(stored).includes(token), false);
});

test('webhook e retorno concorrentes baixam uma vez com auditoria e taxa separada', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const ids = await identifiers(charge);
    await Promise.all([
        f.service.confirmarPublica(tokenOf(charge), ids),
        f.service.receberSinal(ids, 'WEBHOOK').then(() => f.service.processarEventos()),
    ]);
    await f.service.processarEventos();
    const payments = await connection('pagamentos').where('organizacao_id', f.org);
    assert.equal(payments.length, 1);
    assert.equal(payments[0].valor, '100.00');
    assert.equal(payments[0].origem, 'INFINITEPAY');
    assert.equal(payments[0].registrado_por_usuario_id, null);
    assert.equal((await connection('contas_receber').where('id', f.conta).first()).status, 'PAGO');
    assert.equal(
        (await connection('transacoes_pagamento').where('organizacao_id', f.org)).length,
        1,
    );
    assert.equal(
        (await connection('historico_mensalidades').where('mensalidade_id', f.mensalidade)).length,
        1,
    );
    assert.equal(
        (
            await connection('registros_auditoria').where({
                organizacao_id: f.org,
                acao: 'FINANCEIRO.RECEBIMENTO_REGISTRADO',
            })
        ).length,
        1,
    );
    assert.equal((await f.service.consultarPublica(tokenOf(charge))).checkout_url, null);
});

test('retorno falso ou pertencente a outra cobrança não recebe baixa', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const ids = await identifiers(charge);
    f.evidence({ success: true, paid: false });
    await f.service.confirmarPublica(tokenOf(charge), ids);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 0);
    await assert.rejects(
        f.service.confirmarPublica(tokenOf(charge), { ...ids, order_nsu: 'another-charge' }),
    );
});

test('pagamento após baixa manual fica em revisão sem somar novamente', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    await connection('pagamentos').insert({
        organizacao_id: f.org,
        conta_receber_id: f.conta,
        valor: '100.00',
        forma_pagamento: 'DINHEIRO',
        origem: 'MANUAL',
        pago_em: clock,
    });
    await connection('contas_receber').where('id', f.conta).update({ status: 'PAGO' });
    await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal((await f.service.consultarPublica(tokenOf(charge))).status, 'PAGO_EM_REVISAO');
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
    assert.equal(
        (await connection('transacoes_pagamento').where('organizacao_id', f.org).first()).status,
        'REVISAO',
    );
});

test('agendamento gera na janela de 2 dias, recupera execução perdida e não gera vencidas', async (t) => {
    const f = await fixture(t);
    await f.service.atualizarConfiguracao(
        f.context,
        { geracao_automatica: true, dias_antecedencia: 1 },
        'https://plataforma.example',
    );
    await f.service.executarCiclo();
    assert.equal(f.creates, 0);
    await f.service.atualizarConfiguracao(
        f.context,
        { dias_antecedencia: 2 },
        'https://plataforma.example',
    );
    await Promise.all([f.service.executarCiclo(), f.service.executarCiclo()]);
    assert.equal(f.creates, 1);
    await f.service.executarCiclo();
    assert.equal(f.creates, 1);
});

test('timeout de criação não repete POST links e mantém cobrança incerta', async (t) => {
    const f = await fixture(t);
    f.failCreate();
    const first = await f.service.gerarCobranca(f.context, f.mensalidade);
    const again = await f.service.gerarCobranca(f.context, f.mensalidade);
    await f.service.executarCiclo();
    assert.equal(first.id, again.id);
    assert.equal(again.status, 'CRIACAO_INCERTA');
    assert.equal(f.creates, 1);
});

test('desativar ou trocar a credencial preserva verificação da cobrança existente', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    await f.service.atualizarConfiguracao(
        f.context,
        { ativo: false, api_key: 'inchk_another_key' },
        'https://plataforma.example',
    );
    await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal(f.checkKeys[0], 'inchk_test_only');
    assert.equal((await f.service.consultarPublica(tokenOf(charge))).status, 'PAGO_VERIFICADO');
});

test('pagamento oficial com valor divergente bloqueia o checkout e fica para revisão', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    f.evidence({
        success: true,
        paid: true,
        amount: 9000,
        paid_amount: 9000,
        capture_method: 'pix',
        installments: 1,
    });
    const result = await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal(result.status, 'PAGO_EM_REVISAO');
    assert.equal(result.checkout_url, null);
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 0);
    const event = await connection('eventos_webhook').where('organizacao_id', f.org).first();
    assert.equal(event.status, 'REVISAO');
    assert.equal(event.resultado.amount, 9000);
});

test('desativar pausa criação persistida e reativar recupera sem perder a cobrança', async (t) => {
    const f = await fixture(t);
    const id = randomUUID();
    await connection('cobrancas_pagamento').insert({
        id,
        organizacao_id: f.org,
        conta_receber_id: f.conta,
        provedor: 'INFINITEPAY',
        identificador_externo: `mensalidades-${id}`,
        tipo: 'CHECKOUT',
        status: 'AGUARDANDO_CRIACAO',
        valor: '100.00',
        expira_em: '2026-11-28T02:59:59Z',
        handle_snapshot: 'lojista',
        credencial_snapshot: cifrarSegredo('inchk_test_only', key, `infinitepay:${f.org}:lojista`),
        token_criptografado: cifrarSegredo('x'.repeat(43), key, `cobranca:${f.org}:${id}`),
        token_hash: randomUUID(),
        payload_checkout: {
            redirect_url: 'https://plataforma.example/pagamento/retorno',
            items: [{ price: 10000, quantity: 1, description: 'Mensalidade' }],
        },
    });
    await f.service.atualizarConfiguracao(
        f.context,
        { ativo: false },
        'https://plataforma.example',
    );
    await f.service.executarCiclo();
    assert.equal(f.creates, 0);
    await f.service.atualizarConfiguracao(f.context, { ativo: true }, 'https://plataforma.example');
    await f.service.executarCiclo();
    assert.equal(f.creates, 1);
    assert.equal((await f.service.consultarCobranca(f.context, f.mensalidade))!.id, id);
});

test('lease vencido de evento é recuperado e outra transação paga não duplica a baixa', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const ids = await identifiers(charge);
    const event = await f.service.receberSinal(ids, 'WEBHOOK');
    await connection('eventos_webhook').where('id', event.id).update({
        status: 'PROCESSANDO',
        lease_ate: '2026-11-25T11:59:00Z',
        lease_token: randomUUID(),
    });
    await f.service.processarEventos();
    await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal((await connection('pagamentos').where('organizacao_id', f.org)).length, 1);
    const transactions = await connection('transacoes_pagamento').where('organizacao_id', f.org);
    assert.deepEqual(transactions.map((row) => row.status).sort(), ['APLICADO', 'REVISAO']);
});

test('webhook de estorno sem assinatura não reverte nem confirma pagamento', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const ids = await identifiers(charge);
    await f.service.receberSinal({ ...ids, event_type: 'refunded' }, 'WEBHOOK');
    await f.service.processarEventos();
    assert.equal(f.checks, 0);
    assert.equal(
        (await f.service.consultarPublica(tokenOf(charge))).status,
        'AGUARDANDO_PAGAMENTO',
    );
    await assert.rejects(
        f.service.confirmarPublica(tokenOf(charge), { ...ids, event_type: 'refunded' }),
    );
});

test('nova entrega legítima recupera evento esgotado após indisponibilidade', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    const ids = await identifiers(charge);
    const event = await f.service.receberSinal(ids, 'WEBHOOK');
    await connection('eventos_webhook')
        .where('id', event.id)
        .update({ status: 'FALHOU', tentativas: 8, disponivel_em: '2026-11-25T11:59:00Z' });
    await f.service.receberSinal(ids, 'WEBHOOK');
    await f.service.processarEventos();
    assert.equal((await f.service.consultarPublica(tokenOf(charge))).status, 'PAGO_VERIFICADO');
});

test('configuração pode ser salva desligada sem InfiniteTag nem credencial', async (t) => {
    const f = await fixture(t);
    const saved = await f.service.atualizarConfiguracao(
        f.context,
        { ativo: false, handle: null },
        'https://plataforma.example',
    );
    assert.equal(saved.ativo, false);
    assert.equal(saved.handle, null);
    assert.equal(saved.has_api_key, false);
});

test('débitos abaixo do mínimo não bloqueiam a fila de geração automática', async (t) => {
    for (let i = 0; i < 10; i++) {
        const small = await fixture(t, '2026-11-25');
        await connection('mensalidades')
            .where('id', small.mensalidade)
            .update({ valor_final: '0.50' });
        await connection('contas_receber').where('id', small.conta).update({ valor_final: '0.50' });
        await small.service.atualizarConfiguracao(
            small.context,
            { geracao_automatica: true },
            'https://plataforma.example',
        );
    }
    const f = await fixture(t);
    await f.service.atualizarConfiguracao(
        f.context,
        { geracao_automatica: true },
        'https://plataforma.example',
    );
    await f.service.executarCiclo();
    assert.equal(f.creates, 1);
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))!.status,
        'AGUARDANDO_PAGAMENTO',
    );
});

test('limite de consultas públicas não bloqueia entrega do webhook no mesmo proxy', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    let lastStatus = 0;
    for (let i = 0; i < 301; i++)
        lastStatus = (await request(app).get(`/api/v1/pagamentos/publico/${'A'.repeat(43)}`))
            .status;
    assert.equal(lastStatus, 429);
    const hook = await request(app)
        .post('/api/v1/pagamentos/webhook/infinitepay')
        .send(await identifiers(charge));
    assert.equal(hook.status, 200);
    assert.equal(hook.headers['referrer-policy'], 'no-referrer');
    assert.match(String(hook.headers['cache-control']), /no-store/);
    const unauthenticated = await request(app).get('/api/v1/financeiro/infinitepay/configuracao');
    assert.equal(unauthenticated.status, 401);
});

test('confirmação tardia de cobrança expirada quita dívida válida; conta cancelada exige revisão', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    await connection('cobrancas_pagamento')
        .where('id', charge.id)
        .update({ status: 'EXPIRADO', expira_em: '2026-11-25T11:00:00Z' });
    const late = await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal(late.status, 'PAGO_VERIFICADO');
    const canceled = await fixture(t);
    const canceledCharge = await canceled.service.gerarCobranca(
        canceled.context,
        canceled.mensalidade,
    );
    await connection('contas_receber')
        .where('id', canceled.conta)
        .update({ status: 'CANCELADO', cancelado_em: clock });
    await canceled.service.confirmarPublica(
        tokenOf(canceledCharge),
        await identifiers(canceledCharge),
    );
    assert.equal((await connection('pagamentos').where('organizacao_id', canceled.org)).length, 0);
    assert.equal(
        (await connection('transacoes_pagamento').where('organizacao_id', canceled.org).first())
            .status,
        'REVISAO',
    );
});

test('reinício com criação em andamento registra incerteza sem reenviar links', async (t) => {
    const f = await fixture(t);
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    await connection('cobrancas_pagamento').where('id', charge.id).update({
        status: 'CRIANDO',
        checkout_url: null,
        criacao_iniciada_em: '2026-11-25T11:58:00Z',
    });
    await f.service.executarCiclo();
    assert.equal(f.creates, 1);
    assert.equal(
        (await f.service.consultarCobranca(f.context, f.mensalidade))!.status,
        'CRIACAO_INCERTA',
    );
});

test('checkout envia contatos do cliente normalizados sem persistir cópia de dados pessoais', async (t) => {
    const f = await fixture(t);
    await connection('clientes')
        .where('id', f.cliente)
        .update({
            nome: '  Maria  Teste ',
            email: ' CLIENTE@EXAMPLE.COM ',
            telefone: '(11) 99999-9999',
            observacao: 'Informação clínica privada',
        });
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.deepEqual(f.payload.customer, {
        name: 'Maria Teste',
        email: 'cliente@example.com',
        phone_number: '+5511999999999',
    });
    assert.deepEqual(f.payload.items, [
        { quantity: 1, price: 10000, description: 'Mensalidade 2026-11' },
    ]);
    assert.equal(JSON.stringify(f.payload).includes('inchk_'), false);
    assert.equal(JSON.stringify(f.payload).includes('clínica'), false);
    assert.equal(JSON.stringify(f.payload).includes('cpf'), false);
    const stored = await connection('cobrancas_pagamento').where('id', charge.id).first();
    assert.equal(Object.hasOwn(stored.payload_checkout, 'customer'), false);
    const publicData = await f.service.consultarPublica(tokenOf(charge));
    assert.equal(JSON.stringify(publicData).includes('cliente@example.com'), false);
});

test('checkout aceita contatos opcionais ausentes ou inválidos sem inventar preenchimento', async (t) => {
    for (const input of [
        { email: null, telefone: null },
        { email: 'inválido', telefone: '99999999' },
    ]) {
        const f = await fixture(t);
        await connection('clientes')
            .where('id', f.cliente)
            .update({ nome: 'Cliente Teste', ...input });
        await f.service.gerarCobranca(f.context, f.mensalidade);
        assert.deepEqual(f.payload.customer, { name: 'Cliente Teste' });
    }
});

test('checkout sem dados válidos omite customer e mantém confirmação financeira', async (t) => {
    const f = await fixture(t);
    await connection('clientes')
        .where('id', f.cliente)
        .update({ nome: '', email: null, telefone: null });
    const charge = await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.equal(Object.hasOwn(f.payload, 'customer'), false);
    const result = await f.service.confirmarPublica(tokenOf(charge), await identifiers(charge));
    assert.equal(result.status, 'PAGO_VERIFICADO');
});

test('vínculo inconsistente com cliente de outro tenant nunca compartilha seus dados', async (t) => {
    const f = await fixture(t),
        other = await fixture(t);
    await connection('clientes')
        .where('id', other.cliente)
        .update({ nome: 'Outro Tenant', email: 'outro@example.com', telefone: '11988887777' });
    await connection('contas_receber').where('id', f.conta).update({ cliente_id: other.cliente });
    await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.equal(Object.hasOwn(f.payload, 'customer'), false);
    assert.equal(JSON.stringify(f.payload).includes('Outro Tenant'), false);
    assert.equal(JSON.stringify(f.payload).includes('outro@example.com'), false);
});

test('tenant diferente não gera cobrança nem consulta dados de cliente alheio', async (t) => {
    const f = await fixture(t),
        other = await fixture(t);
    await assert.rejects(f.service.gerarCobranca(other.context, f.mensalidade));
    assert.equal(f.creates, 0);
    assert.deepEqual(f.payload, {});
});

test('alterar contato após gerar checkout não recria link nem muda a cobrança idempotente', async (t) => {
    const f = await fixture(t);
    await connection('clientes')
        .where('id', f.cliente)
        .update({ nome: 'Nome Original', email: 'original@example.com' });
    const first = await f.service.gerarCobranca(f.context, f.mensalidade);
    await connection('clientes')
        .where('id', f.cliente)
        .update({ nome: 'Nome Atualizado', email: 'atualizado@example.com' });
    const repeated = await f.service.gerarCobranca(f.context, f.mensalidade);
    assert.equal(first.id, repeated.id);
    assert.equal(f.creates, 1);
    assert.deepEqual(f.payload.customer, { name: 'Nome Original', email: 'original@example.com' });
    assert.equal(repeated.valor, '100.00');
});
