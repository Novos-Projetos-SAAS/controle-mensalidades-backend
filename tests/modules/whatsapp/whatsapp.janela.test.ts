import assert from 'node:assert/strict';
import { test } from 'node:test';
import { janelaWhatsappAberta } from '../../../src/modules/whatsapp/whatsapp.janela.js';

test('janela de envio respeita o horário de Brasília e seus limites', () => {
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T11:59:59Z')), false);
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T12:00:00Z')), true);
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T21:59:59Z')), true);
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T22:00:00Z')), false);
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T02:00:00Z')), false);
});

test('aceita janela configurável e rejeita horários inválidos', () => {
    assert.equal(janelaWhatsappAberta(new Date('2026-11-28T12:00:00Z'), '10:00', '18:00'), false);
    assert.throws(() => janelaWhatsappAberta(new Date(), '24:00', '18:00'));
    assert.throws(() => janelaWhatsappAberta(new Date(), '18:00', '09:00'));
    assert.throws(() => janelaWhatsappAberta(new Date(), '09:00', '09:00'));
});
