import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import connection from '../../../src/database/connection.js';
import { SimulatedWhatsAppProvider } from '../../../src/modules/whatsapp/whatsapp.adapter.js';
import type {
    FinanceiroWhatsappProvider,
    SnapshotMensalidadeWhatsapp,
    WhatsAppProvider,
} from '../../../src/modules/whatsapp/whatsapp.contracts.js';
import {
    FalhaProviderWhatsAppTemporaria,
    processarFilaWhatsapp,
} from '../../../src/modules/whatsapp/whatsapp.worker.js';
import whatsappRepository from '../../../src/modules/whatsapp/whatsapp.repository.js';
import { agendarLembretesMensalidade } from '../../../src/modules/whatsapp/whatsapp.scheduler.js';
import { processarEventoStatusMetaVerificado } from '../../../src/modules/whatsapp/whatsapp.webhook.service.js';

const ids = {
    organizacao: crypto.randomUUID(),
    outraOrganizacao: crypto.randomUUID(),
    area: crypto.randomUUID(),
    cliente: crypto.randomUUID(),
    plano: crypto.randomUUID(),
};

const agora = new Date('2026-12-01T15:00:00.000Z');

async function limpar() {
    await connection('integracoes_whatsapp').where({ organizacao_id: ids.outraOrganizacao }).del();
    await connection('organizacoes').where({ id: ids.outraOrganizacao }).del();
    await connection('webhook_eventos_whatsapp').where({ organizacao_id: ids.organizacao }).del();
    await connection('mensagens').where({ organizacao_id: ids.organizacao }).del();
    await connection('tarefas_mensagem').where({ organizacao_id: ids.organizacao }).del();
    await connection('modelos_mensagem').where({ organizacao_id: ids.organizacao }).del();
    await connection('integracoes_whatsapp').where({ organizacao_id: ids.organizacao }).del();
    await connection('mensalidades').where({ organizacao_id: ids.organizacao }).del();
    await connection('contas_receber').where({ organizacao_id: ids.organizacao }).del();
    await connection('assinaturas').where({ organizacao_id: ids.organizacao }).del();
    await connection('planos_comerciais').where({ organizacao_id: ids.organizacao }).del();
    await connection('clientes_areas').where({ cliente_id: ids.cliente }).del();
    await connection('clientes').where({ id: ids.cliente }).del();
    await connection('areas_negocio').where({ id: ids.area }).del();
    await connection('organizacoes').where({ id: ids.organizacao }).del();
}

before(async () => {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Worker WhatsApp exige o banco exclusivo de testes.');
    }

    await connection('organizacoes').insert({
        id: ids.organizacao,
        nome: `Worker WhatsApp ${ids.organizacao}`,
        ativo: true,
    });
    await connection('organizacoes').insert({
        id: ids.outraOrganizacao,
        nome: `Worker WhatsApp outra ${ids.outraOrganizacao}`,
        ativo: true,
    });
    await connection('areas_negocio').insert({
        id: ids.area,
        organizacao_id: ids.organizacao,
        nome: 'Worker WhatsApp',
        codigo: `WW-${ids.area.slice(0, 8)}`,
        ativo: true,
    });
    await connection('clientes').insert({
        id: ids.cliente,
        organizacao_id: ids.organizacao,
        nome: 'Cliente Fixture',
        telefone: '+5511999999999',
        aceite_whatsapp: true,
        aceite_whatsapp_em: '2026-01-01T12:00:00.000Z',
        origem_aceite_whatsapp: 'TESTE_FIXTURE',
        ativo: true,
    });
    await connection('clientes_areas').insert({
        cliente_id: ids.cliente,
        area_negocio_id: ids.area,
        ativo: true,
    });
    await connection('planos_comerciais').insert({
        id: ids.plano,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        nome: 'Plano fixture',
        valor_base: '100.00',
        periodicidade: 'MENSAL',
        ativo: true,
    });
    await connection('integracoes_whatsapp').insert({
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        provedor: 'META_CLOUD_API',
        ativo: true,
        whatsapp_business_account_id: 'waba-test-fixture',
        phone_number_id: 'phone-test-fixture',
        numero_exibido: '+5511888888888',
        nome_negocio: 'Orbe Teste',
        situacao_conexao: 'ATIVO',
        situacao_autorizacao: 'AUTORIZADO',
        credencial_referencia: 'vault://fixture-only',
        situacao_templates: 'VALIDADO',
        ativada_em: agora,
        ultima_validacao_em: agora,
    });
    await connection('modelos_mensagem').insert([
        {
            organizacao_id: ids.organizacao,
            area_negocio_id: ids.area,
            tipo: 'D-1',
            nome: 'Template fixture D-1',
            chave: 'cobranca_vespera',
            conteudo:
                'Olá, {{cliente}}! Sua mensalidade de {{empresa}}, no valor de {{valor}}, vence amanhã, {{vencimento}}. Para pagar: {{link_pagamento}}.',
            ativo: true,
            nome_template_meta: 'cobranca_vespera_fixture',
            idioma_meta: 'pt_BR',
            categoria_meta: 'UTILITY',
            status_meta: 'APROVADO',
            aprovado_em: agora,
        },
        {
            organizacao_id: ids.organizacao,
            area_negocio_id: ids.area,
            tipo: 'D0',
            nome: 'Template fixture D0',
            chave: 'cobranca_vencimento',
            conteudo:
                'Olá, {{cliente}}! Sua mensalidade de {{empresa}} vence hoje. Valor em aberto: {{valor}}. Link para pagamento: {{link_pagamento}}.',
            ativo: true,
            nome_template_meta: 'cobranca_vencimento_fixture',
            idioma_meta: 'pt_BR',
            categoria_meta: 'UTILITY',
            status_meta: 'APROVADO',
            aprovado_em: agora,
        },
    ]);
});

after(async () => {
    await limpar();
    await connection.destroy();
});

let sequencia = 0;

async function criarMensalidadeETarefa(tipo = 'D-1', executarEm = agora) {
    sequencia += 1;
    const assinaturaId = crypto.randomUUID();
    const contaReceberId = crypto.randomUUID();
    const mensalidadeId = crypto.randomUUID();
    const mesCompetencia = ((sequencia - 1) % 12) + 1;
    const anoCompetencia = 2026 + Math.floor((sequencia - 1) / 12);
    const competencia = `${anoCompetencia}-${String(mesCompetencia).padStart(2, '0')}-01`;

    await connection('assinaturas').insert({
        id: assinaturaId,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        cliente_id: ids.cliente,
        plano_comercial_id: ids.plano,
        valor_contratado: '100.00',
        dia_vencimento: 10,
        inicio_em: '2026-01-01',
        status: 'ATIVA',
    });

    await connection('contas_receber').insert({
        id: contaReceberId,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        cliente_id: ids.cliente,
        origem_tipo: 'MENSALIDADE',
        origem_id: crypto.randomUUID(),
        descricao: 'Mensalidade fixture',
        valor_original: '100.00',
        desconto: '0.00',
        acrescimo: '0.00',
        valor_final: '100.00',
        vencimento_em: '2026-12-10',
        status: 'PENDENTE',
    });
    await connection('mensalidades').insert({
        id: mensalidadeId,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        assinatura_id: assinaturaId,
        conta_receber_id: contaReceberId,
        competencia,
        valor_base: '100.00',
        desconto_recorrente: '0.00',
        ajuste_competencia: '0.00',
        valor_final: '100.00',
        vencimento_em: '2026-12-10',
    });

    const tarefaId = crypto.randomUUID();
    await connection('tarefas_mensagem').insert({
        id: tarefaId,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        cliente_id: ids.cliente,
        mensalidade_id: mensalidadeId,
        conta_receber_id: null,
        modelo_mensagem_id: null,
        tipo: `WHATSAPP_COBRANCA_${tipo}`,
        lembrete_tipo: tipo,
        ciclo_financeiro: competencia.slice(0, 7),
        status: 'PENDENTE',
        executar_em: executarEm,
        tentativas: 0,
        max_tentativas: 3,
    });

    return { tarefaId, mensalidadeId, competencia };
}

function financeiro(
    mensalidadeId: string,
    overrides: Partial<SnapshotMensalidadeWhatsapp> = {},
): FinanceiroWhatsappProvider {
    return {
        async obterMensalidadeAtual() {
            return {
                mensalidadeId,
                organizacaoId: ids.organizacao,
                areaNegocioId: ids.area,
                clienteId: ids.cliente,
                competencia: '2026-12-01',
                valorTotal: '100.00',
                valorPago: '0.00',
                saldoAtual: '100.00',
                vencimentoEm: '2026-12-10',
                situacao: 'ABERTO',
                checkoutUrl: 'https://checkout.example.test/fixture',
                checkoutValor: '100.00',
                reconciliacaoPendente: false,
                versao: 'fixture-v1',
                ...overrides,
            };
        },
    };
}

class ProviderControl extends SimulatedWhatsAppProvider {
    chamadas = 0;
    falha: Error | null = null;

    override async enviarTemplate(input: Parameters<WhatsAppProvider['enviarTemplate']>[0]) {
        this.chamadas += 1;
        if (this.falha) throw this.falha;
        return super.enviarTemplate(input);
    }
}

test('worker simulado é concorrente, revalida pagamento/consentimento e controla retries incertos', async () => {
    const provider = new ProviderControl();

    const concorrente = await criarMensalidadeETarefa();
    const args = {
        financeiro: financeiro(concorrente.mensalidadeId),
        provider,
        limite: 1,
        agora: () => agora,
    };
    const [execucaoA, execucaoB] = await Promise.all([
        processarFilaWhatsapp(args),
        processarFilaWhatsapp(args),
    ]);
    assert.equal(execucaoA.simuladas + execucaoB.simuladas, 1);
    assert.equal(provider.chamadas, 1);
    const mensagemEnviada = await connection('mensagens')
        .where({ tarefa_mensagem_id: concorrente.tarefaId })
        .first();
    assert.equal(mensagemEnviada.status, 'ENVIADA');
    assert.equal(mensagemEnviada.modo_processamento, 'SIMULADO');

    const agendada = await criarMensalidadeETarefa('D-1', new Date(agora.getTime() + 60_000));
    const snapshotAgendamento: SnapshotMensalidadeWhatsapp = {
        mensalidadeId: agendada.mensalidadeId,
        organizacaoId: ids.organizacao,
        areaNegocioId: ids.area,
        clienteId: ids.cliente,
        competencia: agendada.competencia,
        valorTotal: '100.00',
        valorPago: '0.00',
        saldoAtual: '100.00',
        vencimentoEm: '2026-12-10',
        situacao: 'ABERTO',
        checkoutUrl: 'https://checkout.example.test/fixture',
        checkoutValor: '100.00',
        reconciliacaoPendente: false,
        versao: 'fixture-v1',
    };
    const [agendaA, agendaB] = await Promise.all([
        agendarLembretesMensalidade(snapshotAgendamento, whatsappRepository, agora),
        agendarLembretesMensalidade(snapshotAgendamento, whatsappRepository, agora),
    ]);
    assert.equal(agendaA.criadas + agendaB.criadas, 2);
    assert.equal(
        await connection('tarefas_mensagem')
            .where({ organizacao_id: ids.organizacao, mensalidade_id: agendada.mensalidadeId })
            .count('* as total')
            .first()
            .then((linha) => Number(linha?.total ?? 0)),
        3,
    );

    const eventoWebhook = await criarMensalidadeETarefa();
    const externalId = `wamid.${crypto.randomUUID()}`;
    await connection('tarefas_mensagem')
        .where({ id: eventoWebhook.tarefaId })
        .update({ status: 'ENVIADA' });
    await connection('mensagens').insert({
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        tarefa_mensagem_id: eventoWebhook.tarefaId,
        mensalidade_id: eventoWebhook.mensalidadeId,
        cliente_id: ids.cliente,
        canal: 'WHATSAPP',
        destinatario: '+5511999999999',
        tipo: 'WHATSAPP_COBRANCA_D-1',
        status: 'ENVIADA',
        identificador_externo: externalId,
        enviado_em: agora,
        provedor: 'META_CLOUD_API',
        nome_template_meta: 'cobranca_vespera_fixture',
        categoria_template: 'UTILITY',
        modo_processamento: 'META',
        tentativa: 1,
    });
    const secretWebhook = 'secret-whatsapp-fixture';
    const payloadEntregue = Buffer.from(
        JSON.stringify({
            entry: [
                {
                    id: 'waba-test-fixture',
                    changes: [
                        {
                            value: {
                                metadata: { phone_number_id: 'phone-test-fixture' },
                                statuses: [
                                    {
                                        id: externalId,
                                        status: 'delivered',
                                        timestamp: String(Math.floor(agora.valueOf() / 1000)),
                                        recipient_id: '5511999999999',
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        }),
    );
    const assinaturaWebhook = `sha256=${crypto.createHmac('sha256', secretWebhook).update(payloadEntregue).digest('hex')}`;
    const argumentosWebhook = {
        corpoBruto: payloadEntregue,
        assinatura: assinaturaWebhook,
        appSecret: secretWebhook,
    };

    // Se o mesmo número estiver registrado em outra organização, o roteamento é ambíguo e não grava.
    await connection('integracoes_whatsapp').insert({
        organizacao_id: ids.outraOrganizacao,
        provedor: 'META_CLOUD_API',
        whatsapp_business_account_id: 'waba-test-fixture',
        phone_number_id: 'phone-test-fixture',
        ativo: true,
    });
    const organizacaoAmbigua = await processarEventoStatusMetaVerificado(argumentosWebhook);
    assert.equal(organizacaoAmbigua[0]?.ignorado, true);
    assert.equal(
        await connection('webhook_eventos_whatsapp')
            .where({ organizacao_id: ids.organizacao })
            .count('* as total')
            .first()
            .then((row) => Number(row?.total)),
        0,
    );
    await connection('integracoes_whatsapp').where({ organizacao_id: ids.outraOrganizacao }).del();

    const corpoDestinatarioDivergente = Buffer.from(
        payloadEntregue.toString('utf8').replace('5511999999999', '5511000000000'),
    );
    const destinatarioDivergente = await processarEventoStatusMetaVerificado({
        ...argumentosWebhook,
        corpoBruto: corpoDestinatarioDivergente,
        assinatura: `sha256=${crypto.createHmac('sha256', secretWebhook).update(corpoDestinatarioDivergente).digest('hex')}`,
    });
    assert.equal(destinatarioDivergente[0]?.ignorado, true);
    assert.equal(
        await connection('webhook_eventos_whatsapp')
            .where({ organizacao_id: ids.organizacao })
            .count('* as total')
            .first()
            .then((row) => Number(row?.total)),
        0,
    );

    const primeiroEvento = await processarEventoStatusMetaVerificado(argumentosWebhook);
    const eventoRepetido = await processarEventoStatusMetaVerificado(argumentosWebhook);
    assert.equal(primeiroEvento[0]?.aplicado, true);
    assert.equal(eventoRepetido[0]?.duplicado, true);

    const payloadStatusAntigo = Buffer.from(
        payloadEntregue.toString('utf8').replace('delivered', 'sent'),
    );
    const statusAntigo = await processarEventoStatusMetaVerificado({
        ...argumentosWebhook,
        corpoBruto: payloadStatusAntigo,
        assinatura: `sha256=${crypto.createHmac('sha256', secretWebhook).update(payloadStatusAntigo).digest('hex')}`,
    });
    assert.equal(statusAntigo[0]?.aplicado, false);
    assert.equal(statusAntigo[0]?.duplicado, false);

    const payloadFalhaAntiga = Buffer.from(
        payloadEntregue.toString('utf8').replace('delivered', 'failed'),
    );
    const falhaAntiga = await processarEventoStatusMetaVerificado({
        ...argumentosWebhook,
        corpoBruto: payloadFalhaAntiga,
        assinatura: `sha256=${crypto.createHmac('sha256', secretWebhook).update(payloadFalhaAntiga).digest('hex')}`,
    });
    assert.equal(falhaAntiga[0]?.aplicado, false);
    await assert.rejects(
        processarEventoStatusMetaVerificado({
            ...argumentosWebhook,
            assinatura: 'sha256=' + '0'.repeat(64),
        }),
    );
    assert.equal(
        (await connection('mensagens').where({ identificador_externo: externalId }).first()).status,
        'ENTREGUE',
    );
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: eventoWebhook.tarefaId }).first()).status,
        'ENTREGUE',
    );
    await connection('tarefas_mensagem')
        .where({ id: eventoWebhook.tarefaId })
        .update({ status: 'CANCELADA' });
    const payloadLido = Buffer.from(payloadEntregue.toString('utf8').replace('delivered', 'read'));
    await processarEventoStatusMetaVerificado({
        ...argumentosWebhook,
        corpoBruto: payloadLido,
        assinatura: `sha256=${crypto.createHmac('sha256', secretWebhook).update(payloadLido).digest('hex')}`,
    });
    assert.equal(
        (await connection('mensagens').where({ identificador_externo: externalId }).first()).status,
        'LIDA',
    );
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: eventoWebhook.tarefaId }).first()).status,
        'CANCELADA',
    );

    const pagoEntreLembretes = await criarMensalidadeETarefa('D-1', agora);
    const tarefaD0 = crypto.randomUUID();
    await connection('tarefas_mensagem').insert({
        id: tarefaD0,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        cliente_id: ids.cliente,
        mensalidade_id: pagoEntreLembretes.mensalidadeId,
        tipo: 'WHATSAPP_COBRANCA_D0',
        lembrete_tipo: 'D0',
        ciclo_financeiro: pagoEntreLembretes.competencia.slice(0, 7),
        status: 'PENDENTE',
        executar_em: new Date(agora.getTime() + 1_000),
        tentativas: 0,
        max_tentativas: 3,
    });
    const tarefaDmais3 = crypto.randomUUID();
    await connection('tarefas_mensagem').insert({
        id: tarefaDmais3,
        organizacao_id: ids.organizacao,
        area_negocio_id: ids.area,
        cliente_id: ids.cliente,
        mensalidade_id: pagoEntreLembretes.mensalidadeId,
        tipo: 'WHATSAPP_COBRANCA_D3',
        lembrete_tipo: 'D+3',
        ciclo_financeiro: pagoEntreLembretes.competencia.slice(0, 7),
        status: 'PENDENTE',
        executar_em: new Date(agora.getTime() + 2_000),
        tentativas: 0,
        max_tentativas: 3,
    });
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(pagoEntreLembretes.mensalidadeId),
    });
    const totalAposD1 = provider.chamadas;
    const estadoQuitado = financeiro(pagoEntreLembretes.mensalidadeId, {
        situacao: 'QUITADO',
        valorPago: '100.00',
        saldoAtual: '0.00',
        checkoutUrl: null,
        checkoutValor: null,
    });
    await processarFilaWhatsapp({
        ...args,
        financeiro: estadoQuitado,
        agora: () => new Date(agora.getTime() + 2_000),
    });
    assert.equal(provider.chamadas, totalAposD1);
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: tarefaD0 }).first()).status,
        'CANCELADA',
    );
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: tarefaDmais3 }).first()).status,
        'CANCELADA',
    );

    const semConsentimento = await criarMensalidadeETarefa();
    await connection('clientes').where({ id: ids.cliente }).update({ aceite_whatsapp: false });
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(semConsentimento.mensalidadeId),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: semConsentimento.tarefaId }).first())
            .status,
        'CANCELADA',
    );
    await connection('clientes').where({ id: ids.cliente }).update({ aceite_whatsapp: true });

    const clienteInativo = await criarMensalidadeETarefa();
    await connection('clientes').where({ id: ids.cliente }).update({ ativo: false });
    await processarFilaWhatsapp({ ...args, financeiro: financeiro(clienteInativo.mensalidadeId) });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: clienteInativo.tarefaId }).first())
            .status,
        'CANCELADA',
    );
    await connection('clientes').where({ id: ids.cliente }).update({ ativo: true });

    const telefoneInvalido = await criarMensalidadeETarefa();
    await connection('clientes')
        .where({ id: ids.cliente })
        .update({ telefone: 'telefone inválido' });
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(telefoneInvalido.mensalidadeId),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: telefoneInvalido.tarefaId }).first())
            .status,
        'FALHOU',
    );
    await connection('clientes').where({ id: ids.cliente }).update({ telefone: '+5511999999999' });

    const escopoDivergente = await criarMensalidadeETarefa();
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(escopoDivergente.mensalidadeId, {
            organizacaoId: crypto.randomUUID(),
        }),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: escopoDivergente.tarefaId }).first())
            .status,
        'CANCELADA',
    );

    const mensalidadeCancelada = await criarMensalidadeETarefa();
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(mensalidadeCancelada.mensalidadeId, { situacao: 'CANCELADO' }),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: mensalidadeCancelada.tarefaId }).first())
            .status,
        'CANCELADA',
    );

    const reconciliacao = await criarMensalidadeETarefa();
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(reconciliacao.mensalidadeId, {
            situacao: 'RECONCILIACAO_PENDENTE',
            reconciliacaoPendente: true,
        }),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: reconciliacao.tarefaId }).first()).status,
        'FALHOU',
    );

    const remetenteDesativado = await criarMensalidadeETarefa();
    await connection('integracoes_whatsapp')
        .where({ organizacao_id: ids.organizacao })
        .update({ ativo: false });
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(remetenteDesativado.mensalidadeId),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: remetenteDesativado.tarefaId }).first())
            .status,
        'FALHOU',
    );
    await connection('integracoes_whatsapp')
        .where({ organizacao_id: ids.organizacao })
        .update({ ativo: true });

    const templatePausado = await criarMensalidadeETarefa();
    await connection('modelos_mensagem')
        .where({ organizacao_id: ids.organizacao, chave: 'cobranca_vespera' })
        .update({ status_meta: 'PAUSADO' });
    await processarFilaWhatsapp({ ...args, financeiro: financeiro(templatePausado.mensalidadeId) });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: templatePausado.tarefaId }).first())
            .status,
        'FALHOU',
    );
    await connection('modelos_mensagem')
        .where({ organizacao_id: ids.organizacao, chave: 'cobranca_vespera' })
        .update({ status_meta: 'APROVADO' });

    const linkIncompatível = await criarMensalidadeETarefa();
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(linkIncompatível.mensalidadeId, {
            situacao: 'PARCIAL',
            valorPago: '40.00',
            saldoAtual: '60.00',
            checkoutValor: '100.00',
        }),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: linkIncompatível.tarefaId }).first())
            .status,
        'FALHOU',
    );

    const resultadoIncerto = await criarMensalidadeETarefa();
    provider.falha = new Error('conexão perdida após possível aceitação');
    const chamadasAntesIncerteza = provider.chamadas;
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(resultadoIncerto.mensalidadeId),
    });
    assert.equal(
        (await connection('tarefas_mensagem').where({ id: resultadoIncerto.tarefaId }).first())
            .status,
        'RESULTADO_INCERTO',
    );
    await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(resultadoIncerto.mensalidadeId),
    });
    assert.equal(provider.chamadas, chamadasAntesIncerteza + 1);

    const falhaTemporaria = await criarMensalidadeETarefa();
    provider.falha = new FalhaProviderWhatsAppTemporaria('temporário');
    const reprocessamento = await processarFilaWhatsapp({
        ...args,
        financeiro: financeiro(falhaTemporaria.mensalidadeId),
    });
    const tarefaReagendada = await connection('tarefas_mensagem')
        .where({ id: falhaTemporaria.tarefaId })
        .first();
    assert.equal(reprocessamento.reagendadas, 1);
    assert.equal(tarefaReagendada.status, 'PENDENTE');
    assert.ok(new Date(tarefaReagendada.executar_em).valueOf() > agora.valueOf());
    provider.falha = null;
});
