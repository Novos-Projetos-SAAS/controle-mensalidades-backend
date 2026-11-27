import assert from 'node:assert/strict';
import test from 'node:test';
import { gerarLaudoPdf } from '../../../src/modules/documentos_clinicos/laudo.pdf.js';

const base = {
    clinica: 'Clínica Fisioterapia Teste',
    localidade: 'São Paulo - SP',
    paciente: 'Paciente de Homologação',
    profissional: 'Dra. Fisioterapeuta Fictícia',
    conselho: 'CREFITO',
    numeroConselho: '123456',
    ufConselho: 'SP',
    estado: 'FINALIZADO' as const,
    versao: 3,
    historica: false,
    registradoEm: new Date('2026-11-25T12:00:00.000Z'),
    geradoEm: new Date('2026-11-26T13:00:00.000Z'),
    conteudo: {
        finalidade: 'Avaliação funcional de teste.',
        fundamentacao_avaliacao: 'Avaliação fisioterapêutica estritamente fictícia.',
        achados_funcionais: 'Alterações simuladas de mobilidade.',
        diagnostico_fisioterapeutico: 'Diagnóstico fictício.',
        conclusao: 'Conclusão fictícia, sem validade para pacientes reais.',
        recomendacoes: 'Recomendações fictícias de mobilidade.',
    },
};

test('PDF de laudo usa A4, dados de clínica e registro profissional sem inserir assinatura', () => {
    const pdf = gerarLaudoPdf(base);
    const texto = pdf.toString('latin1');
    assert.ok(pdf.length > 1500);
    assert.equal(texto.slice(0, 8), '%PDF-1.4');
    assert.ok(texto.includes('/MediaBox [0 0 595.28 841.89]'));
    assert.ok(texto.includes('CREFITO'));
    assert.ok(texto.includes('123456'));
    assert.ok(texto.includes('Paciente de Homologa'));
    assert.ok(texto.includes('Assinatura do fisioterapeuta'));
    assert.ok(texto.includes('SEM ASSINATURA DIGITAL'));
    assert.ok(texto.includes('%%EOF'));
    assert.ok(!texto.includes('assinatura digital aplicada'));
    assert.ok(!texto.includes('cpf_cifrado'));
});

test('rascunho e versão histórica são identificados sem sugerir assinatura oficial', () => {
    const pdf = gerarLaudoPdf({
        ...base, estado: 'RASCUNHO', historica: true, versao: 1,
    }).toString('latin1');
    assert.ok(pdf.includes('VERS'));
    assert.ok(pdf.includes('HIST'));
    assert.ok(!pdf.includes('assinatura eletrônica realizada'));
});

test('laudo longo quebra páginas, preserva conclusão e limita dados ao conteúdo permitido', () => {
    const textoLongo = ('Avaliação detalhada fictícia com mobilidade e resposta. ').repeat(190);
    const pdf = gerarLaudoPdf({
        ...base,
        conteudo: {
            ...base.conteudo,
            fundamentacao_avaliacao: textoLongo,
            conclusao: 'Conclusão longa de teste.',
        },
    }).toString('latin1');
    const paginas = pdf.match(/\/Type \/Page \/Parent/g) ?? [];
    assert.ok(paginas.length >= 2, 'texto extenso deve gerar mais de uma página');
    assert.ok(pdf.includes('2 / 2') || pdf.includes('/Count ' + paginas.length));
    assert.ok(pdf.includes('Conclus'));
    assert.ok(!pdf.includes('undefined'));
});

test('gerador recusa documentos sem paciente, clínica ou profissional identificado', () => {
    assert.throws(() => gerarLaudoPdf({ ...base, paciente: ' ' }), /Identificação/);
    assert.throws(() => gerarLaudoPdf({ ...base, clinica: '' }), /Identificação/);
});
