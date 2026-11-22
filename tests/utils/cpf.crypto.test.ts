import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cifrarCpf,
    decifrarCpf,
    indiceCpf,
    camposCpfPersistencia,
    type ChavesCpf,
} from '../../src/utils/cpf.crypto.js';

const chaves: ChavesCpf = {
    criptografia: Buffer.alloc(32, 11),
    indice: Buffer.alloc(32, 22),
};
const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const idA = '33333333-3333-4333-8333-333333333333';
const idB = '44444444-4444-4444-8444-444444444444';

test('AES-256-GCM protege CPF e usa nonce aleatório', () => {
    const primeiro = cifrarCpf('cliente', orgA, idA, '52998224725', chaves);
    const segundo = cifrarCpf('cliente', orgA, idA, '52998224725', chaves);
    assert.notEqual(primeiro, segundo);
    assert.equal(decifrarCpf('cliente', orgA, idA, primeiro, chaves), '52998224725');
    assert.equal(primeiro.includes('52998224725'), false);
});

test('GCM rejeita mudança de organização, registro, tipo, chave e adulteração', () => {
    const valor = cifrarCpf('cliente', orgA, idA, '11144477735', chaves);
    assert.throws(() => decifrarCpf('cliente', orgB, idA, valor, chaves));
    assert.throws(() => decifrarCpf('cliente', orgA, idB, valor, chaves));
    assert.throws(() => decifrarCpf('profissional', orgA, idA, valor, chaves));
    assert.throws(() =>
        decifrarCpf('cliente', orgA, idA, valor, {
            ...chaves,
            criptografia: Buffer.alloc(32, 33),
        }),
    );
    const partes = valor.split('.');
    const corpo = Buffer.from(partes[3]!, 'base64url');
    corpo[0] = corpo[0]! ^ 1;
    partes[3] = corpo.toString('base64url');
    assert.throws(() => decifrarCpf('cliente', orgA, idA, partes.join('.'), chaves));
});

test('HMAC é estável dentro da organização, isolado entre tenants e tipos', () => {
    const a = indiceCpf('cliente', orgA, '529.982.247-25', chaves);
    assert.equal(a, indiceCpf('cliente', orgA, '52998224725', chaves));
    assert.notEqual(a, indiceCpf('cliente', orgB, '52998224725', chaves));
    assert.notEqual(a, indiceCpf('profissional', orgA, '52998224725', chaves));
    assert.match(a, /^[a-f\d]{64}$/);
    const storage = camposCpfPersistencia('cliente', orgA, idA, '52998224725', chaves);
    assert.equal(storage.cpf, null);
    assert.equal(storage.cpf_indice, a);
    assert.ok(storage.cpf_cifrado);
});

test('armazenamento de CPF nulo não mantém cifra nem índice', () => {
    assert.deepEqual(camposCpfPersistencia('cliente', orgA, idA, null, chaves), {
        cpf: null,
        cpf_cifrado: null,
        cpf_indice: null,
    });
});

test('cifra rejeita formato inválido, nonce e tag adulterados', () => {
    const cifrado = cifrarCpf('cliente', orgA, idA, '52998224725', chaves);
    const [versao, nonce, tag, corpo] = cifrado.split('.');
    assert.equal(versao, 'v1');
    assert.throws(() => decifrarCpf('cliente', orgA, idA, cifrado.replace('v1.', 'v2.'), chaves));
    assert.throws(() => decifrarCpf('cliente', orgA, idA, 'v1.not-base64', chaves));
    assert.throws(
        () => decifrarCpf('cliente', orgA, idA, ['v1', nonce!.slice(1), tag, corpo].join('.'), chaves),
    );
    const tagAlterada = Buffer.from(tag!, 'base64url');
    tagAlterada[0] = tagAlterada[0]! ^ 1;
    assert.throws(() => decifrarCpf('cliente', orgA, idA, ['v1', nonce, tagAlterada.toString('base64url'), corpo].join('.'), chaves));
});
