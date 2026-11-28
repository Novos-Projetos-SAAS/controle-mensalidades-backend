const fuso = 'America/Sao_Paulo';
const formatador = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

function minutos(horario: string): number {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(horario)) {
        throw new Error('HORARIO_WHATSAPP_INVALIDO');
    }
    const [hora, minuto] = horario.split(':').map(Number);
    return hora! * 60 + minuto!;
}

/** Janela de despacho [inicio, fim), em horário de Brasília. Não mantém o servidor ativo. */
export function janelaWhatsappAberta(
    agora: Date,
    inicio = '09:00',
    fim = '19:00',
): boolean {
    const abertura = minutos(inicio);
    const fechamento = minutos(fim);
    if (abertura >= fechamento) throw new Error('JANELA_WHATSAPP_INVALIDA');
    const partes = formatador.formatToParts(agora);
    const hora = Number(partes.find((parte) => parte.type === 'hour')?.value);
    const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value);
    const atual = hora * 60 + minuto;
    return atual >= abertura && atual < fechamento;
}
