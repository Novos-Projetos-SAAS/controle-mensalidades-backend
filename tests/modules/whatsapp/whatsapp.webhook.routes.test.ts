import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

process.env.WHATSAPP_META_WEBHOOK_VERIFY_TOKEN = 'webhook-token-fixture';
process.env.WHATSAPP_META_APP_SECRET = 'webhook-app-secret-fixture';

const [{ default: app }, { default: request }] = await Promise.all([
    import('../../../src/app.js'),
    import('supertest'),
]);

test('handshake Meta é público e retorna challenge apenas para token válido', async () => {
    const valido = await request(app).get('/api/v1/whatsapp/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'webhook-token-fixture',
        'hub.challenge': 'challenge-fixture',
    });
    assert.equal(valido.status, 200);
    assert.equal(valido.text, 'challenge-fixture');

    const invalido = await request(app).get('/api/v1/whatsapp/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-incorreto',
        'hub.challenge': 'challenge-fixture',
    });
    assert.equal(invalido.status, 403);
});

test('POST valida HMAC no corpo bruto e rejeita assinatura inválida ou corpo alterado', async () => {
    const segredo = 'webhook-app-secret-fixture';
    const corpo = '{"object":"whatsapp_business_account","entry":[]}';
    const assinatura = `sha256=${createHmac('sha256', segredo).update(Buffer.from(corpo)).digest('hex')}`;
    const sucesso = await request(app)
        .post('/api/v1/whatsapp/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', assinatura)
        .send(corpo);
    assert.equal(sucesso.status, 200, JSON.stringify(sucesso.body));
    assert.equal(sucesso.body.recebido, true);

    const assinaturaInvalida = await request(app)
        .post('/api/v1/whatsapp/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', `sha256=${'0'.repeat(64)}`)
        .send(corpo);
    assert.equal(assinaturaInvalida.status, 401);

    const corpoAlterado = await request(app)
        .post('/api/v1/whatsapp/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', assinatura)
        .send(corpo.replace('[]', '[ ]'));
    assert.equal(corpoAlterado.status, 401);
});
