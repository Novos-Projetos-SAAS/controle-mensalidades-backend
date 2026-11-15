import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
    SimulatedWhatsAppProvider,
    MetaCloudApiDisabledProvider,
} from '../../../src/modules/whatsapp/whatsapp.adapter.js';
import type {
    MensalidadeParaAgendar,
    TarefaLembreteNova,
} from '../../../src/modules/whatsapp/whatsapp.scheduler.js';
import {
    agendarHorarioLocal,
    agendarLembretesMensalidade,
} from '../../../src/modules/whatsapp/whatsapp.scheduler.js';
import {
    PROPOSTAS_TEMPLATES_WHATSAPP,
    renderizarTemplateCobranca,
} from '../../../src/modules/whatsapp/whatsapp.templates.js';
import {
    criarChaveEventoMeta,
    verificarAssinaturaMeta,
    verificarHandshakeMeta,
    type EventoStatusMeta,
} from '../../../src/modules/whatsapp/whatsapp.webhook.js';

class MemoriaTarefas {
    tarefas: TarefaLembreteNova[] = [];

    async inserirIgnorandoDuplicadas(novas: TarefaLembreteNova[]) {
        let criadas = 0;
        for (const tarefa of novas) {
            const duplicada = this.tarefas.some(
                (atual) =>
                    atual.organizacao_id === tarefa.organizacao_id &&
                    atual.area_negocio_id === tarefa.area_negocio_id &&
                    atual.cliente_id === tarefa.cliente_id &&
                    atual.mensalidade_id === tarefa.mensalidade_id &&
                    atual.lembrete_tipo === tarefa.lembrete_tipo &&
                    atual.ciclo_financeiro === tarefa.ciclo_financeiro,
            );
            if (!duplicada) {
                this.tarefas.push(tarefa);
                criadas += 1;
            }
        }
        return criadas;
    }
}

function snapshot(overrides: Partial<MensalidadeParaAgendar> = {}): MensalidadeParaAgendar {
    return {
        mensalidadeId: 'mensalidade-fixture',
        organizacaoId: 'org-fixture',
        areaNegocioId: 'area-fixture',
        clienteId: 'cliente-fixture',
        competencia: '2026-02-01',
        vencimentoEm: '2026-02-05',
        valorTotal: '100.00',
        valorPago: '0.00',
        saldoAtual: '100.00',
        checkoutUrl: 'https://checkout.example.test/pay/fixture',
        checkoutValor: '100.00',
        situacao: 'ABERTO',
        reconciliacaoPendente: false,
        ...overrides,
    };
}

test('templates são propostas internas e renderizam só parâmetros definidos', () => {
    assert.deepEqual(
        PROPOSTAS_TEMPLATES_WHATSAPP.map((template) => template.chave),
        ['cobranca_vespera', 'cobranca_vencimento', 'cobranca_atraso_3d'],
    );
    assert.ok(
        PROPOSTAS_TEMPLATES_WHATSAPP.every((template) => template.statusMeta === 'NAO_SUBMETIDO'),
    );
    assert.ok(PROPOSTAS_TEMPLATES_WHATSAPP.every((template) => template.aprovadoMeta === false));

    const parametros = {
        cliente: 'Ana',
        empresa: 'Orbe',
        competencia: '2026-02',
        valor: 'R$ 100,00',
        saldo: 'R$ 100,00',
        vencimento: '05/02/2026',
        link_pagamento: 'https://checkout.example.test/pay/fixture',
    };
    const propostaVespera = PROPOSTAS_TEMPLATES_WHATSAPP[0];
    assert.ok(propostaVespera);
    assert.match(renderizarTemplateCobranca(propostaVespera.conteudo, parametros), /Ana/);
    assert.throws(
        () => renderizarTemplateCobranca('Oi {{token_secreto}}', parametros),
        /TEMPLATE_VARIAVEL_NAO_PERMITIDA|TEMPLATE_INCOMPLETO/,
    );
});

test('agenda D-1, D0 e D+3 às 09:00 no fuso São Paulo e deduplica o ciclo', async () => {
    const armazenamento = new MemoriaTarefas();
    const agora = new Date('2026-02-01T12:00:00.000Z');
    const primeiro = await agendarLembretesMensalidade(snapshot(), armazenamento, agora);

    assert.equal(primeiro.criadas, 3);
    assert.deepEqual(
        armazenamento.tarefas.map((tarefa) => tarefa.lembrete_tipo),
        ['D-1', 'D0', 'D+3'],
    );
    assert.deepEqual(
        armazenamento.tarefas.map((tarefa) => tarefa.executar_em.toISOString()),
        ['2026-02-04T12:00:00.000Z', '2026-02-05T12:00:00.000Z', '2026-02-08T12:00:00.000Z'],
    );
    assert.equal(armazenamento.tarefas[0]?.ciclo_financeiro, '2026-02');
    const repetida = await agendarLembretesMensalidade(snapshot(), armazenamento, agora);
    assert.equal(repetida.criadas, 0);
    assert.equal(armazenamento.tarefas.length, 3);
    assert.equal(agendarHorarioLocal('2026-02-04').toISOString(), '2026-02-04T12:00:00.000Z');
});

test('bloqueia quitada, reconciliação, saldo parcial incompatível e competência inválida', async () => {
    const armazenamento = new MemoriaTarefas();
    const agora = new Date('2026-02-01T12:00:00.000Z');

    for (const dados of [
        snapshot({ situacao: 'QUITADO' }),
        snapshot({ situacao: 'RECONCILIACAO_PENDENTE' }),
        snapshot({
            valorPago: '40.00',
            saldoAtual: '60.00',
            checkoutValor: '100.00',
            situacao: 'PARCIAL',
        }),
        snapshot({ competencia: '2026-99' }),
        snapshot({ checkoutUrl: 'http://checkout.example.test/pay/fixture' }),
    ]) {
        const resultado = await agendarLembretesMensalidade(dados, armazenamento, agora);
        assert.equal(resultado.ignorada, true);
        assert.equal(resultado.criadas, 0);
    }
    assert.equal(armazenamento.tarefas.length, 0);
});

test('não agenda horários já vencidos no momento da criação', async () => {
    const armazenamento = new MemoriaTarefas();
    const resultado = await agendarLembretesMensalidade(
        snapshot(),
        armazenamento,
        new Date('2026-02-08T13:00:00.000Z'),
    );
    assert.equal(resultado.ignorada, true);
    assert.equal(resultado.criadas, 0);
});

test('verifica assinatura e handshake Meta sem expor webhook público', () => {
    const corpo = Buffer.from('{"object":"whatsapp_business_account"}');
    const segredo = 'segredo-de-teste';
    const assinatura = `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
    assert.equal(verificarAssinaturaMeta(corpo, assinatura, segredo), true);
    assert.equal(verificarAssinaturaMeta(corpo, assinatura, 'outro-segredo'), false);
    assert.equal(verificarAssinaturaMeta(corpo, 'sha256=not-hex', segredo), false);
    assert.equal(verificarHandshakeMeta('subscribe', 'token', 'token', 'challenge'), 'challenge');
    assert.equal(verificarHandshakeMeta('subscribe', 'incorreto', 'token', 'challenge'), null);

    const evento: EventoStatusMeta = {
        identificadorExterno: 'wamid.fixture',
        status: 'delivered',
        ocorridoEm: '2026-02-05T12:00:00.000Z',
        destinatario: '+5511999999999',
    };
    assert.equal(criarChaveEventoMeta(evento), criarChaveEventoMeta(evento));
    assert.notEqual(
        criarChaveEventoMeta(evento),
        criarChaveEventoMeta({ ...evento, status: 'read' }),
    );
});

test('adapter simulado não faz envio real e provider Meta permanece desabilitado', async () => {
    const configuracao = {
        organizacaoId: 'org-fixture',
        areaNegocioId: null,
        whatsappBusinessAccountId: 'waba-fixture',
        phoneNumberId: 'phone-fixture',
        numeroExibido: '+5511999999999',
        nomeNegocio: 'Orbe Teste',
        credencial: { referencia: 'vault://fixture' },
    };
    const simulador = new SimulatedWhatsAppProvider();
    const retorno = await simulador.enviarTemplate({
        configuracao,
        destinatarioE164: '+5511888888888',
        nomeTemplateMeta: 'template_fixture',
        idioma: 'pt_BR',
        parametros: {
            cliente: 'Ana',
            empresa: 'Orbe',
            competencia: '2026-02',
            valor: 'R$ 10,00',
            saldo: 'R$ 10,00',
            vencimento: '05/02/2026',
            link_pagamento: 'https://checkout.example.test',
        },
        idempotencyKey: 'fixture-key',
    });
    assert.equal(retorno.simulado, true);
    assert.equal(simulador.mode, 'SIMULADO');

    const metaDesabilitada = new MetaCloudApiDisabledProvider();
    const bloqueado = await metaDesabilitada.enviarTemplate({
        configuracao,
        destinatarioE164: '+5511888888888',
        nomeTemplateMeta: 'template_fixture',
        idioma: 'pt_BR',
        parametros: {
            cliente: 'Ana',
            empresa: 'Orbe',
            competencia: '2026-02',
            valor: 'R$ 10,00',
            saldo: 'R$ 10,00',
            vencimento: '05/02/2026',
            link_pagamento: 'https://checkout.example.test',
        },
        idempotencyKey: 'fixture-key',
    });
    assert.equal(metaDesabilitada.mode, 'META_DESABILITADO');
    assert.equal(bloqueado.simulado, false);
    assert.equal(bloqueado.codigoErro, 'ENVIO_META_DESABILITADO');
});
