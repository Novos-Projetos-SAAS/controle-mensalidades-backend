import type { Knex } from 'knex';
import AppError from '../../shared/errors/AppError.js';

export type PosseEvento = {
    id: string;
    organizacao_id: string;
    provedor: string;
    lease_token: string;
};

export async function exigirPosseEvento(trx: Knex.Transaction, evento: PosseEvento, agora: Date) {
    const owned = await trx('eventos_webhook')
        .where({
            id: evento.id,
            organizacao_id: evento.organizacao_id,
            provedor: evento.provedor,
            status: 'PROCESSANDO',
            lease_token: evento.lease_token,
        })
        .where('lease_ate', '>', agora)
        .forUpdate()
        .first('id');
    if (!owned)
        throw new AppError(
            'Este pagamento está sendo atualizado. Aguarde.',
            409,
            'PAGAMENTO_LEASE_PERDIDO',
        );
}
