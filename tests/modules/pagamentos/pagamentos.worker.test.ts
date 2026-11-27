import assert from 'node:assert/strict';
import test from 'node:test';
import { executarCiclosPagamento } from '../../../src/modules/pagamentos/pagamentos.worker.js';

test('falha de um provedor não impede o outro e o ciclo aguarda ambos terminarem', async (t) => {
    const log = t.mock.method(console, 'warn', () => undefined);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let secondFinished = false;
    let finished = false;
    const running = executarCiclosPagamento([
        async () => {
            throw Object.assign(new Error('detalhes internos'), { code: 'PROVEDOR_INDISPONIVEL' });
        },
        async () => {
            await gate;
            secondFinished = true;
        },
    ]).then(() => {
        finished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    release();
    await running;
    assert.equal(secondFinished, true);
    assert.equal(log.mock.callCount(), 1);
    assert.deepEqual(log.mock.calls[0]!.arguments, [
        'Rotina de pagamentos aguardando recuperação.',
        { codigo: 'PROVEDOR_INDISPONIVEL' },
    ]);
});
