import { randomUUID } from 'node:crypto';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import type { ConfiguracaoMetaWhatsapp } from './whatsapp.contracts.js';
import type { AtivosMetaVerificados } from './whatsapp.onboarding.meta.js';
import {
    criarCofreCredenciaisWhatsapp,
    type CredenciaisAcessoMeta,
} from './whatsapp.credentials.js';

type Escopo = { correlacaoId: string; organizacaoId: string; areaNegocioId: string };

function erro(status: number, codigo: string, mensagem = codigo) {
    return new AppError(mensagem, status, codigo);
}

class RepositorioOnboardingWhatsapp {
    async iniciar(input: {
        organizacaoId: string;
        areaNegocioId: string;
        usuarioId: string;
        stateHash: string;
        expiraEm: Date;
    }) {
        const area = await connection('areas_negocio')
            .select('id')
            .where({ id: input.areaNegocioId, organizacao_id: input.organizacaoId, ativo: true })
            .whereNull('deletado_em')
            .first();
        if (!area) throw erro(404, 'AREA_NEGOCIO_NAO_ENCONTRADA');
        const [criado] = await connection('integracoes_whatsapp_onboarding')
            .insert({
                organizacao_id: input.organizacaoId,
                area_negocio_id: input.areaNegocioId,
                usuario_id: input.usuarioId,
                state_hash: input.stateHash,
                expira_em: input.expiraEm,
                status: 'INICIADO',
            })
            .returning(['id', 'expira_em']);
        return { correlacaoId: criado.id as string, expiraEm: criado.expira_em as Date };
    }

    async consumirCallback(
        input: Escopo & {
            usuarioId: string;
            stateHash: string;
            codigoHash?: string;
            cancelado: boolean;
            agora: Date;
        },
    ) {
        try {
            const resultado = await connection.transaction(async (transaction) => {
                const onboarding = await transaction('integracoes_whatsapp_onboarding')
                    .where({
                        id: input.correlacaoId,
                        organizacao_id: input.organizacaoId,
                        area_negocio_id: input.areaNegocioId,
                        usuario_id: input.usuarioId,
                        state_hash: input.stateHash,
                    })
                    .forUpdate()
                    .first();
                if (!onboarding) throw erro(404, 'ONBOARDING_NAO_ENCONTRADO');
                if (onboarding.status !== 'INICIADO') throw erro(409, 'ONBOARDING_JA_CONSUMIDO');
                if (new Date(onboarding.expira_em).valueOf() <= input.agora.valueOf()) {
                    await transaction('integracoes_whatsapp_onboarding')
                        .where({ id: input.correlacaoId })
                        .update({ status: 'EXPIRADO', concluido_em: transaction.fn.now() });
                    return { status: 'EXPIRADO' as const };
                }
                if (input.cancelado) {
                    await transaction('integracoes_whatsapp_onboarding')
                        .where({ id: input.correlacaoId })
                        .update({ status: 'CANCELADO', concluido_em: transaction.fn.now() });
                    return { status: 'CANCELADO' as const };
                }
                if (!input.codigoHash) throw erro(400, 'CODIGO_AUTORIZACAO_OBRIGATORIO');
                const codigoUsado = await transaction('integracoes_whatsapp_onboarding')
                    .select('id')
                    .where({ codigo_autorizacao_hash: input.codigoHash })
                    .first();
                if (codigoUsado) throw erro(409, 'CODIGO_AUTORIZACAO_REUTILIZADO');
                await transaction('integracoes_whatsapp_onboarding')
                    .where({ id: input.correlacaoId })
                    .update({
                        codigo_autorizacao_hash: input.codigoHash,
                        status: 'PROCESSANDO',
                    });
                return { status: 'PROCESSANDO' as const };
            });
            if (resultado.status === 'EXPIRADO') throw erro(410, 'ONBOARDING_EXPIRADO');
            return resultado;
        } catch (cause) {
            const pgError = cause as { code?: string; constraint?: string };
            if (pgError.code === '23505' && pgError.constraint === 'uq_whatsapp_onboarding_code') {
                throw erro(409, 'CODIGO_AUTORIZACAO_REUTILIZADO');
            }
            throw cause;
        }
    }

    async registrarAutorizacao(input: {
        escopo: Escopo;
        usuarioId: string;
        modo: 'CLOUD_API' | 'COEXISTENCIA';
        ativos: AtivosMetaVerificados;
        credenciais: CredenciaisAcessoMeta;
        auditoria?: { ip?: string; userAgent?: string };
    }) {
        return connection.transaction(async (transaction) => {
            const onboarding = await transaction('integracoes_whatsapp_onboarding')
                .where({
                    id: input.escopo.correlacaoId,
                    organizacao_id: input.escopo.organizacaoId,
                    area_negocio_id: input.escopo.areaNegocioId,
                    usuario_id: input.usuarioId,
                    status: 'PROCESSANDO',
                })
                .forUpdate()
                .first();
            if (!onboarding) throw erro(409, 'ONBOARDING_NAO_PROCESSAVEL');

            const chavesAtivo = [
                `meta-messaging:${input.ativos.messagingAccountId}`,
                `meta-phone:${input.ativos.phoneNumberId}`,
            ].sort();
            for (const chave of chavesAtivo) {
                await transaction.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
                    chave,
                ]);
            }

            const atual = await transaction('integracoes_whatsapp')
                .where({
                    organizacao_id: input.escopo.organizacaoId,
                    area_negocio_id: input.escopo.areaNegocioId,
                    provedor: 'META_CLOUD_API',
                })
                .whereNull('deletado_em')
                .forUpdate()
                .first();

            const consultaConflito = transaction('integracoes_whatsapp')
                .select('id', 'organizacao_id')
                .where({ provedor: 'META_CLOUD_API', situacao_autorizacao: 'AUTORIZADO' })
                .whereNull('deletado_em')
                .where((query) =>
                    query
                        .where('phone_number_id', input.ativos.phoneNumberId)
                        .orWhere((conta) =>
                            conta
                                .where('messaging_account_id', input.ativos.messagingAccountId)
                                .whereNot({ organizacao_id: input.escopo.organizacaoId }),
                        ),
                )
                .modify((query) => {
                    if (atual) query.whereNot('id', atual.id);
                });
            const conflito = await consultaConflito.first();
            if (conflito) {
                throw erro(
                    409,
                    conflito.organizacao_id === input.escopo.organizacaoId
                        ? 'NUMERO_META_JA_VINCULADO_NA_ORGANIZACAO'
                        : 'ATIVO_META_VINCULADO_OUTRA_ORGANIZACAO',
                );
            }

            const id = (atual?.id as string | undefined) ?? randomUUID();
            const reautorizacao = atual?.situacao_autorizacao === 'AUTORIZADO';

            const areaNegocioId = input.escopo.areaNegocioId;
            const ref = `db-aesgcm:v1:${id}`;
            const cifra = criarCofreCredenciaisWhatsapp().criptografar(input.credenciais, {
                integracaoId: id,
                organizacaoId: input.escopo.organizacaoId,
                areaNegocioId,
            });
            const situacaoRegistro = input.modo === 'COEXISTENCIA' ? 'NAO_NECESSARIO' : 'PENDENTE';
            const valores = {
                meta_business_id: input.ativos.metaBusinessId,
                whatsapp_account_id: input.ativos.whatsappAccountId,
                messaging_account_id: input.ativos.messagingAccountId,
                whatsapp_business_account_id: input.ativos.messagingAccountId,
                phone_number_id: input.ativos.phoneNumberId,
                numero_exibido: input.ativos.numeroExibido || null,
                nome_negocio: input.ativos.nomeNegocio || null,
                modo_onboarding: input.modo,
                credencial_referencia: ref,
                credenciais_meta_criptografadas: cifra,
                situacao_autorizacao: 'AUTORIZADO',
                situacao_conexao:
                    input.modo === 'COEXISTENCIA' ? 'PENDENTE_WEBHOOK' : 'PENDENTE_REGISTRO',
                situacao_registro: situacaoRegistro,
                situacao_webhook: 'PENDENTE',
                situacao_templates: 'NAO_VALIDADO',
                motivo_indisponibilidade:
                    input.modo === 'COEXISTENCIA'
                        ? 'WEBHOOK_META_PENDENTE'
                        : 'REGISTRO_META_PENDENTE',
                autorizada_em: transaction.fn.now(),
                numero_registrado_em: null,
                webhook_assinado_em: null,
                ativo: false,
                ativada_em: null,
                atualizado_em: transaction.fn.now(),
            };

            if (atual) {
                await transaction('integracoes_whatsapp').where({ id }).update(valores);
            } else {
                await transaction('integracoes_whatsapp').insert({
                    id,
                    organizacao_id: input.escopo.organizacaoId,
                    area_negocio_id: areaNegocioId,
                    provedor: 'META_CLOUD_API',
                    ...valores,
                });
            }
            await transaction('integracoes_whatsapp_onboarding')
                .where({ id: input.escopo.correlacaoId })
                .update({
                    integracao_whatsapp_id: id,
                    modo_onboarding: input.modo,
                    status: 'AUTORIZADO',
                    codigo_erro: null,
                });
            await transaction('registros_auditoria').insert({
                organizacao_id: input.escopo.organizacaoId,
                area_negocio_id: areaNegocioId,
                usuario_id: input.usuarioId,
                acao: reautorizacao
                    ? 'WHATSAPP.EMBEDDED_SIGNUP_REAUTORIZADO'
                    : 'WHATSAPP.EMBEDDED_SIGNUP_AUTORIZADO',
                recurso: 'integracoes_whatsapp',
                recurso_id: id,
                dados_contexto: {
                    modo: input.modo,
                    reautorizacao,
                    waba_id: input.ativos.messagingAccountId,
                    phone_number_id: input.ativos.phoneNumberId,
                    segredo_incluido: true,
                },
                ip: input.auditoria?.ip ?? null,
                user_agent: input.auditoria?.userAgent ?? null,
            });
            return { integracaoId: id, status: 'AUTORIZADO' as const };
        });
    }

    async atualizarProvisionamento(input: {
        escopo: Escopo;
        integracaoId: string;
        situacaoRegistro: string;
        situacaoWebhook: string;
        codigoErro: string | null;
    }) {
        return connection.transaction(async (transaction) => {
            const atual = await transaction('integracoes_whatsapp')
                .select('id', 'modo_onboarding')
                .where({
                    id: input.integracaoId,
                    organizacao_id: input.escopo.organizacaoId,
                    area_negocio_id: input.escopo.areaNegocioId,
                    provedor: 'META_CLOUD_API',
                })
                .whereNull('deletado_em')
                .forUpdate()
                .first();
            if (!atual) throw erro(404, 'INTEGRACAO_WHATSAPP_NAO_ENCONTRADA');
            const registroConcluido = ['REGISTRADO', 'NAO_NECESSARIO'].includes(
                input.situacaoRegistro,
            );
            const webhookConcluido = input.situacaoWebhook === 'ASSINADO';
            const prontoProximoPasso = registroConcluido && webhookConcluido;
            const conexao = prontoProximoPasso
                ? 'PENDENTE_TEMPLATES'
                : registroConcluido
                  ? 'PENDENTE_WEBHOOK'
                  : 'PENDENTE_REGISTRO';
            await transaction('integracoes_whatsapp')
                .where({ id: input.integracaoId })
                .update({
                    situacao_registro: input.situacaoRegistro,
                    situacao_webhook: input.situacaoWebhook,
                    situacao_conexao: conexao,
                    motivo_indisponibilidade: input.codigoErro,
                    ...(input.situacaoRegistro === 'REGISTRADO'
                        ? { numero_registrado_em: transaction.fn.now() }
                        : {}),
                    ...(webhookConcluido ? { webhook_assinado_em: transaction.fn.now() } : {}),
                    ativo: false,
                    atualizado_em: transaction.fn.now(),
                });
            await transaction('integracoes_whatsapp_onboarding')
                .where({
                    id: input.escopo.correlacaoId,
                    organizacao_id: input.escopo.organizacaoId,
                    area_negocio_id: input.escopo.areaNegocioId,
                    integracao_whatsapp_id: input.integracaoId,
                })
                .update({
                    status: prontoProximoPasso ? 'CONCLUIDO' : 'PENDENTE_ACAO',
                    codigo_erro: input.codigoErro,
                    ...(prontoProximoPasso ? { concluido_em: transaction.fn.now() } : {}),
                });
            return { pronto: prontoProximoPasso, situacaoConexao: conexao };
        });
    }

    async marcarFalhaAutorizacao(escopo: Escopo, codigoErro: string) {
        await connection('integracoes_whatsapp_onboarding')
            .where({
                id: escopo.correlacaoId,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
                status: 'PROCESSANDO',
            })
            .update({
                status: 'FALHA',
                codigo_erro: codigoErro,
                concluido_em: connection.fn.now(),
            });
    }

    async obterStatus(escopo: Escopo) {
        const onboarding = await connection('integracoes_whatsapp_onboarding')
            .select(
                'id',
                'status',
                'modo_onboarding',
                'codigo_erro',
                'expira_em',
                'integracao_whatsapp_id',
                'concluido_em',
            )
            .where({
                id: escopo.correlacaoId,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
            })
            .first();
        if (!onboarding) throw erro(404, 'ONBOARDING_NAO_ENCONTRADO');
        const integracao = onboarding.integracao_whatsapp_id
            ? await connection('integracoes_whatsapp')
                  .select(
                      'whatsapp_business_account_id',
                      'messaging_account_id',
                      'whatsapp_account_id',
                      'meta_business_id',
                      'phone_number_id',
                      'numero_exibido',
                      'nome_negocio',
                      'situacao_autorizacao',
                      'situacao_registro',
                      'situacao_webhook',
                      'situacao_templates',
                      'situacao_conexao',
                      'ativo',
                  )
                  .where({
                      id: onboarding.integracao_whatsapp_id,
                      organizacao_id: escopo.organizacaoId,
                      area_negocio_id: escopo.areaNegocioId,
                  })
                  .first()
            : null;
        return {
            correlacaoId: onboarding.id,
            status: onboarding.status,
            modoOnboarding: onboarding.modo_onboarding,
            codigoErro: onboarding.codigo_erro,
            expiraEm: onboarding.expira_em,
            concluidoEm: onboarding.concluido_em,
            integracao: integracao ?? null,
        };
    }

    async obterProvisionamento(escopo: Escopo) {
        const onboarding = await connection('integracoes_whatsapp_onboarding')
            .select('id', 'status', 'integracao_whatsapp_id', 'modo_onboarding')
            .where({
                id: escopo.correlacaoId,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
            })
            .first();
        if (!onboarding) throw erro(404, 'ONBOARDING_NAO_ENCONTRADO');
        if (!['AUTORIZADO', 'PENDENTE_ACAO'].includes(onboarding.status)) {
            return { onboarding, integracao: null, credenciais: null };
        }
        const integracao = await connection('integracoes_whatsapp')
            .select(
                'id',
                'organizacao_id',
                'area_negocio_id',
                'whatsapp_business_account_id',
                'messaging_account_id',
                'whatsapp_account_id',
                'phone_number_id',
                'numero_exibido',
                'nome_negocio',
                'credencial_referencia',
                'situacao_registro',
                'situacao_webhook',
            )
            .where({
                id: onboarding.integracao_whatsapp_id,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
                situacao_autorizacao: 'AUTORIZADO',
            })
            .whereNull('deletado_em')
            .first();
        if (!integracao) throw erro(404, 'INTEGRACAO_WHATSAPP_NAO_ENCONTRADA');
        const configuracao: ConfiguracaoMetaWhatsapp = {
            organizacaoId: integracao.organizacao_id,
            areaNegocioId: integracao.area_negocio_id,
            whatsappBusinessAccountId:
                integracao.messaging_account_id ?? integracao.whatsapp_business_account_id,
            phoneNumberId: integracao.phone_number_id,
            numeroExibido: integracao.numero_exibido,
            nomeNegocio: integracao.nome_negocio,
            credencial: integracao.credencial_referencia
                ? { referencia: integracao.credencial_referencia }
                : null,
        };
        const credenciais = await connection('integracoes_whatsapp')
            .select('credenciais_meta_criptografadas')
            .where({ id: integracao.id, organizacao_id: escopo.organizacaoId })
            .first()
            .then((row) => {
                if (!row?.credenciais_meta_criptografadas) return null;
                return criarCofreCredenciaisWhatsapp().descriptografar(
                    row.credenciais_meta_criptografadas,
                    {
                        integracaoId: integracao.id,
                        organizacaoId: escopo.organizacaoId,
                        areaNegocioId: escopo.areaNegocioId,
                    },
                );
            });
        return { onboarding, integracao, credenciais, configuracao };
    }

    async marcarProvisionamentoErro(escopo: Escopo, codigoErro: string) {
        const onboarding = await connection('integracoes_whatsapp_onboarding')
            .select('integracao_whatsapp_id')
            .where({
                id: escopo.correlacaoId,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
            })
            .first();
        if (!onboarding) throw erro(404, 'ONBOARDING_NAO_ENCONTRADO');
        await connection('integracoes_whatsapp_onboarding')
            .where({
                id: escopo.correlacaoId,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
            })
            .update({ status: 'PENDENTE_ACAO', codigo_erro: codigoErro });
        if (!onboarding?.integracao_whatsapp_id) return;
        await connection('integracoes_whatsapp')
            .where({
                id: onboarding.integracao_whatsapp_id,
                organizacao_id: escopo.organizacaoId,
                area_negocio_id: escopo.areaNegocioId,
            })
            .whereNull('deletado_em')
            .update({ motivo_indisponibilidade: codigoErro, ativo: false });
    }
}

export default new RepositorioOnboardingWhatsapp();
