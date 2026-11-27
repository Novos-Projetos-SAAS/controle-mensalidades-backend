import type { Knex } from 'knex';
import { z } from 'zod';
import { resolverOrigemPlataforma } from '../pagamento.policy.js';
import {
    ativas,
    auditoria,
    cifrarCredenciais,
    configuracaoPublica,
    credenciais,
    falha,
    type Config,
    type Contexto,
} from './model.js';

const input = z
    .object({
        ativo: z.boolean().optional(),
        ambiente: z.enum(['TESTE', 'PRODUCAO']).optional(),
        api_key: z
            .string()
            .min(12)
            .max(512)
            .regex(/^abc_(dev|prod)_[A-Za-z0-9_-]+$/)
            .optional(),
        webhook_secret: z.string().min(32).max(512).optional(),
        recorrencia_habilitada: z.boolean().optional(),
        cartao_recorrente: z.boolean().optional(),
        pix_automatico_solicitado: z.boolean().optional(),
    })
    .strict();
export class AbacatePayConfiguracao {
    constructor(
        readonly db: Knex,
        readonly key: () => string | undefined,
        readonly origens: () => ReadonlySet<string>,
        readonly ambiente: () => string,
    ) {}
    query(org: string, trx: Knex | Knex.Transaction = this.db) {
        return trx<Config>('integracoes_pagamento').where({
            organizacao_id: org,
            provedor: 'ABACATEPAY',
        });
    }
    async ler(c: Contexto) {
        return configuracaoPublica(await this.query(c.organizacaoId).first());
    }
    async atualizar(c: Contexto, body: unknown, origin?: string) {
        const parsed = input.safeParse(body);
        if (!parsed.success)
            throw falha(
                'Confira os dados da conta de pagamento.',
                'ABACATEPAY_DADOS_INVALIDOS',
                400,
            );
        const v = parsed.data;
        return this.db.transaction(async (trx) => {
            await trx('organizacoes').where('id', c.organizacaoId).forUpdate().first();
            await trx('integracoes_pagamento')
                .insert({ organizacao_id: c.organizacaoId, provedor: 'ABACATEPAY', ativo: false })
                .onConflict(['organizacao_id', 'provedor'])
                .ignore();
            const current = (await this.query(c.organizacaoId, trx).forUpdate().first())!;
            const env = v.ambiente ?? current.ambiente;
            if (v.api_key && !v.api_key.startsWith(env === 'TESTE' ? 'abc_dev_' : 'abc_prod_'))
                throw falha(
                    'A chave informada não corresponde ao ambiente selecionado.',
                    'ABACATEPAY_AMBIENTE_INVALIDO',
                    400,
                );
            const old = current.configuracao_criptografada
                ? credenciais(current, this.key())
                : null;
            const change =
                env !== current.ambiente ||
                Boolean(v.api_key && v.api_key !== old?.apiKey) ||
                Boolean(v.webhook_secret && v.webhook_secret !== old?.webhookSecret);
            if (change) {
                const charge = await trx('cobrancas_pagamento')
                    .where({ organizacao_id: c.organizacaoId, provedor: 'ABACATEPAY' })
                    .whereIn('status', ativas)
                    .first();
                const recurring = await trx('recorrencias_pagamento')
                    .where('organizacao_id', c.organizacaoId)
                    .whereNot('status', 'CANCELADA')
                    .first();
                if (charge || recurring)
                    throw falha(
                        'Existem cobranças ou pagamentos automáticos em andamento. Conclua ou cancele antes de trocar a conta.',
                    );
                if (env !== current.ambiente && (!v.api_key || !v.webhook_secret))
                    throw falha('Informe a chave e o segredo da nova conta de pagamento.');
            }
            const apiKey = v.api_key ?? old?.apiKey,
                webhookSecret = v.webhook_secret ?? old?.webhookSecret;
            const active = v.ativo ?? current.ativo;
            if (active && (!apiKey || !webhookSecret))
                throw falha('Configure sua conta para começar a receber.');
            if (active && env === 'PRODUCAO')
                throw falha(
                    'Conclua a homologação no Modo Teste antes de ativar recebimentos em produção.',
                    'ABACATEPAY_HOMOLOGACAO_PENDENTE',
                );
            if (v.pix_automatico_solicitado && current.pix_automatico_estado !== 'DISPONIVEL')
                throw falha(
                    'Pix Automático ainda não foi liberado e validado nesta conta.',
                    'ABACATEPAY_PIX_INDISPONIVEL',
                );
            const [saved] = await this.query(c.organizacaoId, trx)
                .update({
                    ambiente: env,
                    ativo: active,
                    recorrencia_habilitada:
                        v.recorrencia_habilitada ?? current.recorrencia_habilitada,
                    cartao_recorrente: v.cartao_recorrente ?? current.cartao_recorrente,
                    origem_plataforma: origin
                        ? resolverOrigemPlataforma(origin, this.origens(), this.ambiente())
                        : current.origem_plataforma,
                    configuracao_criptografada:
                        apiKey && webhookSecret
                            ? cifrarCredenciais(
                                  { ...current, ambiente: env },
                                  { apiKey, webhookSecret },
                                  this.key(),
                              )
                            : current.configuracao_criptografada,
                    pix_automatico_estado: change
                        ? 'NAO_VERIFICADO'
                        : current.pix_automatico_estado,
                })
                .returning('*');
            await auditoria(trx, c, 'CONFIGURAR', current.id, {
                ativo: active,
                ambiente: env,
                credencial_substituida: change,
            });
            return configuracaoPublica(saved);
        });
    }
    async integracoes(c: Contexto) {
        const rows = await this.db<Config>('integracoes_pagamento').where(
            'organizacao_id',
            c.organizacaoId,
        );
        return {
            provedor_padrao: rows.find((r) => r.padrao)?.provedor ?? 'INFINITEPAY',
            infinitepay: { ativo: rows.some((r) => r.provedor === 'INFINITEPAY' && r.ativo) },
            abacatepay: { ativo: rows.some((r) => r.provedor === 'ABACATEPAY' && r.ativo) },
        };
    }
    async padrao(c: Contexto, value: unknown) {
        const v = z
            .object({ provedor: z.enum(['INFINITEPAY', 'ABACATEPAY']) })
            .strict()
            .safeParse(value);
        if (!v.success)
            throw falha('Escolha uma conta de pagamento válida.', 'PROVEDOR_INVALIDO', 400);
        await this.db.transaction(async (trx) => {
            await trx('organizacoes').where('id', c.organizacaoId).forUpdate().first();
            const target = await trx<Config>('integracoes_pagamento')
                .where({ organizacao_id: c.organizacaoId, provedor: v.data.provedor, ativo: true })
                .first();
            if (!target) throw falha('Configure e ative a conta de pagamento primeiro.');
            await trx('integracoes_pagamento')
                .where('organizacao_id', c.organizacaoId)
                .update({ padrao: false });
            await trx('integracoes_pagamento').where('id', target.id).update({ padrao: true });
            await auditoria(trx, c, 'PROVEDOR_PADRAO', target.id, { provedor: v.data.provedor });
        });
        return this.integracoes(c);
    }
}
