import { randomUUID } from 'node:crypto';

import type { Knex } from 'knex';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

import financeiroRepository from './financeiro.repository.js';
import {
    converterValorCentavos,
    formatarCentavos,
    type CriarAssinaturaInput,
    type CriarPlanoInput,
    type GerarMensalidadeInput,
    type ListarAssinaturasInput,
    type ListarMensalidadesInput,
    type PeriodoResumoInput,
    type ReceberMensalidadeInput,
} from './financeiro.validator.js';

type ContextoFinanceiro = {
    organizacaoId: string;
    areaNegocioId: string;
    usuarioId: string;
    requestId?: string;
    ip?: string;
    userAgent?: string;
};

type PagamentoPublico = {
    id: string;
    conta_receber_id: string;
    valor: string;
    forma_pagamento: string;
    origem: string;
    pago_em: Date | string;
    criado_em: Date | string;
};

function falha(statusCode: number, codigo: string, mensagem: string): AppError {
    return new AppError(mensagem, statusCode, codigo);
}

function dataIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function dataVencimento(competencia: string, dia: number): string {
    const ano = Number(competencia.slice(0, 4));
    const mes = Number(competencia.slice(5, 7));
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const vencimento = new Date(Date.UTC(ano, mes - 1, Math.min(dia, ultimoDia)));
    return vencimento.toISOString().slice(0, 10);
}

function dataSeguinte(data: string): string {
    const seguinte = new Date(`${data}T00:00:00.000Z`);
    seguinte.setUTCDate(seguinte.getUTCDate() + 1);
    return seguinte.toISOString().slice(0, 10);
}

async function registrarAuditoria(
    transaction: Knex.Transaction,
    contexto: ContextoFinanceiro,
    acao: string,
    recurso: string,
    recursoId: string,
    dados: Record<string, unknown>,
) {
    await transaction('registros_auditoria').insert({
        organizacao_id: contexto.organizacaoId,
        area_negocio_id: contexto.areaNegocioId,
        usuario_id: contexto.usuarioId,
        acao,
        recurso,
        recurso_id: recursoId,
        dados_contexto: {
            ...dados,
            ...(contexto.requestId ? { requestId: contexto.requestId } : {}),
        },
        ip: contexto.ip ?? null,
        user_agent: contexto.userAgent ?? null,
    });
}

function pagamentoPublico(row: Record<string, unknown>): PagamentoPublico {
    return {
        id: String(row.id),
        conta_receber_id: String(row.conta_receber_id),
        valor: String(row.valor),
        forma_pagamento: String(row.forma_pagamento),
        origem: String(row.origem),
        pago_em: row.pago_em as Date | string,
        criado_em: row.criado_em as Date | string,
    };
}

function mesmoConteudoIdempotente(
    row: Record<string, unknown>,
    contaReceberId: string,
    dados: ReceberMensalidadeInput,
) {
    return (
        String(row.conta_receber_id) === contaReceberId &&
        converterValorCentavos(String(row.valor)) === converterValorCentavos(dados.valor) &&
        String(row.forma_pagamento) === dados.forma_pagamento &&
        new Date(row.pago_em as Date | string).getTime() === Date.parse(dados.pago_em)
    );
}

class FinanceiroService {
    listarPlanos(contexto: ContextoFinanceiro) {
        return financeiroRepository.listarPlanos(contexto.organizacaoId, contexto.areaNegocioId);
    }

    async buscarPlano(contexto: ContextoFinanceiro, planoId: string) {
        const plano = await financeiroRepository.buscarPlano(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            planoId,
        );
        if (!plano) throw falha(404, 'PLANO_NAO_ENCONTRADO', 'Plano não encontrado nesta área.');
        return plano;
    }

    async criarPlano(contexto: ContextoFinanceiro, dados: CriarPlanoInput) {
        const valorCentavos = converterValorCentavos(dados.valor_base);
        if (valorCentavos <= 0n) {
            throw falha(
                400,
                'VALOR_PLANO_INVALIDO',
                'O plano mensal deve possuir valor maior que zero.',
            );
        }

        return connection.transaction(async (transaction) => {
            const [plano] = await transaction('planos_comerciais')
                .insert({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    nome: dados.nome,
                    descricao: dados.descricao ?? null,
                    valor_base: formatarCentavos(valorCentavos),
                    periodicidade: 'MENSAL',
                    ativo: true,
                })
                .returning([
                    'id',
                    'nome',
                    'descricao',
                    'valor_base',
                    'periodicidade',
                    'area_negocio_id',
                    'ativo',
                ]);

            await registrarAuditoria(
                transaction,
                contexto,
                'FINANCEIRO.PLANO_CRIADO',
                'PLANO',
                plano.id,
                {
                    periodicidade: plano.periodicidade,
                    valor_base: String(plano.valor_base),
                },
            );

            return plano;
        });
    }

    listarAssinaturas(contexto: ContextoFinanceiro, filtros: ListarAssinaturasInput) {
        return financeiroRepository.listarAssinaturas(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            filtros,
        );
    }

    async buscarAssinatura(contexto: ContextoFinanceiro, assinaturaId: string) {
        const assinatura = await financeiroRepository.buscarAssinatura(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            assinaturaId,
        );
        if (!assinatura) {
            throw falha(404, 'ASSINATURA_NAO_ENCONTRADA', 'Assinatura não encontrada nesta área.');
        }
        return assinatura;
    }

    async criarAssinatura(contexto: ContextoFinanceiro, dados: CriarAssinaturaInput) {
        const assinaturaId = await connection.transaction(async (transaction) => {
            const cliente = await transaction('clientes as c')
                .innerJoin('clientes_areas as ca', 'ca.cliente_id', 'c.id')
                .select('c.id')
                .where('c.id', dados.cliente_id)
                .andWhere('c.organizacao_id', contexto.organizacaoId)
                .andWhere('ca.area_negocio_id', contexto.areaNegocioId)
                .andWhere('c.ativo', true)
                .andWhere('ca.ativo', true)
                .whereNull('c.deletado_em')
                .whereNull('ca.deletado_em')
                .forUpdate('c')
                .first();

            if (!cliente) {
                throw falha(
                    404,
                    'CLIENTE_FINANCEIRO_NAO_ENCONTRADO',
                    'Cliente não encontrado nesta área.',
                );
            }

            const plano = await transaction('planos_comerciais as p')
                .select('p.id', 'p.valor_base', 'p.periodicidade')
                .where('p.id', dados.plano_comercial_id)
                .andWhere('p.organizacao_id', contexto.organizacaoId)
                .andWhere('p.ativo', true)
                .whereNull('p.deletado_em')
                .andWhere((builder) =>
                    builder
                        .where('p.area_negocio_id', contexto.areaNegocioId)
                        .orWhereNull('p.area_negocio_id'),
                )
                .forUpdate('p')
                .first();

            if (!plano) {
                throw falha(404, 'PLANO_NAO_ENCONTRADO', 'Plano ativo não encontrado nesta área.');
            }

            if (plano.periodicidade !== 'MENSAL') {
                throw falha(
                    409,
                    'PERIODICIDADE_NAO_SUPORTADA',
                    'Este fluxo inicial aceita somente planos mensais.',
                );
            }

            const valorContratado = converterValorCentavos(String(plano.valor_base));
            if (valorContratado <= 0n) {
                throw falha(
                    409,
                    'PLANO_SEM_COBRANCA',
                    'Planos gratuitos ainda não podem gerar mensalidades.',
                );
            }

            const [assinatura] = await transaction('assinaturas')
                .insert({
                    organizacao_id: contexto.organizacaoId,
                    area_negocio_id: contexto.areaNegocioId,
                    cliente_id: dados.cliente_id,
                    plano_comercial_id: dados.plano_comercial_id,
                    valor_contratado: formatarCentavos(valorContratado),
                    desconto_recorrente: '0.00',
                    dia_vencimento: dados.dia_vencimento,
                    inicio_em: dados.inicio_em,
                    status: 'ATIVA',
                })
                .returning([
                    'id',
                    'cliente_id',
                    'plano_comercial_id',
                    'valor_contratado',
                    'desconto_recorrente',
                    'dia_vencimento',
                    'inicio_em',
                    'status',
                ]);

            await registrarAuditoria(
                transaction,
                contexto,
                'FINANCEIRO.ASSINATURA_CRIADA',
                'ASSINATURA',
                assinatura.id,
                {
                    clienteId: dados.cliente_id,
                    planoId: dados.plano_comercial_id,
                    valorContratado: String(assinatura.valor_contratado),
                },
            );

            return assinatura.id as string;
        });

        const assinatura = await financeiroRepository.buscarAssinatura(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            assinaturaId,
        );
        if (!assinatura) throw new Error('Assinatura criada não foi encontrada.');
        return assinatura;
    }

    async gerarMensalidade(
        contexto: ContextoFinanceiro,
        assinaturaId: string,
        dados: GerarMensalidadeInput,
    ) {
        const resultado = await connection.transaction(async (transaction) => {
            const assinatura = await transaction('assinaturas')
                .select(
                    'id',
                    'cliente_id',
                    'valor_contratado',
                    'desconto_recorrente',
                    'dia_vencimento',
                    'inicio_em',
                    'fim_em',
                    'status',
                )
                .where('id', assinaturaId)
                .andWhere('organizacao_id', contexto.organizacaoId)
                .andWhere('area_negocio_id', contexto.areaNegocioId)
                .forUpdate()
                .first();

            if (!assinatura) {
                throw falha(
                    404,
                    'ASSINATURA_NAO_ENCONTRADA',
                    'Assinatura não encontrada nesta área.',
                );
            }

            if (assinatura.status !== 'ATIVA') {
                throw falha(
                    409,
                    'ASSINATURA_INATIVA',
                    'Somente assinaturas ativas geram mensalidades.',
                );
            }

            const competenciaMes = dados.competencia.slice(0, 7);
            const inicioMes = dataIso(assinatura.inicio_em as Date | string).slice(0, 7);
            const fimMes = assinatura.fim_em
                ? dataIso(assinatura.fim_em as Date | string).slice(0, 7)
                : null;
            if (competenciaMes < inicioMes || (fimMes && competenciaMes > fimMes)) {
                throw falha(
                    409,
                    'COMPETENCIA_FORA_DA_ASSINATURA',
                    'A competência está fora do período da assinatura.',
                );
            }

            const existente = await transaction('mensalidades')
                .select('id')
                .where('assinatura_id', assinaturaId)
                .andWhere('competencia', dados.competencia)
                .first();

            if (existente) return { mensalidadeId: existente.id, criada: false };

            const valorBase = converterValorCentavos(String(assinatura.valor_contratado));
            const desconto = converterValorCentavos(String(assinatura.desconto_recorrente));
            const valorFinal = valorBase - desconto;
            if (valorFinal <= 0n) {
                throw falha(
                    409,
                    'VALOR_MENSALIDADE_INVALIDO',
                    'O valor final da mensalidade deve ser maior que zero.',
                );
            }

            const mensalidadeId = randomUUID();
            const contaReceberId = randomUUID();
            const vencimento = dataVencimento(dados.competencia, Number(assinatura.dia_vencimento));

            await transaction('contas_receber').insert({
                id: contaReceberId,
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                cliente_id: assinatura.cliente_id,
                origem_tipo: 'MENSALIDADE',
                origem_id: mensalidadeId,
                descricao: `Mensalidade ${competenciaMes}`,
                valor_original: formatarCentavos(valorBase),
                desconto: formatarCentavos(desconto),
                acrescimo: '0.00',
                valor_final: formatarCentavos(valorFinal),
                vencimento_em: vencimento,
                status: 'PENDENTE',
            });

            await transaction('mensalidades').insert({
                id: mensalidadeId,
                organizacao_id: contexto.organizacaoId,
                area_negocio_id: contexto.areaNegocioId,
                assinatura_id: assinaturaId,
                conta_receber_id: contaReceberId,
                competencia: dados.competencia,
                valor_base: formatarCentavos(valorBase),
                desconto_recorrente: formatarCentavos(desconto),
                ajuste_competencia: '0.00',
                valor_final: formatarCentavos(valorFinal),
                vencimento_em: vencimento,
            });

            await transaction('historico_mensalidades').insert({
                mensalidade_id: mensalidadeId,
                usuario_id: contexto.usuarioId,
                tipo_evento: 'MENSALIDADE_GERADA',
                dados_novos: {
                    competencia: competenciaMes,
                    valor_base: formatarCentavos(valorBase),
                    desconto: formatarCentavos(desconto),
                    valor_final: formatarCentavos(valorFinal),
                    vencimento_em: vencimento,
                },
            });

            await registrarAuditoria(
                transaction,
                contexto,
                'FINANCEIRO.MENSALIDADE_GERADA',
                'MENSALIDADE',
                mensalidadeId,
                {
                    competencia: competenciaMes,
                    valor_final: formatarCentavos(valorFinal),
                    vencimento_em: vencimento,
                },
            );

            return { mensalidadeId, criada: true };
        });

        const mensalidade = await financeiroRepository.buscarMensalidade(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            resultado.mensalidadeId,
        );

        if (!mensalidade) {
            throw new Error('Mensalidade criada não foi encontrada.');
        }

        return { mensalidade, criada: resultado.criada };
    }

    listarMensalidades(contexto: ContextoFinanceiro, filtros: ListarMensalidadesInput) {
        return financeiroRepository.listarMensalidades(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            filtros,
        );
    }

    async buscarMensalidade(contexto: ContextoFinanceiro, mensalidadeId: string) {
        const mensalidade = await financeiroRepository.buscarMensalidade(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            mensalidadeId,
        );

        if (!mensalidade) {
            throw falha(
                404,
                'MENSALIDADE_NAO_ENCONTRADA',
                'Mensalidade não encontrada nesta área.',
            );
        }

        return mensalidade;
    }

    async registrarRecebimento(
        contexto: ContextoFinanceiro,
        mensalidadeId: string,
        chaveIdempotencia: string,
        dados: ReceberMensalidadeInput,
    ) {
        const valorPagamento = converterValorCentavos(dados.valor);
        if (valorPagamento <= 0n) {
            throw falha(
                400,
                'VALOR_RECEBIMENTO_INVALIDO',
                'O valor recebido deve ser maior que zero.',
            );
        }

        const resultado = await connection.transaction(async (transaction) => {
            const mensalidade = await transaction('mensalidades as m')
                .innerJoin('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
                .select(
                    'm.id',
                    'm.conta_receber_id',
                    'm.valor_final',
                    'cr.status as status_conta',
                    'cr.cancelado_em',
                )
                .where('m.id', mensalidadeId)
                .andWhere('m.organizacao_id', contexto.organizacaoId)
                .andWhere('m.area_negocio_id', contexto.areaNegocioId)
                .forUpdate('cr')
                .first();

            if (!mensalidade) {
                throw falha(
                    404,
                    'MENSALIDADE_NAO_ENCONTRADA',
                    'Mensalidade não encontrada nesta área.',
                );
            }

            const existente = await transaction('pagamentos')
                .select(
                    'id',
                    'conta_receber_id',
                    'valor',
                    'forma_pagamento',
                    'origem',
                    'pago_em',
                    'criado_em',
                )
                .where('organizacao_id', contexto.organizacaoId)
                .andWhere('chave_idempotencia', chaveIdempotencia)
                .first();

            if (existente) {
                if (!mesmoConteudoIdempotente(existente, mensalidade.conta_receber_id, dados)) {
                    throw falha(
                        409,
                        'CHAVE_IDEMPOTENCIA_REUTILIZADA',
                        'A chave de idempotência já foi usada em outro recebimento ou com dados diferentes.',
                    );
                }

                return { pagamento: pagamentoPublico(existente), repetido: true };
            }

            if (mensalidade.cancelado_em || mensalidade.status_conta === 'CANCELADO') {
                throw falha(
                    409,
                    'MENSALIDADE_CANCELADA',
                    'Não é possível receber uma mensalidade cancelada.',
                );
            }

            if (mensalidade.status_conta === 'PAGO') {
                throw falha(409, 'MENSALIDADE_JA_PAGA', 'A mensalidade já está paga.');
            }

            if (mensalidade.status_conta !== 'PENDENTE') {
                throw falha(
                    409,
                    'STATUS_MENSALIDADE_NAO_SUPORTADO',
                    'A situação atual da mensalidade não permite recebimentos manuais.',
                );
            }

            const totalPagoResult = await transaction('pagamentos')
                .where('organizacao_id', contexto.organizacaoId)
                .andWhere('conta_receber_id', mensalidade.conta_receber_id)
                .sum({ total: 'valor' })
                .first();
            const totalPago = converterValorCentavos(String(totalPagoResult?.total ?? '0'));
            const saldo = converterValorCentavos(String(mensalidade.valor_final)) - totalPago;

            if (valorPagamento > saldo) {
                throw falha(
                    409,
                    'VALOR_ACIMA_DO_SALDO',
                    'O recebimento excede o saldo da mensalidade.',
                );
            }

            const [inserido] = await transaction('pagamentos')
                .insert({
                    organizacao_id: contexto.organizacaoId,
                    conta_receber_id: mensalidade.conta_receber_id,
                    cobranca_pagamento_id: null,
                    valor: formatarCentavos(valorPagamento),
                    forma_pagamento: dados.forma_pagamento,
                    origem: 'MANUAL',
                    identificador_externo: null,
                    chave_idempotencia: chaveIdempotencia,
                    pago_em: dados.pago_em,
                    registrado_por_usuario_id: contexto.usuarioId,
                    observacao: null,
                })
                .onConflict(['organizacao_id', 'chave_idempotencia'])
                .ignore()
                .returning([
                    'id',
                    'conta_receber_id',
                    'valor',
                    'forma_pagamento',
                    'origem',
                    'pago_em',
                    'criado_em',
                ]);

            if (!inserido) {
                const concorrente = await transaction('pagamentos')
                    .select(
                        'id',
                        'conta_receber_id',
                        'valor',
                        'forma_pagamento',
                        'origem',
                        'pago_em',
                        'criado_em',
                    )
                    .where('organizacao_id', contexto.organizacaoId)
                    .andWhere('chave_idempotencia', chaveIdempotencia)
                    .first();

                if (
                    !concorrente ||
                    !mesmoConteudoIdempotente(concorrente, mensalidade.conta_receber_id, dados)
                ) {
                    throw falha(
                        409,
                        'CHAVE_IDEMPOTENCIA_REUTILIZADA',
                        'A chave de idempotência já foi usada em outro recebimento ou com dados diferentes.',
                    );
                }

                return { pagamento: pagamentoPublico(concorrente), repetido: true };
            }

            const novoTotalPago = totalPago + valorPagamento;
            const valorFinal = converterValorCentavos(String(mensalidade.valor_final));
            const quitada = novoTotalPago >= valorFinal;

            await transaction('contas_receber')
                .where('id', mensalidade.conta_receber_id)
                .andWhere('organizacao_id', contexto.organizacaoId)
                .andWhere('area_negocio_id', contexto.areaNegocioId)
                .update({
                    status: quitada ? 'PAGO' : 'PENDENTE',
                    recebido_em: quitada ? dados.pago_em : null,
                });

            await transaction('historico_mensalidades').insert({
                mensalidade_id: mensalidade.id,
                usuario_id: contexto.usuarioId,
                tipo_evento: 'RECEBIMENTO_REGISTRADO',
                dados_anteriores: {
                    valor_pago: formatarCentavos(totalPago),
                    saldo: formatarCentavos(saldo),
                },
                dados_novos: {
                    pagamento_id: inserido.id,
                    valor_recebido: formatarCentavos(valorPagamento),
                    forma_pagamento: dados.forma_pagamento,
                    valor_pago: formatarCentavos(novoTotalPago),
                    saldo: formatarCentavos(valorFinal - novoTotalPago),
                    status: quitada ? 'PAGA' : 'PARCIAL',
                },
            });

            await registrarAuditoria(
                transaction,
                contexto,
                'FINANCEIRO.RECEBIMENTO_REGISTRADO',
                'MENSALIDADE',
                mensalidade.id,
                {
                    pagamentoId: inserido.id,
                    valor: formatarCentavos(valorPagamento),
                    formaPagamento: dados.forma_pagamento,
                    saldo: formatarCentavos(valorFinal - novoTotalPago),
                    status: quitada ? 'PAGA' : 'PARCIAL',
                },
            );

            return { pagamento: pagamentoPublico(inserido), repetido: false };
        });

        const mensalidadeAtualizada = await financeiroRepository.buscarMensalidade(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            mensalidadeId,
        );

        return {
            pagamento: resultado.pagamento,
            mensalidade: mensalidadeAtualizada,
            repetido: resultado.repetido,
        };
    }

    async obterResumo(contexto: ContextoFinanceiro, periodo: PeriodoResumoInput) {
        const fimExclusivo = dataSeguinte(periodo.fim);
        const resumo = await financeiroRepository.obterResumo(
            contexto.organizacaoId,
            contexto.areaNegocioId,
            periodo.inicio,
            fimExclusivo,
        );

        return { ...resumo, periodo: { inicio: periodo.inicio, fim: periodo.fim } };
    }
}

export default new FinanceiroService();
