import db from '../../database/connection.js';
import { env } from '../../configuration/env.js';
import { resolverOrigensCors } from '../../configuration/cors.js';
import { converterValorCentavos, formatarCentavos } from '../financeiro/financeiro.validator.js';
import { abacatePayService, pagamentosService } from '../pagamentos/pagamentos.routes.js';
import { dataSaoPaulo, resolverOrigemPlataforma } from '../pagamentos/pagamento.policy.js';
import { agendarHorarioLocal, agendarLembretesMensalidade } from './whatsapp.scheduler.js';
import { obterPropostaTemplate, renderizarTemplateCobranca } from './whatsapp.templates.js';
import type { SnapshotMensalidadeWhatsapp, TipoLembreteWhatsapp } from './whatsapp.contracts.js';
import { abrirBaileysRotina, type EscopoBaileys } from './whatsapp.baileys.demo.js';
import { janelaWhatsappAberta } from './whatsapp.janela.js';

type Tarefa = { id: string; cliente_id: string; mensalidade_id: string; lembrete_tipo: TipoLembreteWhatsapp; tentativas: number };
const provedor = 'BAILEYS';
const tarefas = (e: EscopoBaileys) => db('tarefas_mensagem').where(e).where({ provedor_execucao: provedor }).whereNull('deletado_em');
const iso = (d: Date | string) => d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
function maisDias(dia: string, dias: number) {
    const d = new Date(dia + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return iso(d);
}
function clienteElegivel(e: EscopoBaileys, numero: string) {
    return db('clientes as c')
        .join('clientes_areas as ca', 'ca.cliente_id', 'c.id')
        .join('areas_negocio as an', 'an.id', 'ca.area_negocio_id')
        .join('organizacoes as o', 'o.id', 'c.organizacao_id')
        .where({
            'c.organizacao_id': e.organizacao_id, 'ca.area_negocio_id': e.area_negocio_id,
            'an.organizacao_id': e.organizacao_id, 'c.telefone': numero,
            'c.ativo': true, 'c.aceite_whatsapp': true, 'ca.ativo': true, 'an.ativo': true, 'o.ativo': true,
        })
        .whereNull('c.deletado_em').whereNull('ca.deletado_em').whereNull('an.deletado_em')
        .whereNotNull('c.aceite_whatsapp_em').whereNotNull('c.origem_aceite_whatsapp')
        .whereRaw("length(trim(c.origem_aceite_whatsapp)) > 0")
        .where((q) => q.whereNull('c.opt_out_whatsapp_em').orWhereRaw('c.aceite_whatsapp_em > c.opt_out_whatsapp_em'));
}
async function snapshot(e: EscopoBaileys, mensalidadeId: string): Promise<SnapshotMensalidadeWhatsapp | null> {
    const contexto = { organizacaoId: e.organizacao_id, areaNegocioId: e.area_negocio_id, usuarioId: null };
    const conta = await pagamentosService.repo.conta(db, mensalidadeId, contexto)
        .whereNull('m.deletado_em').whereNull('cr.deletado_em').select('cr.cliente_id as cliente_id', 'm.atualizado_em as versao').first();
    if (!conta) return null;
    const extra = conta as typeof conta & { cliente_id: string; versao: Date | string };
    const total = converterValorCentavos(String(conta.valor_final));
    const soma = await db('pagamentos').where({ organizacao_id: e.organizacao_id, conta_receber_id: conta.conta_receber_id })
        .whereNull('deletado_em').sum({ total: 'valor' }).first();
    const pago = converterValorCentavos(String(soma?.total ?? '0'));
    const saldo = total - pago;
    const charge = await db('cobrancas_pagamento').where({ organizacao_id: e.organizacao_id, conta_receber_id: conta.conta_receber_id })
        .orderBy('criado_em', 'desc').first('id', 'provedor', 'status');
    const revisao = !!(await db('cobrancas_pagamento').where({ organizacao_id: e.organizacao_id, conta_receber_id: conta.conta_receber_id })
        .whereIn('status', ['PAGO_EM_REVISAO', 'CRIACAO_INCERTA']).first('id'));
    let situacao: SnapshotMensalidadeWhatsapp['situacao'] = conta.cancelado_em || conta.status_conta === 'CANCELADO' ? 'CANCELADO'
        : revisao ? 'RECONCILIACAO_PENDENTE'
        : conta.status_conta === 'PAGO' || saldo === 0n ? 'QUITADO'
        : pago > 0n ? 'PARCIAL' : 'ABERTO';
    if (saldo < 0n || (saldo > 0n && conta.status_conta !== 'PENDENTE' && situacao !== 'CANCELADO')) situacao = 'RECONCILIACAO_PENDENTE';
    let checkoutUrl: string | null = null;
    let checkoutValor: string | null = null;
    if (charge && ['ABERTO', 'PARCIAL'].includes(situacao) && charge.status === 'AGUARDANDO_PAGAMENTO') {
        const view = charge.provedor === 'ABACATEPAY'
            ? await abacatePayService.consultarCobranca(contexto, mensalidadeId)
            : charge.provedor === 'INFINITEPAY' ? await pagamentosService.consultarCobranca(contexto, mensalidadeId) : null;
        if (view?.id === charge.id && view.status === 'AGUARDANDO_PAGAMENTO' && view.checkout_url &&
            view.url_plataforma && /^\/pagamento\/[A-Za-z0-9_-]{43}$/.test(view.url_plataforma) &&
            converterValorCentavos(String(view.valor)) === saldo) {
            const origem = resolverOrigemPlataforma(process.env.WHATSAPP_BAILEYS_CHECKOUT_ORIGIN, resolverOrigensCors(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV), env.NODE_ENV);
            if (origem.startsWith('https://')) {
                checkoutUrl = new URL(view.url_plataforma, origem).href;
                checkoutValor = formatarCentavos(saldo);
            }
        }
    }
    return { mensalidadeId, organizacaoId: e.organizacao_id, areaNegocioId: e.area_negocio_id,
        clienteId: extra.cliente_id, competencia: iso(conta.competencia), valorTotal: formatarCentavos(total),
        valorPago: formatarCentavos(pago), saldoAtual: formatarCentavos(saldo < 0n ? 0n : saldo), vencimentoEm: iso(conta.vencimento_em),
        situacao, checkoutUrl, checkoutValor, reconciliacaoPendente: situacao === 'RECONCILIACAO_PENDENTE', versao: String(extra.versao) };
}
async function cancelar(e: EscopoBaileys, t: Tarefa, motivo: string) {
    await tarefas(e).where({ id: t.id, status: 'PENDENTE' }).update({ status: 'CANCELADA', cancelado_em: db.fn.now(), motivo_cancelamento: motivo, codigo_resultado: motivo });
}
export async function executarRotinaBaileys() {
    if (process.env.WHATSAPP_BAILEYS_DEMO_ENABLED !== 'true' || process.env.WHATSAPP_BAILEYS_AUTOMATIC_ENABLED !== 'true' || env.NODE_ENV === 'test') {
        return { status: 'DESABILITADA', enviadas: 0 };
    }
    const agora = new Date();
    if (!janelaWhatsappAberta(agora)) return { status: 'FORA_DA_JANELA', enviadas: 0 };
    const org = process.env.WHATSAPP_BAILEYS_DEMO_ORG_ID;
    const area = process.env.WHATSAPP_BAILEYS_DEMO_AREA_ID;
    const numero = '+' + (process.env.WHATSAPP_BAILEYS_DEMO_TEST_NUMBER ?? '');
    if (!org || !area || !/^\+55[1-9]\d{9,10}$/.test(numero) || !process.env.WHATSAPP_BAILEYS_CHECKOUT_ORIGIN) {
        return { status: 'CONFIGURACAO_INCOMPLETA', enviadas: 0 };
    }
    const e = { organizacao_id: org, area_negocio_id: area };
    const dia = dataSaoPaulo(agora);
    const inicio = agendarHorarioLocal(dia, '00:00');
    await tarefas(e).where('status', 'PENDENTE').where('executar_em', '<', inicio)
        .update({ status: 'CANCELADA', cancelado_em: db.fn.now(), motivo_cancelamento: 'LEMBRETE_EXPIRADO' });
    const clientes = await clienteElegivel(e, numero).select('c.id').limit(100);
    const ids = clientes.map((c) => c.id);
    if (!ids.length) return { status: 'SEM_DESTINATARIO_ELEGIVEL', enviadas: 0 };
    const candidatas = await db('mensalidades as m').join('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
        .where({ 'm.organizacao_id': org, 'm.area_negocio_id': area, 'cr.organizacao_id': org, 'cr.area_negocio_id': area, 'cr.status': 'PENDENTE' })
        .whereNull('m.deletado_em').whereNull('cr.deletado_em').whereNull('cr.cancelado_em')
        .whereIn('cr.cliente_id', ids).whereBetween('m.vencimento_em', [maisDias(dia, -3), maisDias(dia, 1)])
        .select('m.id').orderBy('m.id').limit(100);
    for (const mensalidade of candidatas) {
        const atual = await snapshot(e, mensalidade.id);
        if (!atual) continue;
        await agendarLembretesMensalidade(atual, {
            async inserirIgnorandoDuplicadas(novas) {
                const inseridas = await db('tarefas_mensagem').insert(novas.map((n) => ({ ...n, provedor_execucao: provedor })))
                    .onConflict().ignore().returning('id');
                return inseridas.length;
            },
        }, inicio);
    }
    const pendentes = await tarefas(e).where('status', 'PENDENTE').whereBetween('executar_em', [inicio, agora])
        .orderBy('executar_em').orderBy('id').limit(5).select('id', 'cliente_id', 'mensalidade_id', 'lembrete_tipo', 'tentativas') as Tarefa[];
    if (!pendentes.length) return { status: 'SEM_PENDENCIAS', enviadas: 0 };
    const sessao = await abrirBaileysRotina(e);
    let enviadas = 0;
    let incertas = 0;
    try {
        for (const t of pendentes) {
            if (!janelaWhatsappAberta(new Date())) break;
            const cliente = await clienteElegivel(e, numero).where('c.id', t.cliente_id).first('c.nome', 'an.nome as empresa');
            if (!cliente) { await cancelar(e, t, 'CONSENTIMENTO_OU_DESTINO_INVALIDO'); continue; }
            const atual = await snapshot(e, t.mensalidade_id);
            if (!atual || atual.clienteId !== t.cliente_id || ['QUITADO', 'CANCELADO'].includes(atual.situacao)) {
                await cancelar(e, t, 'MENSALIDADE_INELEGIVEL'); continue;
            }
            const dias = { 'D-1': -1, 'D0': 0, 'D+3': 3 }[t.lembrete_tipo];
            if (dias === undefined || maisDias(atual.vencimentoEm, dias) !== dia) {
                await cancelar(e, t, 'DATA_LEMBRETE_DIVERGENTE'); continue;
            }
            if (!atual.checkoutUrl || atual.reconciliacaoPendente || atual.checkoutValor !== atual.saldoAtual) continue;
            const modelo = obterPropostaTemplate(t.lembrete_tipo);
            if (!modelo) continue;
            const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(atual.saldoAtual));
            const texto = renderizarTemplateCobranca(modelo.conteudo, { cliente: cliente.nome, empresa: cliente.empresa,
                competencia: atual.competencia, valor, saldo: valor, vencimento: atual.vencimentoEm.split('-').reverse().join('/'), link_pagamento: atual.checkoutUrl });
            // Marca resultado incerto ANTES do envio. Uma queda do servidor nunca dispara
            // automaticamente uma segunda mensagem da mesma tarefa.
            const mensagemId = await db.transaction(async (trx) => {
                const n = await trx('tarefas_mensagem').where(e).where({ id: t.id, status: 'PENDENTE', provedor_execucao: provedor })
                    .update({ status: 'RESULTADO_INCERTO', tentativas: db.raw('tentativas + 1'), ultima_tentativa_em: trx.fn.now(), resultado_incerto_em: trx.fn.now(), codigo_resultado: 'ENVIO_INICIADO' });
                if (!n) return null;
                const [mensagem] = await trx('mensagens').insert({ ...e, tarefa_mensagem_id: t.id, cliente_id: t.cliente_id,
                    mensalidade_id: t.mensalidade_id, canal: 'WHATSAPP', destinatario: numero, tipo: 'WHATSAPP_COBRANCA_' + t.lembrete_tipo,
                    status: 'RESULTADO_INCERTO', provedor, modo_processamento: provedor, tentativa: t.tentativas + 1, erro_codigo: 'ENVIO_INICIADO' }).returning('id');
                return mensagem?.id as string | undefined;
            });
            if (!mensagemId) continue;
            try {
                const externo = await sessao.enviar(numero, texto);
                await db.transaction(async (trx) => {
                    await trx('mensagens').where(e).where({ id: mensagemId, status: 'RESULTADO_INCERTO' })
                        .update({ status: 'ENVIADA', identificador_externo: externo, enviado_em: trx.fn.now(), erro_codigo: null });
                    await trx('tarefas_mensagem').where(e).where({ id: t.id, status: 'RESULTADO_INCERTO', provedor_execucao: provedor })
                        .update({ status: 'ENVIADA', codigo_resultado: null, resultado_incerto_em: null });
                });
                enviadas++;
            } catch {
                incertas++;
                break; // pausa diante de resultado incerto; sem tentativa automática
            }
        }
    } finally { await sessao.encerrar(); }
    return { status: 'CONCLUIDA', enviadas, incertas };
}
