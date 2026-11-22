import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import type { ConfiguracaoWhatsappInput, ListagemWhatsappInput } from './whatsapp.validator.js';
import type { ArmazenamentoAgendadorWhatsapp, TarefaLembreteNova } from './whatsapp.scheduler.js';
import type {
    ConfiguracaoPublicaWhatsapp,
    ParametrosTemplateCobranca,
} from './whatsapp.contracts.js';
import type { ConfiguracaoMetaWhatsapp } from './whatsapp.contracts.js';
import type { ResolverCredencialMetaWhatsapp } from './whatsapp.contracts.js';
import type { EventoStatusMeta } from './whatsapp.webhook.js';
import {
    criarCofreCredenciaisWhatsapp,
    type ContextoCofreWhatsapp,
    type CredenciaisAcessoMeta,
} from './whatsapp.credentials.js';

type ExecutorBanco = Knex | Knex.Transaction;

export type TarefaWhatsappReservada = {
    id: string;
    organizacao_id: string;
    area_negocio_id: string;
    cliente_id: string;
    mensalidade_id: string;
    lembrete_tipo: 'D-1' | 'D0' | 'D+3';
    ciclo_financeiro: string;
    lease_token: string;
    tentativas: number;
    max_tentativas: number;
};

export type ContextoProcessamentoWhatsapp = {
    tarefa: TarefaWhatsappReservada;
    cliente: {
        nome: string;
        telefone: string | null;
        ativo: boolean;
        aceite_whatsapp: boolean;
        aceite_whatsapp_em: Date | string | null;
        origem_aceite_whatsapp: string | null;
        opt_out_whatsapp_em: Date | string | null;
        pertencenteArea: boolean;
    };
    configuracao:
        | (ConfiguracaoMetaWhatsapp & {
              id: string;
              situacaoConexao: string;
              situacaoAutorizacao: string;
              situacaoTemplates: string;
              ativo: boolean;
          })
        | null;
    template: {
        nome: string;
        conteudo: string;
        nomeTemplateMeta: string;
        idiomaMeta: string;
        categoriaMeta: string | null;
        esquemaParametros: Array<keyof ParametrosTemplateCobranca> | null;
    } | null;
};

function selecionarConfiguracaoPublica(query: Knex.QueryBuilder) {
    return query.select(
        'id',
        'organizacao_id',
        'area_negocio_id',
        'provedor',
        'whatsapp_business_account_id',
        'phone_number_id',
        'numero_exibido',
        'nome_negocio',
        'situacao_conexao',
        'situacao_autorizacao',
        'situacao_templates',
        'ativo',
        'ativada_em',
        'ultima_validacao_em',
        'motivo_indisponibilidade',
    );
}

class WhatsappRepository implements ArmazenamentoAgendadorWhatsapp, ResolverCredencialMetaWhatsapp {
    async listarConfiguracoes(organizacaoId: string): Promise<ConfiguracaoPublicaWhatsapp[]> {
        return (await selecionarConfiguracaoPublica(connection('integracoes_whatsapp'))
            .where({ organizacao_id: organizacaoId, provedor: 'META_CLOUD_API' })
            .whereNull('deletado_em')
            .orderBy('area_negocio_id', 'asc')) as ConfiguracaoPublicaWhatsapp[];
    }

    async areaAtivaDaOrganizacao(
        organizacaoId: string,
        areaNegocioId: string,
        executor: ExecutorBanco = connection,
    ) {
        return executor('areas_negocio')
            .select('id')
            .where({ id: areaNegocioId, organizacao_id: organizacaoId, ativo: true })
            .whereNull('deletado_em')
            .first();
    }

    async salvarConfiguracao(
        organizacaoId: string,
        configuracao: ConfiguracaoWhatsappInput,
        auditoria: { usuarioId: string; ip?: string; userAgent?: string },
    ): Promise<ConfiguracaoPublicaWhatsapp> {
        return connection.transaction(async (transaction) => {
            const areaId = configuracao.areaNegocioId ?? null;
            if (
                areaId &&
                !(await this.areaAtivaDaOrganizacao(organizacaoId, areaId, transaction))
            ) {
                throw new AppError(
                    'Área de negócio não encontrada.',
                    404,
                    'AREA_NEGOCIO_NAO_ENCONTRADA',
                );
            }

            const chaveBloqueio = `${organizacaoId}:META_CLOUD_API:${areaId ?? 'GLOBAL'}`;
            await transaction.raw('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [
                chaveBloqueio,
            ]);

            const consulta = transaction('integracoes_whatsapp')
                .where({ organizacao_id: organizacaoId, provedor: 'META_CLOUD_API' })
                .whereNull('deletado_em');
            if (areaId) consulta.andWhere('area_negocio_id', areaId);
            else consulta.whereNull('area_negocio_id');
            const atual = await consulta.forUpdate().first();

            const valores = {
                whatsapp_business_account_id: configuracao.whatsappBusinessAccountId,
                phone_number_id: configuracao.phoneNumberId,
                numero_exibido: configuracao.numeroExibido,
                nome_negocio: configuracao.nomeNegocio,
                situacao_conexao: 'PENDENTE_AUTORIZACAO',
                situacao_autorizacao: 'PENDENTE',
                situacao_templates: 'NAO_VALIDADO',
                motivo_indisponibilidade: 'AUTORIZACAO_META_PENDENTE',
                ativo: false,
                ativada_em: null,
                ultima_validacao_em: null,
                atualizado_em: transaction.fn.now(),
            };

            let id: string;
            if (atual) {
                id = atual.id as string;
                await transaction('integracoes_whatsapp').where({ id }).update(valores);
            } else {
                const [inserida] = await transaction('integracoes_whatsapp')
                    .insert({
                        organizacao_id: organizacaoId,
                        area_negocio_id: areaId,
                        provedor: 'META_CLOUD_API',
                        ...valores,
                    })
                    .returning('id');
                id = inserida.id as string;
            }

            const resultado = await selecionarConfiguracaoPublica(
                transaction('integracoes_whatsapp'),
            )
                .where({ id })
                .first();
            await transaction('registros_auditoria').insert({
                organizacao_id: organizacaoId,
                usuario_id: auditoria.usuarioId,
                area_negocio_id: areaId,
                acao: 'WHATSAPP.CONFIGURACAO_ATUALIZADA',
                recurso: 'integracoes_whatsapp',
                recurso_id: id,
                dados_contexto: {
                    provedor: 'META_CLOUD_API',
                    situacao_conexao: 'PENDENTE_AUTORIZACAO',
                    situacao_autorizacao: 'PENDENTE',
                    segredo_incluido: false,
                },
                ip: auditoria.ip ?? null,
                user_agent: auditoria.userAgent ?? null,
            });
            return resultado as ConfiguracaoPublicaWhatsapp;
        });
    }

    async armazenarCredenciaisMeta(
        organizacaoId: string,
        integracaoId: string,
        usuarioId: string,
        credenciais: CredenciaisAcessoMeta,
        cofre = criarCofreCredenciaisWhatsapp(),
        auditoria: { ip?: string; userAgent?: string } = {},
    ): Promise<ConfiguracaoPublicaWhatsapp> {
        return connection.transaction(async (transaction) => {
            const integracao = await transaction('integracoes_whatsapp')
                .select('id', 'organizacao_id', 'area_negocio_id')
                .where({
                    id: integracaoId,
                    organizacao_id: organizacaoId,
                    provedor: 'META_CLOUD_API',
                })
                .whereNull('deletado_em')
                .forUpdate()
                .first();
            if (!integracao) {
                throw new AppError(
                    'Configuração WhatsApp não encontrada.',
                    404,
                    'CONFIGURACAO_WHATSAPP_NAO_ENCONTRADA',
                );
            }

            const contextoCofre: ContextoCofreWhatsapp = {
                integracaoId,
                organizacaoId,
                areaNegocioId: integracao.area_negocio_id,
            };
            const credencialReferencia = `db-aesgcm:v1:${integracaoId}`;
            await transaction('integracoes_whatsapp')
                .where({ id: integracaoId })
                .update({
                    credenciais_meta_criptografadas: cofre.criptografar(credenciais, contextoCofre),
                    credencial_referencia: credencialReferencia,
                    ativo: false,
                    situacao_conexao: 'PENDENTE_AUTORIZACAO',
                    situacao_autorizacao: 'PENDENTE_VALIDACAO',
                    motivo_indisponibilidade: 'VALIDACAO_META_PENDENTE',
                    atualizado_em: transaction.fn.now(),
                });

            await transaction('registros_auditoria').insert({
                organizacao_id: organizacaoId,
                usuario_id: usuarioId,
                area_negocio_id: integracao.area_negocio_id,
                acao: 'WHATSAPP.CREDENCIAL_META_ARMAZENADA',
                recurso: 'integracoes_whatsapp',
                recurso_id: integracaoId,
                dados_contexto: {
                    referencia: credencialReferencia,
                    cifra: 'AES-256-GCM',
                    segredo_incluido: true,
                },
                ip: auditoria.ip ?? null,
                user_agent: auditoria.userAgent ?? null,
            });

            return (await selecionarConfiguracaoPublica(transaction('integracoes_whatsapp'))
                .where({ id: integracaoId })
                .first()) as ConfiguracaoPublicaWhatsapp;
        });
    }

    async obterCredenciaisMeta(
        configuracao: ConfiguracaoMetaWhatsapp,
    ): Promise<CredenciaisAcessoMeta | null> {
        if (!configuracao.credencial?.referencia) return null;
        const consulta = connection('integracoes_whatsapp')
            .select(
                'id',
                'organizacao_id',
                'area_negocio_id',
                'credencial_referencia',
                'credenciais_meta_criptografadas',
            )
            .where({
                id: configuracao.credencial.referencia.replace('db-aesgcm:v1:', ''),
                organizacao_id: configuracao.organizacaoId,
                provedor: 'META_CLOUD_API',
            })
            .whereNull('deletado_em');
        if (configuracao.areaNegocioId) {
            consulta.andWhere('area_negocio_id', configuracao.areaNegocioId);
        } else {
            consulta.whereNull('area_negocio_id');
        }
        const integracao = await consulta.first();
        if (
            !integracao ||
            integracao.credencial_referencia !== configuracao.credencial.referencia ||
            !integracao.credenciais_meta_criptografadas
        ) {
            return null;
        }

        const contextoCofre: ContextoCofreWhatsapp = {
            integracaoId: integracao.id,
            organizacaoId: integracao.organizacao_id,
            areaNegocioId: integracao.area_negocio_id,
        };
        try {
            return criarCofreCredenciaisWhatsapp().descriptografar(
                integracao.credenciais_meta_criptografadas,
                contextoCofre,
            );
        } catch {
            throw new AppError(
                'Credencial WhatsApp indisponível.',
                503,
                'CREDENCIAL_META_INDISPONIVEL',
            );
        }
    }

    async listarTarefas(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: ListagemWhatsappInput,
    ) {
        const query = connection('tarefas_mensagem')
            .select(
                'id',
                'cliente_id',
                'mensalidade_id',
                'tipo',
                'lembrete_tipo',
                'ciclo_financeiro',
                'status',
                'executar_em',
                'tentativas',
                'max_tentativas',
                'ultima_tentativa_em',
                'cancelado_em',
                'motivo_cancelamento',
                'codigo_resultado',
            )
            .where({ organizacao_id: organizacaoId, area_negocio_id: areaNegocioId })
            .whereNotNull('mensalidade_id')
            .whereNull('deletado_em');

        if (filtros.status) query.andWhere('status', filtros.status);
        const [totalRow] = await query.clone().clearSelect().count('* as total');
        const total = Number(totalRow?.total ?? 0);
        const items = await query
            .orderBy('executar_em', 'desc')
            .limit(filtros.pageSize)
            .offset((filtros.page - 1) * filtros.pageSize);
        return {
            items,
            pagination: {
                page: filtros.page,
                pageSize: filtros.pageSize,
                total,
                pages: Math.ceil(total / filtros.pageSize),
            },
        };
    }

    async listarMensagens(
        organizacaoId: string,
        areaNegocioId: string,
        filtros: ListagemWhatsappInput,
    ) {
        const query = connection('mensagens')
            .select(
                'id',
                'tarefa_mensagem_id',
                'cliente_id',
                'mensalidade_id',
                'tipo',
                'status',
                'provedor',
                'categoria_template',
                'modo_processamento',
                'tentativa',
                'identificador_externo',
                'enviado_em',
                'entregue_em',
                'erro_codigo',
                'criado_em',
            )
            .where({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                canal: 'WHATSAPP',
            })
            .whereNull('deletado_em');

        if (filtros.status) query.andWhere('status', filtros.status);
        const [totalRow] = await query.clone().clearSelect().count('* as total');
        const total = Number(totalRow?.total ?? 0);
        const items = await query
            .orderBy('criado_em', 'desc')
            .limit(filtros.pageSize)
            .offset((filtros.page - 1) * filtros.pageSize);
        return {
            items,
            pagination: {
                page: filtros.page,
                pageSize: filtros.pageSize,
                total,
                pages: Math.ceil(total / filtros.pageSize),
            },
        };
    }

    async metricas(organizacaoId: string, areaNegocioId: string) {
        const [tarefas] = await connection('tarefas_mensagem')
            .where({ organizacao_id: organizacaoId, area_negocio_id: areaNegocioId })
            .whereNotNull('mensalidade_id')
            .whereNull('deletado_em')
            .count('* as total');
        const mensagens = await connection('mensagens')
            .select('status', 'categoria_template', 'modo_processamento')
            .count('* as total')
            .where({
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                canal: 'WHATSAPP',
            })
            .whereNull('deletado_em')
            .groupBy('status', 'categoria_template', 'modo_processamento');
        return { tarefas: Number(tarefas?.total ?? 0), mensagens };
    }

    async inserirIgnorandoDuplicadas(tarefas: TarefaLembreteNova[]): Promise<number> {
        if (!tarefas.length) return 0;
        const inseridas = await connection('tarefas_mensagem')
            .insert(tarefas)
            .onConflict()
            .ignore()
            .returning('id');
        return inseridas.length;
    }

    async reservarTarefasProntas(limite: number, agora: Date, leaseMs: number) {
        return connection.transaction(async (transaction) => {
            const candidatas = await transaction('tarefas_mensagem')
                .select(
                    'id',
                    'organizacao_id',
                    'area_negocio_id',
                    'cliente_id',
                    'mensalidade_id',
                    'lembrete_tipo',
                    'ciclo_financeiro',
                    'tentativas',
                    'max_tentativas',
                )
                .whereNotNull('mensalidade_id')
                .whereNotNull('lembrete_tipo')
                .whereNull('deletado_em')
                .where((query) =>
                    query
                        .where((pending) =>
                            pending
                                .where('status', 'PENDENTE')
                                .andWhere('executar_em', '<=', agora),
                        )
                        .orWhere((expired) =>
                            expired
                                .where('status', 'PROCESSANDO')
                                .andWhere('lease_expira_em', '<=', agora),
                        ),
                )
                .orderBy('executar_em', 'asc')
                .forUpdate()
                .skipLocked()
                .limit(limite);

            const reservadas: TarefaWhatsappReservada[] = [];
            for (const candidata of candidatas) {
                const leaseToken = randomUUID();
                const [atualizada] = await transaction('tarefas_mensagem')
                    .where({ id: candidata.id })
                    .update({
                        status: 'PROCESSANDO',
                        lease_token: leaseToken,
                        lease_expira_em: new Date(agora.getTime() + leaseMs),
                        tentativas: Number(candidata.tentativas ?? 0) + 1,
                        ultima_tentativa_em: agora,
                        atualizado_em: transaction.fn.now(),
                    })
                    .returning('*');
                if (atualizada) reservadas.push({ ...atualizada, lease_token: leaseToken });
            }
            return reservadas;
        });
    }

    async obterContextoProcessamento(
        tarefa: TarefaWhatsappReservada,
    ): Promise<ContextoProcessamentoWhatsapp | null> {
        const atual = await connection('tarefas_mensagem')
            .select('*')
            .where({ id: tarefa.id, lease_token: tarefa.lease_token, status: 'PROCESSANDO' })
            .whereNull('deletado_em')
            .first();
        if (!atual) return null;

        const cliente = await connection('clientes')
            .select(
                'id',
                'organizacao_id',
                'nome',
                'telefone',
                'ativo',
                'aceite_whatsapp',
                'aceite_whatsapp_em',
                'origem_aceite_whatsapp',
                'opt_out_whatsapp_em',
            )
            .where({ id: atual.cliente_id, organizacao_id: atual.organizacao_id })
            .whereNull('deletado_em')
            .first();
        if (!cliente) return null;

        const area = await connection('areas_negocio')
            .select('id')
            .where({
                id: atual.area_negocio_id,
                organizacao_id: atual.organizacao_id,
                ativo: true,
            })
            .whereNull('deletado_em')
            .first();
        if (!area) return null;

        const vinculo = await connection('clientes_areas')
            .select('id')
            .where({ cliente_id: cliente.id, area_negocio_id: area.id, ativo: true })
            .whereNull('deletado_em')
            .first();

        const configuracao = await connection('integracoes_whatsapp')
            .select(
                'id',
                'organizacao_id',
                'area_negocio_id',
                'whatsapp_business_account_id',
                'phone_number_id',
                'numero_exibido',
                'nome_negocio',
                'credencial_referencia',
                'situacao_conexao',
                'situacao_autorizacao',
                'situacao_templates',
                'ativo',
            )
            .where({
                organizacao_id: atual.organizacao_id,
                provedor: 'META_CLOUD_API',
                ativo: true,
            })
            .where('situacao_conexao', 'ATIVO')
            .where('situacao_autorizacao', 'AUTORIZADO')
            .where('situacao_templates', 'VALIDADO')
            .whereNull('deletado_em')
            .where((query) =>
                query
                    .whereNull('area_negocio_id')
                    .orWhere('area_negocio_id', atual.area_negocio_id),
            )
            .orderByRaw('CASE WHEN area_negocio_id = ? THEN 0 ELSE 1 END', [atual.area_negocio_id])
            .first();

        const chaveTemplate = this.chaveTemplate(atual.lembrete_tipo);
        const template = await connection('modelos_mensagem')
            .select(
                'nome',
                'conteudo',
                'nome_template_meta',
                'idioma_meta',
                'categoria_meta',
                'esquema_parametros',
            )
            .where({ organizacao_id: atual.organizacao_id, chave: chaveTemplate, ativo: true })
            .where('status_meta', 'APROVADO')
            .whereNotNull('nome_template_meta')
            .whereNull('deletado_em')
            .where((query) =>
                query
                    .whereNull('area_negocio_id')
                    .orWhere('area_negocio_id', atual.area_negocio_id),
            )
            .orderByRaw('CASE WHEN area_negocio_id = ? THEN 0 ELSE 1 END', [atual.area_negocio_id])
            .first();

        return {
            tarefa: tarefa,
            cliente: {
                nome: cliente.nome,
                telefone: cliente.telefone,
                ativo: cliente.ativo,
                aceite_whatsapp: cliente.aceite_whatsapp,
                aceite_whatsapp_em: cliente.aceite_whatsapp_em,
                origem_aceite_whatsapp: cliente.origem_aceite_whatsapp,
                opt_out_whatsapp_em: cliente.opt_out_whatsapp_em,
                pertencenteArea: Boolean(vinculo),
            },
            configuracao: configuracao
                ? {
                      id: configuracao.id,
                      organizacaoId: configuracao.organizacao_id,
                      areaNegocioId: configuracao.area_negocio_id,
                      whatsappBusinessAccountId: configuracao.whatsapp_business_account_id,
                      phoneNumberId: configuracao.phone_number_id,
                      numeroExibido: configuracao.numero_exibido,
                      nomeNegocio: configuracao.nome_negocio,
                      credencial: configuracao.credencial_referencia
                          ? { referencia: configuracao.credencial_referencia }
                          : null,
                      situacaoConexao: configuracao.situacao_conexao,
                      situacaoAutorizacao: configuracao.situacao_autorizacao,
                      situacaoTemplates: configuracao.situacao_templates,
                      ativo: configuracao.ativo,
                  }
                : null,
            template: template
                ? {
                      nome: template.nome,
                      conteudo: template.conteudo,
                      nomeTemplateMeta: template.nome_template_meta,
                      idiomaMeta: template.idioma_meta,
                      categoriaMeta: template.categoria_meta,
                      esquemaParametros: this.esquemaParametrosSeguro(template.esquema_parametros),
                  }
                : null,
        };
    }

    async finalizarTarefaComMensagem(
        tarefa: TarefaWhatsappReservada,
        mensagem: {
            destinatario: string;
            tipo: string;
            status: string;
            identificadorExterno: string | null;
            enviadoEm: Date | null;
            provedor: string;
            nomeTemplateMeta: string;
            categoriaTemplate: string | null;
            modoProcessamento: string;
            erroCodigo?: string;
        },
    ): Promise<boolean> {
        return connection.transaction(async (transaction) => {
            const atualizadas = await transaction('tarefas_mensagem')
                .where({ id: tarefa.id, lease_token: tarefa.lease_token, status: 'PROCESSANDO' })
                .update({
                    status: mensagem.status === 'ENVIADA' ? 'ENVIADA' : mensagem.status,
                    lease_token: null,
                    lease_expira_em: null,
                    ...(mensagem.status === 'RESULTADO_INCERTO'
                        ? { resultado_incerto_em: transaction.fn.now() }
                        : {}),
                    codigo_resultado: mensagem.erroCodigo ?? null,
                    atualizado_em: transaction.fn.now(),
                });
            if (!atualizadas) return false;

            await transaction('mensagens').insert({
                organizacao_id: tarefa.organizacao_id,
                area_negocio_id: tarefa.area_negocio_id,
                tarefa_mensagem_id: tarefa.id,
                mensalidade_id: tarefa.mensalidade_id,
                cliente_id: tarefa.cliente_id,
                canal: 'WHATSAPP',
                destinatario: mensagem.destinatario,
                tipo: mensagem.tipo,
                status: mensagem.status,
                identificador_externo: mensagem.identificadorExterno,
                enviado_em: mensagem.enviadoEm,
                provedor: mensagem.provedor,
                nome_template_meta: mensagem.nomeTemplateMeta,
                categoria_template: mensagem.categoriaTemplate,
                modo_processamento: mensagem.modoProcessamento,
                tentativa: tarefa.tentativas,
                erro_codigo: mensagem.erroCodigo ?? null,
            });
            return true;
        });
    }

    async registrarFalhaTarefa(
        tarefa: TarefaWhatsappReservada,
        status: 'CANCELADA' | 'FALHOU' | 'PENDENTE',
        codigoResultado: string,
        proximaExecucao?: Date,
        tentativa?: {
            destinatario: string;
            modoProcessamento: 'SIMULADO' | 'META';
            provedor: string;
            status: string;
        },
    ) {
        return connection.transaction(async (transaction) => {
            const atualizadas = await transaction('tarefas_mensagem')
                .where({ id: tarefa.id, lease_token: tarefa.lease_token, status: 'PROCESSANDO' })
                .whereNull('deletado_em')
                .update({
                    status,
                    codigo_resultado: codigoResultado,
                    ...(proximaExecucao ? { executar_em: proximaExecucao } : {}),
                    lease_token: null,
                    lease_expira_em: null,
                    atualizado_em: transaction.fn.now(),
                });
            if (!atualizadas || !tentativa) return Boolean(atualizadas);

            await transaction('mensagens').insert({
                organizacao_id: tarefa.organizacao_id,
                area_negocio_id: tarefa.area_negocio_id,
                tarefa_mensagem_id: tarefa.id,
                mensalidade_id: tarefa.mensalidade_id,
                cliente_id: tarefa.cliente_id,
                canal: 'WHATSAPP',
                destinatario: tentativa.destinatario,
                tipo: `WHATSAPP_COBRANCA_${tarefa.lembrete_tipo}`,
                status: tentativa.status,
                provedor: tentativa.provedor,
                modo_processamento: tentativa.modoProcessamento,
                tentativa: tarefa.tentativas,
                erro_codigo: codigoResultado,
            });
            return true;
        });
    }

    async cancelarLembretesMensalidade(
        tarefa: TarefaWhatsappReservada,
        motivo: string,
    ): Promise<number> {
        return connection.transaction(async (transaction) => {
            const canceladas = await transaction('tarefas_mensagem')
                .where({
                    organizacao_id: tarefa.organizacao_id,
                    area_negocio_id: tarefa.area_negocio_id,
                    cliente_id: tarefa.cliente_id,
                    mensalidade_id: tarefa.mensalidade_id,
                })
                .whereIn('status', ['PENDENTE', 'PROCESSANDO'])
                .whereNull('deletado_em')
                .update({
                    status: 'CANCELADA',
                    cancelado_em: transaction.fn.now(),
                    motivo_cancelamento: motivo,
                    codigo_resultado: motivo,
                    lease_token: null,
                    lease_expira_em: null,
                    atualizado_em: transaction.fn.now(),
                })
                .returning('id');
            return canceladas.length;
        });
    }

    async registrarEventoStatusMetaPorNumero(chaveEvento: string, evento: EventoStatusMeta) {
        return connection.transaction(async (transaction) => {
            const organizacoes = await transaction('integracoes_whatsapp')
                .distinct('organizacao_id')
                .where({
                    phone_number_id: evento.phoneNumberId,
                    provedor: 'META_CLOUD_API',
                })
                .andWhere((query) =>
                    query
                        .where('messaging_account_id', evento.messagingAccountId)
                        .orWhere((legado) =>
                            legado
                                .whereNull('messaging_account_id')
                                .andWhere(
                                    'whatsapp_business_account_id',
                                    evento.messagingAccountId,
                                ),
                        ),
                )
                .whereNull('deletado_em')
                .limit(2);
            // Um Phone Number ID só pode mapear para um único escopo; ambiguidades são ignoradas.
            if (organizacoes.length !== 1)
                return { ignorado: true, duplicado: false, aplicado: false };
            const organizacaoId = organizacoes[0]?.organizacao_id;
            if (!organizacaoId) return { ignorado: true, duplicado: false, aplicado: false };

            const consultaMensagem = transaction('mensagens')
                .select(
                    'id',
                    'organizacao_id',
                    'area_negocio_id',
                    'status',
                    'tarefa_mensagem_id',
                    'destinatario',
                )
                .where({
                    organizacao_id: organizacaoId,
                    identificador_externo: evento.identificadorExterno,
                    provedor: 'META_CLOUD_API',
                    canal: 'WHATSAPP',
                })
                .whereNull('deletado_em');
            const mensagem = await consultaMensagem.forUpdate().first();
            if (
                !mensagem ||
                String(mensagem.destinatario).replace(/\D/g, '') !==
                    evento.destinatario.replace(/\D/g, '')
            ) {
                return { ignorado: true, duplicado: false, aplicado: false };
            }
            const remetenteRegistrado = await transaction('integracoes_whatsapp')
                .select('id')
                .where({
                    organizacao_id: organizacaoId,
                    phone_number_id: evento.phoneNumberId,
                    provedor: 'META_CLOUD_API',
                })
                .andWhere((query) =>
                    query
                        .where('messaging_account_id', evento.messagingAccountId)
                        .orWhere((legado) =>
                            legado
                                .whereNull('messaging_account_id')
                                .andWhere(
                                    'whatsapp_business_account_id',
                                    evento.messagingAccountId,
                                ),
                        ),
                )
                .whereNull('deletado_em')
                .where((query) =>
                    query
                        .whereNull('area_negocio_id')
                        .orWhere('area_negocio_id', mensagem.area_negocio_id),
                )
                .first();
            if (!remetenteRegistrado) {
                return { ignorado: true, duplicado: false, aplicado: false };
            }

            const inseridos = await transaction('webhook_eventos_whatsapp')
                .insert({
                    organizacao_id: organizacaoId,
                    area_negocio_id: mensagem.area_negocio_id,
                    chave_evento: chaveEvento,
                    identificador_externo: evento.identificadorExterno,
                    status: evento.status,
                    ocorrido_em: evento.ocorridoEm,
                })
                .onConflict(['organizacao_id', 'chave_evento'])
                .ignore()
                .returning('id');
            if (!inseridos.length) return { duplicado: true, aplicado: false };

            const estadoAtual = String(mensagem.status).toUpperCase();
            if (estadoAtual === 'FALHOU' || estadoAtual === 'LIDA') {
                return { duplicado: false, aplicado: false };
            }
            if (evento.status === 'failed' && estadoAtual === 'ENTREGUE') {
                return { duplicado: false, aplicado: false };
            }

            const statusMensagem = {
                sent: 'ENVIADA',
                delivered: 'ENTREGUE',
                read: 'LIDA',
                failed: 'FALHOU',
            }[evento.status];
            const ordemStatus = { ENVIADA: 1, ENTREGUE: 2, LIDA: 3 } as const;
            if (
                statusMensagem !== 'FALHOU' &&
                (ordemStatus[estadoAtual as keyof typeof ordemStatus] ?? 0) >=
                    ordemStatus[statusMensagem as keyof typeof ordemStatus]
            ) {
                return { duplicado: false, aplicado: false };
            }
            await transaction('mensagens')
                .where({ id: mensagem.id })
                .update({
                    status: statusMensagem,
                    ...(evento.status === 'delivered' || evento.status === 'read'
                        ? { entregue_em: evento.ocorridoEm }
                        : {}),
                    ...(evento.status === 'failed' ? { erro_codigo: 'META_STATUS_FAILED' } : {}),
                });

            if (mensagem.tarefa_mensagem_id && evento.status !== 'sent') {
                const tarefaAtualizavel = transaction('tarefas_mensagem')
                    .where({
                        id: mensagem.tarefa_mensagem_id,
                        organizacao_id: organizacaoId,
                        area_negocio_id: mensagem.area_negocio_id,
                    })
                    .whereNull('deletado_em');
                tarefaAtualizavel.whereIn(
                    'status',
                    evento.status === 'failed'
                        ? ['ENVIADA', 'RESULTADO_INCERTO']
                        : ['ENVIADA', 'ENTREGUE', 'RESULTADO_INCERTO'],
                );
                await tarefaAtualizavel.update({
                    status: evento.status === 'failed' ? 'FALHOU' : 'ENTREGUE',
                    ...(evento.status === 'failed'
                        ? { codigo_resultado: 'META_STATUS_FAILED' }
                        : {}),
                    atualizado_em: transaction.fn.now(),
                });
            }
            return { duplicado: false, aplicado: true };
        });
    }

    private chaveTemplate(lembreteTipo: string): string {
        if (lembreteTipo === 'D-1') return 'cobranca_vespera';
        if (lembreteTipo === 'D0') return 'cobranca_vencimento';
        return 'cobranca_atraso_3d';
    }

    private esquemaParametrosSeguro(
        valor: unknown,
    ): Array<keyof ParametrosTemplateCobranca> | null {
        const permitidos: Array<keyof ParametrosTemplateCobranca> = [
            'cliente',
            'empresa',
            'competencia',
            'valor',
            'saldo',
            'vencimento',
            'link_pagamento',
        ];
        if (!Array.isArray(valor) || valor.length === 0) return null;
        if (
            !valor.every((item): item is keyof ParametrosTemplateCobranca =>
                permitidos.includes(item),
            )
        ) {
            return null;
        }
        return valor;
    }
}

export default new WhatsappRepository();
