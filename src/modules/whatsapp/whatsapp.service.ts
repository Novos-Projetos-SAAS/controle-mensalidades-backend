import AppError from '../../shared/errors/AppError.js';
import type {
    EscopoMensalidadeWhatsapp,
    FinanceiroWhatsappProvider,
    SnapshotMensalidadeWhatsapp,
} from './whatsapp.contracts.js';
import { validarConfiguracaoWhatsapp, validarListagemWhatsapp } from './whatsapp.validator.js';
import { PROPOSTAS_TEMPLATES_WHATSAPP } from './whatsapp.templates.js';
import whatsappRepository from './whatsapp.repository.js';
import { agendarLembretesMensalidade } from './whatsapp.scheduler.js';

function erroFinanceiroIndisponivel() {
    return new AppError(
        'A consulta financeira ainda não está integrada; nenhum lembrete foi agendado.',
        503,
        'INTEGRACAO_FINANCEIRA_WHATSAPP_PENDENTE',
    );
}

class WhatsappService {
    async listarConfiguracoes(organizacaoId: string) {
        return whatsappRepository.listarConfiguracoes(organizacaoId);
    }

    async salvarConfiguracao(
        organizacaoId: string,
        usuarioId: string,
        dados: unknown,
        metadados: { ip?: string; userAgent?: string },
    ) {
        const configuracao = validarConfiguracaoWhatsapp(dados);
        return whatsappRepository.salvarConfiguracao(organizacaoId, configuracao, {
            usuarioId,
            ...metadados,
        });
    }

    listarPropostasTemplates() {
        return PROPOSTAS_TEMPLATES_WHATSAPP.map((template) => ({
            chave: template.chave,
            tipo: template.tipo,
            nome: template.nome,
            conteudo: template.conteudo,
            variaveis: template.variaveis,
            idioma: template.idioma,
            situacaoMeta: template.statusMeta,
            aprovadoMeta: false,
            ativo: false,
        }));
    }

    async listarTarefas(organizacaoId: string, areaNegocioId: string, filtros: unknown) {
        return whatsappRepository.listarTarefas(
            organizacaoId,
            areaNegocioId,
            validarListagemWhatsapp(filtros),
        );
    }

    async listarMensagens(organizacaoId: string, areaNegocioId: string, filtros: unknown) {
        return whatsappRepository.listarMensagens(
            organizacaoId,
            areaNegocioId,
            validarListagemWhatsapp(filtros),
        );
    }

    async obterMetricas(organizacaoId: string, areaNegocioId: string) {
        return whatsappRepository.metricas(organizacaoId, areaNegocioId);
    }

    async agendarParaMensalidade(
        escopo: EscopoMensalidadeWhatsapp,
        financeiro?: FinanceiroWhatsappProvider,
        agora?: Date,
    ) {
        if (!financeiro) throw erroFinanceiroIndisponivel();
        const atual = await financeiro.obterMensalidadeAtual(escopo);
        if (!atual) {
            throw new AppError('Mensalidade não encontrada.', 404, 'MENSALIDADE_NAO_ENCONTRADA');
        }
        if (
            atual.mensalidadeId !== escopo.mensalidadeId ||
            atual.organizacaoId !== escopo.organizacaoId ||
            atual.areaNegocioId !== escopo.areaNegocioId
        ) {
            throw new AppError(
                'A mensalidade não pertence ao contexto informado.',
                404,
                'MENSALIDADE_NAO_ENCONTRADA',
            );
        }

        return agendarLembretesMensalidade(this.paraAgendamento(atual), whatsappRepository, agora);
    }

    private paraAgendamento(mensalidade: SnapshotMensalidadeWhatsapp) {
        return {
            mensalidadeId: mensalidade.mensalidadeId,
            organizacaoId: mensalidade.organizacaoId,
            areaNegocioId: mensalidade.areaNegocioId,
            clienteId: mensalidade.clienteId,
            competencia: mensalidade.competencia,
            vencimentoEm: mensalidade.vencimentoEm,
            valorTotal: mensalidade.valorTotal,
            valorPago: mensalidade.valorPago,
            saldoAtual: mensalidade.saldoAtual,
            checkoutUrl: mensalidade.checkoutUrl,
            checkoutValor: mensalidade.checkoutValor,
            situacao: mensalidade.situacao,
            reconciliacaoPendente: mensalidade.reconciliacaoPendente,
        };
    }
}

export default new WhatsappService();
