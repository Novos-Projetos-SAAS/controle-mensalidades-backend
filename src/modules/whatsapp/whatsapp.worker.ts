import { randomUUID } from 'node:crypto';

import type {
    FinanceiroWhatsappProvider,
    ParametrosTemplateCobranca,
    SnapshotMensalidadeWhatsapp,
    WhatsAppProvider,
} from './whatsapp.contracts.js';
import whatsappRepository, {
    type ContextoProcessamentoWhatsapp,
    type TarefaWhatsappReservada,
} from './whatsapp.repository.js';
import { validarLinkCheckout } from './whatsapp.scheduler.js';
import { renderizarTemplateCobranca } from './whatsapp.templates.js';

const LEASE_MS = 120_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

export class FalhaProviderWhatsAppTemporaria extends Error {}

export type ResultadoWorkerWhatsapp = {
    reservadas: number;
    simuladas: number;
    canceladas: number;
    falhas: number;
    incertas: number;
    reagendadas: number;
};

function centavos(valor: string): bigint | null {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(valor)) return null;
    const [inteira, decimal = ''] = valor.split('.');
    if (inteira === undefined) return null;
    return BigInt(inteira) * 100n + BigInt(decimal.padEnd(2, '0'));
}

function formatarDinheiro(valor: string): string {
    const unidades = centavos(valor);
    if (unidades === null) throw new Error('VALOR_FINANCEIRO_INVALIDO');
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        Number(unidades) / 100,
    );
}

function telefoneE164Valido(valor: string | null): valor is string {
    return valor !== null && /^\+[1-9]\d{7,14}$/.test(valor);
}

function consentimentoValido(contexto: ContextoProcessamentoWhatsapp): boolean {
    const cliente = contexto.cliente;
    if (
        !cliente.ativo ||
        !cliente.pertencenteArea ||
        !cliente.aceite_whatsapp ||
        !cliente.aceite_whatsapp_em ||
        !cliente.origem_aceite_whatsapp?.trim()
    ) {
        return false;
    }
    if (!cliente.opt_out_whatsapp_em) return true;
    return (
        new Date(cliente.aceite_whatsapp_em).valueOf() >
        new Date(cliente.opt_out_whatsapp_em).valueOf()
    );
}

function dataBrasileira(data: string): string {
    const date = new Date(`${data.slice(0, 10)}T12:00:00.000Z`);
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

function calcularBackoff(tentativa: number, agora: Date): Date {
    const atraso = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(tentativa - 1, 0), BACKOFF_MAX_MS);
    return new Date(agora.getTime() + atraso);
}

function bloqueioFinanceiro(
    snapshot: SnapshotMensalidadeWhatsapp,
    tarefa: TarefaWhatsappReservada,
): string | null {
    if (
        snapshot.mensalidadeId !== tarefa.mensalidade_id ||
        snapshot.organizacaoId !== tarefa.organizacao_id ||
        snapshot.areaNegocioId !== tarefa.area_negocio_id ||
        snapshot.clienteId !== tarefa.cliente_id
    ) {
        return 'ESCOPO_FINANCEIRO_DIVERGENTE';
    }
    if (snapshot.situacao === 'QUITADO') return 'MENSALIDADE_QUITADA';
    if (snapshot.situacao === 'CANCELADO') return 'MENSALIDADE_CANCELADA';
    if (snapshot.situacao === 'RECONCILIACAO_PENDENTE' || snapshot.reconciliacaoPendente) {
        return 'RECONCILIACAO_FINANCEIRA_PENDENTE';
    }

    const total = centavos(snapshot.valorTotal);
    const pago = centavos(snapshot.valorPago);
    const saldo = centavos(snapshot.saldoAtual);
    const checkout = snapshot.checkoutValor ? centavos(snapshot.checkoutValor) : null;
    if (
        total === null ||
        pago === null ||
        saldo === null ||
        total < pago ||
        saldo !== total - pago
    ) {
        return 'SALDO_FINANCEIRO_INVALIDO';
    }
    if (saldo <= 0n) return 'MENSALIDADE_QUITADA';
    if (!validarLinkCheckout(snapshot.checkoutUrl) || checkout === null || checkout !== saldo) {
        return 'LINK_NAO_CORRESPONDE_AO_SALDO';
    }
    return null;
}

function obterParametros(
    contexto: ContextoProcessamentoWhatsapp,
    snapshot: SnapshotMensalidadeWhatsapp,
): ParametrosTemplateCobranca {
    const saldo = formatarDinheiro(snapshot.saldoAtual);
    return {
        cliente: contexto.cliente.nome,
        empresa: contexto.configuracao?.nomeNegocio || '',
        competencia: snapshot.competencia.slice(0, 7),
        valor: saldo,
        saldo,
        vencimento: dataBrasileira(snapshot.vencimentoEm),
        link_pagamento: snapshot.checkoutUrl ?? '',
    };
}

async function finalizarSemEnvio(
    tarefa: TarefaWhatsappReservada,
    contexto: ContextoProcessamentoWhatsapp | null,
    status: 'CANCELADA' | 'FALHOU',
    codigo: string,
) {
    await whatsappRepository.registrarFalhaTarefa(
        tarefa,
        status,
        codigo,
        undefined,
        contexto && telefoneE164Valido(contexto.cliente.telefone)
            ? {
                  destinatario: contexto.cliente.telefone,
                  modoProcessamento: 'SIMULADO',
                  provedor: 'SIMULADOR',
                  status,
              }
            : undefined,
    );
}

async function processarUmaTarefa(
    tarefa: TarefaWhatsappReservada,
    dependencias: {
        financeiro: FinanceiroWhatsappProvider;
        provider: WhatsAppProvider;
        agora: () => Date;
    },
): Promise<'simulada' | 'cancelada' | 'falha' | 'incerta' | 'reagendada'> {
    const contexto = await whatsappRepository.obterContextoProcessamento(tarefa);
    if (!contexto) {
        await finalizarSemEnvio(tarefa, null, 'CANCELADA', 'CONTEXTO_INDISPONIVEL');
        return 'cancelada';
    }
    if (!consentimentoValido(contexto)) {
        await finalizarSemEnvio(tarefa, contexto, 'CANCELADA', 'CONSENTIMENTO_NAO_ATIVO');
        return 'cancelada';
    }
    if (!telefoneE164Valido(contexto.cliente.telefone)) {
        await finalizarSemEnvio(tarefa, contexto, 'FALHOU', 'TELEFONE_E164_INVALIDO');
        return 'falha';
    }
    if (!contexto.configuracao?.ativo || !contexto.configuracao.credencial) {
        await finalizarSemEnvio(tarefa, contexto, 'FALHOU', 'REMETENTE_NAO_VALIDADO');
        return 'falha';
    }
    if (!contexto.template?.nomeTemplateMeta) {
        await finalizarSemEnvio(tarefa, contexto, 'FALHOU', 'TEMPLATE_META_NAO_APROVADO');
        return 'falha';
    }
    if (tarefa.tentativas > tarefa.max_tentativas) {
        await finalizarSemEnvio(tarefa, contexto, 'FALHOU', 'LIMITE_TENTATIVAS');
        return 'falha';
    }

    let snapshot: SnapshotMensalidadeWhatsapp | null;
    try {
        snapshot = await dependencias.financeiro.obterMensalidadeAtual({
            mensalidadeId: tarefa.mensalidade_id,
            organizacaoId: tarefa.organizacao_id,
            areaNegocioId: tarefa.area_negocio_id,
        });
    } catch {
        const agora = dependencias.agora();
        const status = tarefa.tentativas >= tarefa.max_tentativas ? 'FALHOU' : 'PENDENTE';
        await whatsappRepository.registrarFalhaTarefa(
            tarefa,
            status,
            'CONSULTA_FINANCEIRA_INDISPONIVEL',
            status === 'PENDENTE' ? calcularBackoff(tarefa.tentativas, agora) : undefined,
            {
                destinatario: contexto.cliente.telefone,
                modoProcessamento: 'SIMULADO',
                provedor: 'SIMULADOR',
                status,
            },
        );
        return status === 'PENDENTE' ? 'reagendada' : 'falha';
    }

    if (!snapshot) {
        await finalizarSemEnvio(tarefa, contexto, 'CANCELADA', 'MENSALIDADE_NAO_ENCONTRADA');
        return 'cancelada';
    }
    const bloqueio = bloqueioFinanceiro(snapshot, tarefa);
    if (bloqueio) {
        if (bloqueio === 'MENSALIDADE_QUITADA' || bloqueio === 'MENSALIDADE_CANCELADA') {
            await whatsappRepository.cancelarLembretesMensalidade(tarefa, bloqueio);
            return 'cancelada';
        }
        const status = bloqueio === 'ESCOPO_FINANCEIRO_DIVERGENTE' ? 'CANCELADA' : 'FALHOU';
        await finalizarSemEnvio(tarefa, contexto, status, bloqueio);
        return status === 'CANCELADA' ? 'cancelada' : 'falha';
    }

    // A última leitura de consentimento e lease ocorre imediatamente antes do adapter.
    const contextoFinal = await whatsappRepository.obterContextoProcessamento(tarefa);
    if (!contextoFinal || !consentimentoValido(contextoFinal)) {
        await finalizarSemEnvio(
            tarefa,
            contextoFinal,
            'CANCELADA',
            'CONSENTIMENTO_REVOGADO_ANTES_DO_ENVIO',
        );
        return 'cancelada';
    }
    const configuracaoFinal = contextoFinal.configuracao;
    const templateFinal = contextoFinal.template;
    if (!telefoneE164Valido(contextoFinal.cliente.telefone)) {
        await finalizarSemEnvio(tarefa, contextoFinal, 'FALHOU', 'TELEFONE_E164_INVALIDO');
        return 'falha';
    }
    if (!configuracaoFinal?.ativo || !configuracaoFinal.credencial) {
        await finalizarSemEnvio(tarefa, contextoFinal, 'FALHOU', 'REMETENTE_NAO_VALIDADO');
        return 'falha';
    }
    if (!templateFinal?.nomeTemplateMeta) {
        await finalizarSemEnvio(tarefa, contextoFinal, 'FALHOU', 'TEMPLATE_META_NAO_APROVADO');
        return 'falha';
    }
    let validacao: { valido: boolean; motivo?: string };
    try {
        validacao = await dependencias.provider.validarConfiguracao(configuracaoFinal);
    } catch {
        await finalizarSemEnvio(
            tarefa,
            contextoFinal,
            'FALHOU',
            'VALIDACAO_REMETENTE_INDISPONIVEL',
        );
        return 'falha';
    }
    if (!validacao.valido) {
        await finalizarSemEnvio(tarefa, contextoFinal, 'FALHOU', 'VALIDACAO_REMETENTE_FALHOU');
        return 'falha';
    }

    const parametros = obterParametros(contextoFinal, snapshot);
    try {
        renderizarTemplateCobranca(templateFinal.conteudo, parametros);
    } catch {
        await finalizarSemEnvio(tarefa, contextoFinal, 'FALHOU', 'PARAMETROS_TEMPLATE_INVALIDOS');
        return 'falha';
    }

    const chaveIdempotencia = `${tarefa.organizacao_id}:${tarefa.id}:${tarefa.ciclo_financeiro}:${tarefa.lembrete_tipo}`;
    try {
        const resultado = await dependencias.provider.enviarTemplate({
            configuracao: configuracaoFinal,
            destinatarioE164: contextoFinal.cliente.telefone,
            nomeTemplateMeta: templateFinal.nomeTemplateMeta,
            idioma: templateFinal.idiomaMeta,
            parametros,
            idempotencyKey: chaveIdempotencia,
        });

        if (!resultado.simulado) {
            await whatsappRepository.registrarFalhaTarefa(
                tarefa,
                'FALHOU',
                'ENVIO_REAL_BLOQUEADO_ETAPA_01',
                undefined,
                {
                    destinatario: contextoFinal.cliente.telefone,
                    modoProcessamento: 'META',
                    provedor: 'META_CLOUD_API',
                    status: 'FALHOU',
                },
            );
            return 'falha';
        }

        if (resultado.status === 'RESULTADO_INCERTO') {
            await whatsappRepository.finalizarTarefaComMensagem(tarefa, {
                destinatario: contextoFinal.cliente.telefone,
                tipo: `WHATSAPP_COBRANCA_${tarefa.lembrete_tipo}`,
                status: 'RESULTADO_INCERTO',
                identificadorExterno: resultado.identificadorExterno,
                enviadoEm: null,
                provedor: 'SIMULADOR',
                nomeTemplateMeta: templateFinal.nomeTemplateMeta,
                categoriaTemplate: templateFinal.categoriaMeta,
                modoProcessamento: 'SIMULADO',
                erroCodigo: resultado.codigoErro ?? 'RESULTADO_EXTERNO_INCERTO',
            });
            return 'incerta';
        }

        if (!resultado.aceito || resultado.status !== 'ACEITO') {
            await whatsappRepository.registrarFalhaTarefa(
                tarefa,
                'FALHOU',
                resultado.codigoErro ?? 'ENVIO_SIMULADO_FALHOU',
                undefined,
                {
                    destinatario: contextoFinal.cliente.telefone,
                    modoProcessamento: 'SIMULADO',
                    provedor: 'SIMULADOR',
                    status: 'FALHOU',
                },
            );
            return 'falha';
        }

        const gravada = await whatsappRepository.finalizarTarefaComMensagem(tarefa, {
            destinatario: contextoFinal.cliente.telefone,
            tipo: `WHATSAPP_COBRANCA_${tarefa.lembrete_tipo}`,
            status: 'ENVIADA',
            identificadorExterno: resultado.identificadorExterno ?? `simulado:${randomUUID()}`,
            enviadoEm: dependencias.agora(),
            provedor: 'SIMULADOR',
            nomeTemplateMeta: templateFinal.nomeTemplateMeta,
            categoriaTemplate: templateFinal.categoriaMeta,
            modoProcessamento: 'SIMULADO',
        });
        return gravada ? 'simulada' : 'cancelada';
    } catch (error) {
        if (error instanceof FalhaProviderWhatsAppTemporaria) {
            const agora = dependencias.agora();
            const status = tarefa.tentativas >= tarefa.max_tentativas ? 'FALHOU' : 'PENDENTE';
            await whatsappRepository.registrarFalhaTarefa(
                tarefa,
                status,
                'PROVEDOR_TEMPORARIAMENTE_INDISPONIVEL',
                status === 'PENDENTE' ? calcularBackoff(tarefa.tentativas, agora) : undefined,
                {
                    destinatario: contextoFinal.cliente.telefone,
                    modoProcessamento: 'SIMULADO',
                    provedor: 'SIMULADOR',
                    status: 'FALHOU',
                },
            );
            return status === 'PENDENTE' ? 'reagendada' : 'falha';
        }
        await whatsappRepository.finalizarTarefaComMensagem(tarefa, {
            destinatario: contextoFinal.cliente.telefone,
            tipo: `WHATSAPP_COBRANCA_${tarefa.lembrete_tipo}`,
            status: 'RESULTADO_INCERTO',
            identificadorExterno: null,
            enviadoEm: null,
            provedor: 'SIMULADOR',
            nomeTemplateMeta: templateFinal.nomeTemplateMeta,
            categoriaTemplate: templateFinal.categoriaMeta,
            modoProcessamento: 'SIMULADO',
            erroCodigo: 'RESULTADO_EXTERNO_INCERTO',
        });
        return 'incerta';
    }
}

export async function processarFilaWhatsapp(input: {
    financeiro: FinanceiroWhatsappProvider;
    provider: WhatsAppProvider;
    limite?: number;
    agora?: () => Date;
}): Promise<ResultadoWorkerWhatsapp> {
    if (input.provider.mode !== 'SIMULADO') {
        throw new Error('WORKER_WHATSAPP_REAL_BLOQUEADO_ETAPA_01');
    }
    const agora = input.agora ?? (() => new Date());
    const tarefas = await whatsappRepository.reservarTarefasProntas(
        Math.min(Math.max(input.limite ?? 20, 1), 100),
        agora(),
        LEASE_MS,
    );
    const resultado: ResultadoWorkerWhatsapp = {
        reservadas: tarefas.length,
        simuladas: 0,
        canceladas: 0,
        falhas: 0,
        incertas: 0,
        reagendadas: 0,
    };

    for (const tarefa of tarefas) {
        const status = await processarUmaTarefa(tarefa, {
            financeiro: input.financeiro,
            provider: input.provider,
            agora,
        });
        if (status === 'simulada') resultado.simuladas += 1;
        if (status === 'cancelada') resultado.canceladas += 1;
        if (status === 'falha') resultado.falhas += 1;
        if (status === 'incerta') resultado.incertas += 1;
        if (status === 'reagendada') resultado.reagendadas += 1;
    }
    return resultado;
}
