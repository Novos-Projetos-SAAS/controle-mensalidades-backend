import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { abrirEstadoBaileys, cifrarEstadoBaileys, chaveBaileys } from '../../../src/modules/whatsapp/whatsapp.baileys.crypto.js';

test('estado autenticado não pode ser transferido entre áreas', () => {
    const chave = randomBytes(32);
    const cifra = cifrarEstadoBaileys('{"segredo":"teste"}', 'org:area', chave);
    assert.equal(abrirEstadoBaileys(cifra, 'org:area', chave), '{"segredo":"teste"}');
    assert.throws(() => abrirEstadoBaileys(cifra, 'org:outra', chave));
    assert.throws(() => abrirEstadoBaileys(cifra, 'org:area', randomBytes(32)));
    assert.notEqual(cifra, cifrarEstadoBaileys('{"segredo":"teste"}', 'org:area', chave));
    assert.equal(chaveBaileys(chave.toString('base64')).length, 32);
    assert.throws(() => chaveBaileys('invalida'));
});
