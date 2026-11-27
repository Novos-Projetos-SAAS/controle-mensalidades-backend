import assert from 'node:assert/strict';
import test from 'node:test';

import {
    validarHistoricoPacienteId,
    validarLimiteHistorico,
    validarPaginacaoHistorico,
} from '../../../src/modules/prontuario/prontuario.timeline.validator.js';
import {
    ordenarLinhaTempo,
    type EntradaLinhaTempo,
} from '../../../src/modules/prontuario/prontuario.timeline.service.js';

const pacienteId = '33333333-3333-4333-8333-333333333333';

test('valida paginação e rejeita offsets arbitrários e filtros não autorizados', () => {
    assert.equal(validarHistoricoPacienteId(pacienteId), pacienteId);
    assert.deepEqual(validarPaginacaoHistorico({}), { limite: 50, deslocamento: 0 });
    assert.deepEqual(validarPaginacaoHistorico({ limite: '25', deslocamento: '50' }), {
        limite: 25,
        deslocamento: 50,
    });
    assert.equal(validarLimiteHistorico({ limite: '20' }), 20);

    for (const query of [
        { deslocamento: '-1' },
        { deslocamento: '10001' },
        { deslocamento: '0.5' },
        { limite: '0' },
        { limite: '101' },
        { deslocamento: ['1', '2'] },
        { limite: '50', profissionalId: 'outro' },
    ]) {
        assert.throws(() => validarPaginacaoHistorico(query), { codigo: 'FILTRO_HISTORICO_INVALIDO' });
    }
});

test('pagina a linha do tempo unificada de sessões e documentos com desempate estável', () => {
    const tipos: EntradaLinhaTempo['tipo'][] = ['EVOLUCAO', 'LAUDO', 'ANAMNESE', 'EVOLUCAO'];
    const entradas: EntradaLinhaTempo[] = tipos.map((tipo, indice) => ({
        id: `00000000-0000-4000-8000-00000000000${indice + 1}`,
        tipo,
        paciente_id: pacienteId,
        data: indice < 2 ? '2026-11-26T10:00:00.000Z' : '2026-11-25T10:00:00.000Z',
        profissional_id: '44444444-4444-4444-8444-444444444444',
        profissional_nome: 'Profissional fictício',
        titulo: 'Registro fictício',
        versao: tipo === 'EVOLUCAO' ? null : 1,
        estado: tipo === 'EVOLUCAO' ? null : 'RASCUNHO',
    }));
    const pagina1 = ordenarLinhaTempo([...entradas].reverse(), 2, 0);
    const pagina2 = ordenarLinhaTempo([...entradas], 2, 2);
    const ids = [...pagina1, ...pagina2].map((item) => item.id);

    assert.deepEqual(ids, entradas.map((item) => item.id));
    assert.equal(new Set(ids).size, 4);
    assert.deepEqual(ordenarLinhaTempo([...entradas], 2, 4), []);
});
