export interface PaymentIdentifiers {
    order_nsu: string;
    transaction_nsu: string;
    slug: string;
}

export interface OfficialPayment {
    amount: number;
    paid_amount: number;
    capture_method: 'pix' | 'credit_card';
    installments: number;
}

export interface PagamentoProvider {
    createLink(apiKey: string, payload: Record<string, unknown>): Promise<{ url: string }>;
    checkPayment(apiKey: string, payload: Record<string, unknown>): Promise<unknown>;
}
