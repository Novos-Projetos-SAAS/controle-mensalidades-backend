import type { TipoLembreteWhatsapp } from './whatsapp.contracts.js';

export const FUSO_LEMBRETES_WHATSAPP = 'America/Sao_Paulo';
export const HORARIO_LEMBRETES_WHATSAPP = '09:00';

export type MensalidadeParaAgendar = {
    mensalidadeId: string;
    organizacaoId: string;
    areaNegocioId: string;
    clienteId: string;
    competencia: string;
    vencimentoEm: string;
    valorTotal: string;
    valorPago: string;
    saldoAtual: string;
    checkoutUrl: string | null;
    checkoutValor: string | null;
    situacao: 'ABERTO' | 'PARCIAL' | 'QUITADO' | 'CANCELADO' | 'RECONCILIACAO_PENDENTE';
    reconciliacaoPendente: boolean;
};

export type TarefaLembreteNova = {
    organizacao_id: string;
    area_negocio_id: string;
    cliente_id: string;
    mensalidade_id: string;
    conta_receber_id: null;
    modelo_mensagem_id: null;
    tipo: string;
    lembrete_tipo: TipoLembreteWhatsapp;
    ciclo_financeiro: string;
    status: 'PENDENTE';
    executar_em: Date;
    tentativas: number;
    max_tentativas: number;
};

export interface ArmazenamentoAgendadorWhatsapp {
    inserirIgnorandoDuplicadas(tarefas: TarefaLembreteNova[]): Promise<number>;
}

function centavos(valor: string): bigint | null {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(valor)) return null;
    const [inteira, decimal = ''] = valor.split('.');
    if (inteira === undefined) return null;
    return BigInt(inteira) * 100n + BigInt(decimal.padEnd(2, '0'));
}

export function validarLinkCheckout(url: string | null): url is string {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return (
            parsed.protocol === 'https:' &&
            Boolean(parsed.hostname) &&
            !parsed.username &&
            !parsed.password &&
            parsed.hostname !== 'localhost' &&
            parsed.hostname !== '127.0.0.1'
        );
    } catch {
        return false;
    }
}

function dataMaisDias(data: string, dias: number): string {
    const [ano = NaN, mes = NaN, dia = NaN] = data.split('-').map(Number);
    const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias));
    return resultado.toISOString().slice(0, 10);
}

function partesNoFuso(data: Date) {
    const formatador = new Intl.DateTimeFormat('en-US', {
        timeZone: FUSO_LEMBRETES_WHATSAPP,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    return Object.fromEntries(
        formatador.formatToParts(data).map((item) => [item.type, item.value]),
    );
}

export function agendarHorarioLocal(data: string, horario = HORARIO_LEMBRETES_WHATSAPP): Date {
    const [ano = NaN, mes = NaN, dia = NaN] = data.split('-').map(Number);
    const [hora = NaN, minuto = NaN] = horario.split(':').map(Number);
    const alvoLocalComoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
    let estimativaUtc = alvoLocalComoUtc;

    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
        const partes = partesNoFuso(new Date(estimativaUtc));
        const interpretadoComoUtc = Date.UTC(
            Number(partes.year),
            Number(partes.month) - 1,
            Number(partes.day),
            Number(partes.hour),
            Number(partes.minute),
            Number(partes.second),
        );
        const diferenca = alvoLocalComoUtc - interpretadoComoUtc;
        if (diferenca === 0) break;
        estimativaUtc += diferenca;
    }
    return new Date(estimativaUtc);
}

function validarData(valor: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const date = new Date(`${valor}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === valor;
}

function validarCompetencia(valor: string): boolean {
    const partes = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(valor);
    if (!partes) return false;
    const mes = Number(partes[2]);
    return mes >= 1 && mes <= 12 && (!partes[3] || validarData(valor));
}

export async function agendarLembretesMensalidade(
    mensalidade: MensalidadeParaAgendar,
    armazenamento: ArmazenamentoAgendadorWhatsapp,
    agora = new Date(),
): Promise<{ criadas: number; ignorada: boolean; motivo?: string }> {
    if (
        mensalidade.situacao === 'QUITADO' ||
        mensalidade.situacao === 'CANCELADO' ||
        mensalidade.situacao === 'RECONCILIACAO_PENDENTE' ||
        mensalidade.reconciliacaoPendente
    ) {
        return { criadas: 0, ignorada: true, motivo: 'ESTADO_FINANCEIRO_NAO_ELEGIVEL' };
    }

    const total = centavos(mensalidade.valorTotal);
    const pago = centavos(mensalidade.valorPago);
    const saldo = centavos(mensalidade.saldoAtual);
    const valorCheckout = mensalidade.checkoutValor ? centavos(mensalidade.checkoutValor) : null;
    if (
        total === null ||
        pago === null ||
        saldo === null ||
        total < pago ||
        saldo !== total - pago ||
        saldo <= 0n
    ) {
        return { criadas: 0, ignorada: true, motivo: 'SALDO_INVALIDO_OU_QUITADO' };
    }
    if (
        !validarCompetencia(mensalidade.competencia) ||
        !validarData(mensalidade.vencimentoEm) ||
        !validarLinkCheckout(mensalidade.checkoutUrl)
    ) {
        return { criadas: 0, ignorada: true, motivo: 'DADOS_DE_COBRANCA_INVALIDOS' };
    }
    if (valorCheckout === null || saldo !== valorCheckout) {
        return { criadas: 0, ignorada: true, motivo: 'LINK_NAO_CORRESPONDE_AO_SALDO' };
    }

    const lembretes: Array<{ tipo: TipoLembreteWhatsapp; dias: number }> = [
        { tipo: 'D-1', dias: -1 },
        { tipo: 'D0', dias: 0 },
        { tipo: 'D+3', dias: 3 },
    ];
    const tarefas = lembretes
        .map(({ tipo, dias }): TarefaLembreteNova => ({
            organizacao_id: mensalidade.organizacaoId,
            area_negocio_id: mensalidade.areaNegocioId,
            cliente_id: mensalidade.clienteId,
            mensalidade_id: mensalidade.mensalidadeId,
            conta_receber_id: null,
            modelo_mensagem_id: null,
            tipo: `WHATSAPP_COBRANCA_${tipo.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`,
            lembrete_tipo: tipo,
            ciclo_financeiro: mensalidade.competencia.slice(0, 7),
            status: 'PENDENTE',
            executar_em: agendarHorarioLocal(dataMaisDias(mensalidade.vencimentoEm, dias)),
            tentativas: 0,
            max_tentativas: 5,
        }))
        .filter((tarefa) => tarefa.executar_em > agora);

    if (!tarefas.length) return { criadas: 0, ignorada: true, motivo: 'LEMBRETES_JA_VENCIDOS' };
    return { criadas: await armazenamento.inserirIgnorandoDuplicadas(tarefas), ignorada: false };
}
