import test from 'node:test';
import assert from 'node:assert/strict';

import AppError from '../../src/shared/errors/AppError.js';
import { validarSenhaForte } from '../../src/validators/senha.validator.js';

function assertSenhaFraca(senha: unknown, mensagem: string) {
    assert.throws(
        () => validarSenhaForte(senha),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, 'SENHA_FRACA');
            assert.equal(error.message, mensagem);

            return true;
        },
    );
}

test('validarSenhaForte deve aceitar uma senha forte', () => {
    const senha = 'SenhaTeste123!';

    assert.equal(validarSenhaForte(senha), senha);
});

test('validarSenhaForte deve rejeitar senha com menos de 12 caracteres', () => {
    assertSenhaFraca('Aa1!aaa', 'A senha deve possuir pelo menos 12 caracteres.');
});

test('validarSenhaForte deve rejeitar senha sem letra minúscula', () => {
    assertSenhaFraca('SENHATESTE123!', 'A senha deve possuir uma letra minúscula.');
});

test('validarSenhaForte deve rejeitar senha sem letra maiúscula', () => {
    assertSenhaFraca('senhateste123!', 'A senha deve possuir uma letra maiúscula.');
});

test('validarSenhaForte deve rejeitar senha sem número', () => {
    assertSenhaFraca('SenhaSemNumero!', 'A senha deve possuir um número.');
});

test('validarSenhaForte deve rejeitar senha sem caractere especial', () => {
    assertSenhaFraca('SenhaTeste123', 'A senha deve possuir um caractere especial.');
});

test('validarSenhaForte deve rejeitar senha com mais de 128 caracteres', () => {
    const senha = `Aa1!${'a'.repeat(125)}`;

    assertSenhaFraca(senha, 'A senha deve possuir no máximo 128 caracteres.');
});
