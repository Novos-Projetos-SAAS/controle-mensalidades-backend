import type { Knex } from 'knex';
import AppError from '../../shared/errors/AppError.js';
import { cifrarSegredo, validarChaveEncriptacao } from './credenciais.js';
import { resolverOrigemPlataforma } from './pagamento.policy.js';
import {
    PagamentosRepository,
    type ConfiguracaoPagamento,
    type ContextoPagamento,
} from './pagamentos.repository.js';
import { validarConfiguracaoPagamento } from './pagamentos.validator.js';

export function configuracaoPublica(row?: ConfiguracaoPagamento) {
    return {
        ativo: row?.ativo ?? false,
        geracao_automatica: row?.geracao_automatica ?? false,
        dias_antecedencia: row?.dias_antecedencia ?? 2,
        handle: row?.handle ?? null,
        has_api_key: Boolean(row?.configuracao_criptografada),
    };
}

export class PagamentosConfiguracao {
    private repo: PagamentosRepository;
    constructor(
        db: Knex,
        private key: () => string | undefined,
        private origens: () => ReadonlySet<string>,
        private ambiente: () => string,
    ) {
        this.repo = new PagamentosRepository(db);
    }
    async ler(contexto: ContextoPagamento) {
        return configuracaoPublica(await this.repo.configuracao(contexto.organizacaoId).first());
    }

    async atualizar(contexto: ContextoPagamento, value: unknown, origem?: string) {
        const input = validarConfiguracaoPagamento(value);
        const platform = resolverOrigemPlataforma(origem, this.origens(), this.ambiente());
        return this.repo.db.transaction(async (trx) => {
            await trx('integracoes_pagamento')
                .insert({
                    organizacao_id: contexto.organizacaoId,
                    provedor: 'INFINITEPAY',
                    ativo: false,
                })
                .onConflict(['organizacao_id', 'provedor'])
                .ignore();
            const current = (await this.repo
                .configuracao(contexto.organizacaoId, trx)
                .forUpdate()
                .first())!;
            const next = {
                ...current,
                ativo: input.ativo ?? current.ativo,
                geracao_automatica: input.geracao_automatica ?? current.geracao_automatica,
                dias_antecedencia: input.dias_antecedencia ?? current.dias_antecedencia,
                handle: input.handle === undefined ? current.handle : input.handle,
                origem_plataforma: platform,
            };
            if (input.handle === null) next.configuracao_criptografada = null;
            if (
                input.handle &&
                input.handle !== current.handle &&
                current.configuracao_criptografada &&
                !input.api_key
            )
                throw new AppError(
                    'Trocar a InfiniteTag exige nova API Key.',
                    409,
                    'INFINITEPAY_CONTA_ALTERADA',
                );
            if (input.api_key) {
                if (!next.handle)
                    throw new AppError(
                        'Informe a InfiniteTag.',
                        400,
                        'INFINITEPAY_HANDLE_OBRIGATORIA',
                    );
                next.configuracao_criptografada = cifrarSegredo(
                    input.api_key,
                    this.key(),
                    `infinitepay:${contexto.organizacaoId}:${next.handle}`,
                );
            }
            if (next.ativo) {
                validarChaveEncriptacao(this.key());
                if (!next.handle || !next.configuracao_criptografada)
                    throw new AppError(
                        'Configure a InfiniteTag e a API Key para ativar.',
                        400,
                        'INFINITEPAY_CREDENCIAL_OBRIGATORIA',
                    );
            }
            const [saved] = await this.repo
                .configuracao(contexto.organizacaoId, trx)
                .update({
                    ativo: next.ativo,
                    geracao_automatica: next.geracao_automatica,
                    dias_antecedencia: next.dias_antecedencia,
                    handle: next.handle,
                    origem_plataforma: platform,
                    configuracao_criptografada: next.configuracao_criptografada,
                    atualizado_em: trx.fn.now(),
                })
                .returning('*');
            await trx('registros_auditoria').insert({
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                usuario_id: contexto.usuarioId,
                acao: 'INFINITEPAY.CONFIGURAR',
                recurso: 'INTEGRACAO_PAGAMENTO',
                recurso_id: current.id,
                dados_contexto: {
                    ativo: next.ativo,
                    geracao_automatica: next.geracao_automatica,
                    dias_antecedencia: next.dias_antecedencia,
                    credencial_substituida: Boolean(input.api_key),
                },
            });
            return configuracaoPublica(saved);
        });
    }
}
