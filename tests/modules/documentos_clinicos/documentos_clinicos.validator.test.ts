import assert from 'node:assert/strict';
import test from 'node:test';
import {
    validarNovoDocumentoClinico,
    validarRevisaoDocumentoClinico,
    validarFinalizacaoDocumentoClinico,
    validarDocumentoClinicoId,
    validarConteudoParaTipo,
    validarVersaoLaudoPdf,
} from '../../../src/modules/documentos_clinicos/documentos_clinicos.validator.js';

const clienteId = 'c38fae7f-7c1a-40e3-8d88-82754ce6f4db';
const anamnese = {
    queixa_principal: 'Queixa ficticia',
    historia_condicao_atual: 'Historia ficticia',
    limitacoes_funcionais: 'Limitacoes ficticias',
    objetivos_paciente: 'Objetivos ficticios',
    avaliacao_inicial: 'Avaliacao ficticia',
};
const laudo = {
    finalidade: 'Simulacao',
    fundamentacao_avaliacao: 'Avaliacao ficticia',
    achados_funcionais: 'Achados ficticios',
    diagnostico_fisioterapeutico: 'Conclusao tecnica ficticia',
    conclusao: 'Conclusao ficticia',
};

test('anamnese e laudo validam conteúdo estrito e normalizado', () => {
    const a = validarNovoDocumentoClinico({ tipo: 'ANAMNESE', cliente_id: clienteId, conteudo: anamnese });
    assert.equal(a.tipo, 'ANAMNESE');
    assert.equal(a.conteudo.queixa_principal, anamnese.queixa_principal);
    assert.equal(validarNovoDocumentoClinico({
        tipo: 'LAUDO', cliente_id: clienteId, conteudo: laudo,
    }).tipo, 'LAUDO');
    assert.throws(() => validarNovoDocumentoClinico({
        tipo: 'ANAMNESE', cliente_id: clienteId, conteudo: { ...anamnese, secreto: 'indevido' },
    }));
    assert.throws(() => validarNovoDocumentoClinico({
        tipo: 'LAUDO', cliente_id: clienteId, conteudo: anamnese,
    }));
});

test('não permite tipo, IDs, campos ou dados clínicos inválidos', () => {
    assert.throws(() => validarNovoDocumentoClinico({
        tipo: 'EVOLUCAO', cliente_id: clienteId, conteudo: anamnese,
    }));
    assert.throws(() => validarNovoDocumentoClinico({
        tipo: 'ANAMNESE', cliente_id: 'invalido', conteudo: anamnese,
    }));
    assert.throws(() => validarNovoDocumentoClinico({
        tipo: 'ANAMNESE', cliente_id: clienteId, conteudo: { ...anamnese, avaliacao_inicial: ' ' },
    }));
    assert.throws(() => validarDocumentoClinicoId('invalido'));
});

test('revisão exige expectativa de versão, justificativa e natureza adequada', () => {
    const dados = validarRevisaoDocumentoClinico({
        conteudo: anamnese,
        justificativa: 'Corrigir avaliacao ficticia',
        ultima_versao_esperada: 1,
        natureza: 'CORRECAO',
    });
    assert.equal(dados.ultima_versao_esperada, 1);
    assert.throws(() => validarRevisaoDocumentoClinico({
        conteudo: anamnese,
        justificativa: 'curta',
        ultima_versao_esperada: 1,
        natureza: 'CORRECAO',
    }));
    assert.throws(() => validarRevisaoDocumentoClinico({
        conteudo: anamnese,
        justificativa: 'Corrigir avaliacao ficticia',
        ultima_versao_esperada: -1,
        natureza: 'ADENDO',
    }));
    assert.throws(() => validarConteudoParaTipo('LAUDO', anamnese));
    assert.equal(validarFinalizacaoDocumentoClinico({ ultima_versao_esperada: 2 }).ultima_versao_esperada, 2);
});

test('PDF aceita versão positiva ou padrão e rejeita parâmetros arbitrários', () => {
    assert.equal(validarVersaoLaudoPdf({}), undefined);
    assert.equal(validarVersaoLaudoPdf({ versao: '1' }), 1);
    assert.equal(validarVersaoLaudoPdf({ versao: '123' }), 123);
    for (const item of [
        { versao: '0' },
        { versao: '-1' },
        { versao: 'x' },
        { versao: ['1', '2'] },
        { versao: '1000000' },
        { versao: '1', paciente_id: 'outro' },
    ]) {
        assert.throws(() => validarVersaoLaudoPdf(item));
    }
});
