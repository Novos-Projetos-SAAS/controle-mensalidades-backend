import { createHash } from 'node:crypto';
import AppError from '../../../shared/errors/AppError.js';
import { montarClienteCheckout } from '../cliente-checkout.js';
import { credenciais, falha, type Config, type Dependencias } from './model.js';

const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 20);
export class RecursosAbacatePay {
    constructor(private d: Dependencias) {}
    async cliente(config: Config, clienteId: string): Promise<string | undefined> {
        const cliente = await this.d
            .db('clientes')
            .where({ id: clienteId, organizacao_id: config.organizacao_id })
            .whereNull('deletado_em')
            .select('nome', 'email', 'telefone')
            .first();
        if (!cliente)
            throw falha('Cliente não encontrado nesta organização.', 'CLIENTE_NAO_ENCONTRADO', 404);
        const normalized = montarClienteCheckout(cliente);
        // The v2 customer endpoint requires email. Missing fields are collected by the hosted checkout.
        if (!normalized?.email) return undefined;
        const credential = credenciais(config, this.d.key());
        const email = normalized.email;
        return this.recurso(
            config,
            'CLIENTE',
            `${hash(credential.apiKey)}:${clienteId}:${hash(email)}`,
            async () => {
                try {
                    return (await this.d.provider.getCustomer(credential, { email })).id;
                } catch (error) {
                    if (!(error instanceof AppError) || error.code !== 'ABACATEPAY_NAO_ENCONTRADO')
                        throw error;
                }
                const result = await this.d.provider.createCustomer(credential, {
                    email,
                    ...(normalized.name ? { name: normalized.name } : {}),
                    ...(normalized.phone_number ? { cellphone: normalized.phone_number } : {}),
                });
                return result.id;
            },
        );
    }
    async produto(config: Config, chave: string, valor: number, recorrente: boolean) {
        const credential = credenciais(config, this.d.key());
        const externalId = `cm-${config.organizacao_id}-${chave}-${valor}-${recorrente ? 'mensal' : 'avulso'}`;
        return this.recurso(
            config,
            'PRODUTO',
            `${hash(credential.apiKey)}:${hash(externalId)}`,
            async () => {
                let result;
                try {
                    result = await this.d.provider.getProduct(credential, { externalId });
                } catch (error) {
                    if (!(error instanceof AppError) || error.code !== 'ABACATEPAY_NAO_ENCONTRADO')
                        throw error;
                }
                result ??= await this.d.provider.createProduct(credential, {
                    externalId,
                    name: recorrente ? 'Mensalidade recorrente' : 'Mensalidade',
                    price: valor,
                    currency: 'BRL',
                    ...(recorrente ? { cycle: 'MONTHLY' as const } : {}),
                });
                if (
                    result.price !== valor ||
                    result.currency !== 'BRL' ||
                    (recorrente ? result.cycle !== 'MONTHLY' : !!result.cycle)
                )
                    throw falha(
                        'O valor da cobrança precisa ser conferido.',
                        'ABACATEPAY_PRODUTO_DIVERGENTE',
                    );
                return result.id;
            },
        );
    }
    private async recurso(
        config: Config,
        tipo: string,
        chave: string,
        create: () => Promise<string>,
    ) {
        const filter = {
            integracao_id: config.id,
            organizacao_id: config.organizacao_id,
            ambiente: config.ambiente,
            tipo,
            chave,
        };
        await this.d
            .db('recursos_pagamento')
            .insert(filter)
            .onConflict(['integracao_id', 'ambiente', 'tipo', 'chave'])
            .ignore();
        // Resource POSTs are idempotent by email/externalId; serialize competing local creators.
        return this.d.db.transaction(async (trx) => {
            const current = await trx('recursos_pagamento').where(filter).forUpdate().first();
            if (current.identificador_externo) return String(current.identificador_externo);
            const id = await create();
            await trx('recursos_pagamento')
                .where('id', current.id)
                .update({ identificador_externo: id, status: 'ATIVO' });
            return id;
        });
    }
}
