import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';

import { avaliarRegistroCpf, type LinhaAuditoriaCpf } from '../../src/utils/cpf.audit.js';
import { cifrarCpf, indiceCpf, type ChavesCpf } from '../../src/utils/cpf.crypto.js';

const chaves: ChavesCpf = { criptografia: randomBytes(32), indice: randomBytes(32) };
const organizacaoId = randomUUID();
const id = randomUUID();
const cpf = '52998224725';
const original: LinhaAuditoriaCpf = {
    id,
    organizacao_id: organizacaoId,
    cpf: null,
    cpf_cifrado: cifrarCpf('cliente', organizacaoId, id, cpf, chaves),
    cpf_indice: indiceCpf('cliente', organizacaoId, cpf, chaves),
};

test('valida cifra e índice corretos sem retornar o documento', () => {
    assert.equal(avaliarRegistroCpf('cliente', original, chaves), 'valido');
});
test('identifica ausência de documento sem falso positivo', () => {
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, cpf_cifrado: null, cpf_indice: null }, chaves),
        'sem_cpf',
    );
});
test('reprova CPF legado mesmo quando também houver cifra', () => {
    assert.equal(avaliarRegistroCpf('cliente', { ...original, cpf }, chaves), 'texto_claro');
});
test('reprova campos de proteção presentes isoladamente', () => {
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, cpf_indice: null }, chaves),
        'inconsistente',
    );
});
test('reprova índice divergente sem revelar CPF', () => {
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, cpf_indice: 'a'.repeat(64) }, chaves),
        'indice_invalido',
    );
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, cpf_indice: 'inválido' }, chaves),
        'indice_invalido',
    );
});
test('reprova cifra adulterada, chave diferente e contexto de outra academia', () => {
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, cpf_cifrado: 'v1.corrompido' }, chaves),
        'cifra_invalida',
    );
    assert.equal(
        avaliarRegistroCpf('cliente', original, { ...chaves, criptografia: randomBytes(32) }),
        'cifra_invalida',
    );
    assert.equal(
        avaliarRegistroCpf('cliente', { ...original, organizacao_id: randomUUID() }, chaves),
        'cifra_invalida',
    );
    assert.equal(avaliarRegistroCpf('profissional', original, chaves), 'cifra_invalida');
});
