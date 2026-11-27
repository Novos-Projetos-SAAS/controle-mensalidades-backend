type ContaFinanceira = { status_conta: string; cancelado_em: unknown };

export function situacaoFinanceiraCobranca(
    conta: ContaFinanceira,
    saldo: bigint,
    valorCobranca: bigint,
    statusCobranca: string,
) {
    const status =
        conta.cancelado_em || conta.status_conta === 'CANCELADO'
            ? 'CANCELADO'
            : statusCobranca === 'PAGO_VERIFICADO'
              ? statusCobranca
              : conta.status_conta === 'PAGO' || saldo <= 0n
                ? 'QUITADO'
                : statusCobranca === 'PAGO_EM_REVISAO'
                  ? statusCobranca
                  : valorCobranca > saldo
                    ? 'SALDO_ATUALIZADO'
                    : statusCobranca;
    return {
        status,
        pagavel:
            status === 'AGUARDANDO_PAGAMENTO' &&
            conta.status_conta === 'PENDENTE' &&
            valorCobranca > 0n &&
            saldo >= valorCobranca,
    };
}
