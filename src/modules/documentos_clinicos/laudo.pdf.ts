/**
 * PDF A4 de laudo fisioterapêutico para impressão física.
 * Não assina eletronicamente e nunca transforma rascunho em laudo assinado.
 *
 * Gerador autocontido: evita dependências remotas, HTML e arquivos temporários
 * com dados sensíveis. Usa Helvetica WinAnsi (acentos pt-BR suportados).
 */
export type DadosLaudoParaPdf = {
    clinica: string;
    localidade?: string | null;
    paciente: string;
    profissional: string;
    conselho?: string | null;
    numeroConselho?: string | null;
    ufConselho?: string | null;
    estado: 'RASCUNHO' | 'FINALIZADO';
    versao: number;
    historica: boolean;
    registradoEm: Date | string;
    geradoEm: Date;
    conteudo: {
        finalidade: string;
        fundamentacao_avaliacao: string;
        achados_funcionais: string;
        diagnostico_fisioterapeutico: string;
        conclusao: string;
        recomendacoes?: string;
    };
};

const largura = 595.28;
const altura = 841.89;
const margem = 48;
const rodape = 64;
const larguraTexto = largura - 2 * margem;

function textoPdf(valor: string): string {
    // A fonte padrão suporta WinAnsi (Windows-1252). Substitui apenas
    // caracteres sem glifos, evitando fragmentos inválidos no PDF.
    return valor.normalize('NFC')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\u2022/g, '-')
        .replace(/\t/g, '    ')
        .replace(/[^\x20-\x7e\u00a0-\u00ff\n]/g, '?')
        .replace(/[\\()]/g, (c) => '\\' + c);
}

function formatarInstante(valor: Date | string): string {
    const data = valor instanceof Date ? valor : new Date(valor);
    if (!Number.isFinite(data.getTime())) return 'Não disponível';
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short', timeStyle: 'short', hour12: false,
    }).format(data);
}

function quebrarLinhas(texto: string, tamanho: number, larguraMax: number): string[] {
    const limite = Math.max(8, Math.floor(larguraMax / (tamanho * 0.51)));
    const linhas: string[] = [];
    for (const paragrafo of texto.replace(/\r/g, '').split('\n')) {
        if (!paragrafo.trim()) {
            linhas.push('');
            continue;
        }
        let atual = '';
        for (const palavraOriginal of paragrafo.trim().split(/\s+/)) {
            let palavra = palavraOriginal;
            while (palavra.length > limite) {
                if (atual) {
                    linhas.push(atual);
                    atual = '';
                }
                linhas.push(palavra.slice(0, limite));
                palavra = palavra.slice(limite);
            }
            const candidata = atual ? atual + ' ' + palavra : palavra;
            if (candidata.length > limite && atual) {
                linhas.push(atual);
                atual = palavra;
            } else {
                atual = candidata;
            }
        }
        if (atual) linhas.push(atual);
    }
    return linhas;
}

export function gerarLaudoPdf(dados: DadosLaudoParaPdf): Buffer {
    if (!dados.paciente.trim() || !dados.profissional.trim() || !dados.clinica.trim()) {
        throw new Error('Identificação do laudo incompleta.');
    }
    const pags: string[][] = [];
    let pagina: string[] = [];
    let y = 0;

    function comando(valor: string) { pagina.push(valor); }
    function txt(texto: string, x: number, posY: number, tam = 10, forte = false, cor = '0.15 0.20 0.24') {
        comando(cor + ' rg BT /' + (forte ? 'F2' : 'F1') + ' ' + tam +
            ' Tf 1 0 0 1 ' + x.toFixed(2) + ' ' + posY.toFixed(2) +
            ' Tm (' + textoPdf(texto) + ') Tj ET');
    }
    function linha(x1: number, y1: number, x2: number, y2: number, cor = '0.84 0.88 0.89') {
        comando(cor + ' RG 0.75 w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
            ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S');
    }
    function novaPagina() {
        pagina = [];
        pags.push(pagina);
        const nomeCabecalho = dados.clinica.length > 65
            ? dados.clinica.slice(0, 62) + '...'
            : dados.clinica;
        txt(nomeCabecalho, margem, 793, 12, true, '0.11 0.30 0.35');
        txt('LAUDO FISIOTERAPÊUTICO', margem, 762, 17, true);
        linha(margem, 747, largura - margem, 747, '0.11 0.47 0.49');
        y = 727;
    }
    function garantir(espaco: number) {
        if (y - espaco < rodape + 27) novaPagina();
    }
    function textoCorrente(texto: string, x = margem, tam = 10, passo = 15, forte = false) {
        const linhas = quebrarLinhas(texto, tam, larguraTexto - (x - margem));
        for (const trecho of linhas) {
            garantir(passo);
            if (trecho) txt(trecho, x, y, tam, forte);
            y -= passo;
        }
    }
    function campo(rotulo: string, conteudo: string | undefined) {
        if (!conteudo?.trim()) return;
        garantir(50);
        txt(rotulo, margem, y, 10, true, '0.11 0.30 0.35');
        y -= 19;
        textoCorrente(conteudo.trim(), margem, 10.5, 16);
        y -= 11;
    }

    novaPagina();
    textoCorrente('Clínica: ' + dados.clinica, margem, 10, 15, true);
    textoCorrente('Paciente: ' + dados.paciente, margem, 10, 15, true);
    textoCorrente('Fisioterapeuta: ' + dados.profissional, margem, 10, 15, true);
    const registro = [dados.conselho?.trim(), dados.numeroConselho?.trim(), dados.ufConselho?.trim()]
        .filter(Boolean).join(' - ');
    textoCorrente(registro ? 'Registro profissional: ' + registro :
        'Registro profissional não informado - conferir antes de assinar.', margem, 9.5, 15);
    if (dados.localidade?.trim()) {
        textoCorrente('Localidade: ' + dados.localidade.trim(), margem, 9.5, 15);
    }
    textoCorrente('Versão ' + dados.versao + ' | ' +
        (dados.estado === 'RASCUNHO' ? 'Rascunho' : 'Finalizado sem assinatura digital') +
        ' | Registro: ' + formatarInstante(dados.registradoEm), margem, 9.5, 15);
    textoCorrente('Gerado em: ' + formatarInstante(dados.geradoEm) + ' (horário de Brasília)',
        margem, 9.5, 15);
    y -= 11;
    linha(margem, y, largura - margem, y);
    y -= 25;

    campo('FINALIDADE', dados.conteudo.finalidade);
    campo('FUNDAMENTAÇÃO E AVALIAÇÃO', dados.conteudo.fundamentacao_avaliacao);
    campo('ACHADOS FUNCIONAIS', dados.conteudo.achados_funcionais);
    campo('DIAGNÓSTICO FISIOTERAPÊUTICO', dados.conteudo.diagnostico_fisioterapeutico);
    campo('CONCLUSÃO PROFISSIONAL', dados.conteudo.conclusao);
    campo('RECOMENDAÇÕES', dados.conteudo.recomendacoes);

    garantir(100);
    y -= 23;
    linha(margem + 80, y, largura - margem - 80, y, '0.30 0.38 0.41');
    y -= 16;
    txt('Assinatura do fisioterapeuta', margem + 133, y, 9, false);
    y -= 16;
    textoCorrente('Documento para impressão e assinatura física. Não possui assinatura digital.',
        margem, 8.7, 13);

    for (let indice = 0; indice < pags.length; indice++) {
        const comandos = pags[indice]!;
        const aviso = dados.historica
            ? 'CÓPIA DE VERSÃO HISTÓRICA - NÃO REPRESENTA A VERSÃO ATUAL'
            : dados.estado === 'RASCUNHO'
                ? 'RASCUNHO - SEM ASSINATURA'
                : 'DOCUMENTO FINALIZADO - SEM ASSINATURA DIGITAL';
        comandos.push('0.53 0.30 0.19 rg BT /F2 8 Tf 1 0 0 1 ' + margem +
            ' 43 Tm (' + textoPdf(aviso) + ') Tj ET');
        comandos.push('0.40 0.43 0.47 rg BT /F1 8 Tf 1 0 0 1 ' + (largura - margem - 70) +
            ' 43 Tm (' + (indice + 1) + ' / ' + pags.length + ') Tj ET');
    }

    const objetos: string[] = [];
    objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const filhos: string[] = [];
    for (let i = 0; i < pags.length; i++) {
        const paginaId = 5 + i * 2;
        const streamId = paginaId + 1;
        filhos.push(paginaId + ' 0 R');
        objetos[paginaId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
            largura + ' ' + altura + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ' +
            '/Contents ' + streamId + ' 0 R >>';
        const fluxo = pags[i]!.join('\n') + '\n';
        objetos[streamId] = '<< /Length ' + Buffer.byteLength(fluxo, 'latin1') +
            ' >>\nstream\n' + fluxo + 'endstream';
    }
    objetos[2] = '<< /Type /Pages /Kids [' + filhos.join(' ') +
        '] /Count ' + pags.length + ' >>';

    const pedacos: Buffer[] = [];
    let totalBytes = 0;
    function incluir(texto: string) {
        const bloco = Buffer.from(texto, 'latin1');
        pedacos.push(bloco);
        totalBytes += bloco.length;
    }
    incluir('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const offsets = [0];
    for (let i = 1; i < objetos.length; i++) {
        offsets[i] = totalBytes;
        incluir(i + ' 0 obj\n' + objetos[i] + '\nendobj\n');
    }
    const posicaoXref = totalBytes;
    incluir('xref\n0 ' + objetos.length + '\n0000000000 65535 f \n');
    for (let i = 1; i < objetos.length; i++) {
        incluir(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    incluir('trailer\n<< /Size ' + objetos.length +
        ' /Root 1 0 R >>\nstartxref\n' + posicaoXref + '\n%%EOF\n');
    return Buffer.concat(pedacos);
}
