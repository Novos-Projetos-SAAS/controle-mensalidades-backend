import assert from 'node:assert/strict';
import test from 'node:test';
import { situacaoFinanceiraCobranca } from '../../../src/modules/pagamentos/situacao-cobranca.js';

const pending = { status_conta: 'PENDENTE', cancelado_em: null };
test('quitação interna prevalece sobre tentativa pendente sem afirmar confirmação externa', () => {
    const result = situacaoFinanceiraCobranca(
        { ...pending, status_conta: 'PAGO' },
        0n,
        10000n,
        'AGUARDANDO_PAGAMENTO',
    );
    assert.deepEqual(result, { status: 'QUITADO', pagavel: false });
});
test('saldo zero impede pagamento mesmo com status contábil atrasado', () => {
    assert.deepEqual(situacaoFinanceiraCobranca(pending, 0n, 10000n, 'CRIACAO_INCERTA'), {
        status: 'QUITADO',
        pagavel: false,
    });
});
test('baixa parcial bloqueia link antigo sem quitar saldo restante', () => {
    assert.deepEqual(situacaoFinanceiraCobranca(pending, 8000n, 10000n, 'AGUARDANDO_PAGAMENTO'), {
        status: 'SALDO_ATUALIZADO',
        pagavel: false,
    });
});
test('pagamento externo verificado mantém sua identidade quando a conta está quitada', () => {
    assert.deepEqual(
        situacaoFinanceiraCobranca(
            { ...pending, status_conta: 'PAGO' },
            0n,
            10000n,
            'PAGO_VERIFICADO',
        ),
        { status: 'PAGO_VERIFICADO', pagavel: false },
    );
});
test('revisão externa não reabre a cobrança de uma conta já quitada', () => {
    assert.deepEqual(
        situacaoFinanceiraCobranca(
            { ...pending, status_conta: 'PAGO' },
            0n,
            10000n,
            'PAGO_EM_REVISAO',
        ),
        { status: 'QUITADO', pagavel: false },
    );
});
test('conta cancelada não se apresenta como quitação', () => {
    assert.deepEqual(
        situacaoFinanceiraCobranca(
            { ...pending, status_conta: 'CANCELADO' },
            0n,
            10000n,
            'AGUARDANDO_PAGAMENTO',
        ),
        { status: 'CANCELADO', pagavel: false },
    );
});
test('somente saldo e cobrança compatíveis permitem pagar', () => {
    assert.deepEqual(situacaoFinanceiraCobranca(pending, 10000n, 10000n, 'AGUARDANDO_PAGAMENTO'), {
        status: 'AGUARDANDO_PAGAMENTO',
        pagavel: true,
    });
    assert.equal(
        situacaoFinanceiraCobranca(pending, 10000n, 0n, 'AGUARDANDO_PAGAMENTO').pagavel,
        false,
    );
    assert.equal(situacaoFinanceiraCobranca(pending, 10000n, 10000n, 'CRIANDO').pagavel, false);
});

test('pagamento externo em revisão após baixa parcial mantém alerta de conferência', () => {
    assert.deepEqual(situacaoFinanceiraCobranca(pending, 7000n, 10000n, 'PAGO_EM_REVISAO'), {
        status: 'PAGO_EM_REVISAO',
        pagavel: false,
    });
});
