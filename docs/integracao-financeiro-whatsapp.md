# Contrato de integração financeiro → WhatsApp

## Estado atual

O contrato tipado `FinanceiroWhatsappProvider` existe em `src/modules/whatsapp/whatsapp.contracts.ts`, mas ainda não há adaptador para o módulo financeiro nem eventos financeiros publicados. O agendamento retorna indisponibilidade até receber esse provider; nenhum evento futuro é tratado como se já existisse.

## Consulta atual obrigatória

O método `obterMensalidadeAtual({ mensalidadeId, organizacaoId, areaNegocioId })` deve consultar a fonte autoritativa e retornar `SnapshotMensalidadeWhatsapp` ou `null`:

| Campo | Significado |
| --- | --- |
| `mensalidadeId`, `organizacaoId`, `areaNegocioId`, `clienteId` | Escopo tenant/área/cliente imutável para validar tarefa. |
| `competencia` | `YYYY-MM` ou data ISO. |
| `valorTotal`, `valorPago`, `saldoAtual` | Valores decimais com até duas casas; deve valer `saldoAtual = valorTotal - valorPago`. |
| `vencimentoEm` | Data ISO `YYYY-MM-DD`. |
| `situacao` | `ABERTO`, `PARCIAL`, `QUITADO`, `CANCELADO` ou `RECONCILIACAO_PENDENTE`. |
| `checkoutUrl`, `checkoutValor` | Link HTTPS e valor cobrado; o valor deve corresponder ao saldo atual. |
| `reconciliacaoPendente` | Bloqueia o envio quando verdadeiro. |
| `versao` | Versão/data da leitura para rastreabilidade e futuras condições de concorrência. |

O WhatsApp não calcula pagamentos, não confirma a liquidação e não cria URL. Deve consultar o snapshot novamente imediatamente antes do processamento. Estado incerto, cancelamento, quitação, escopo divergente ou saldo/link incompatível bloqueiam o lembrete.

## Eventos esperados, ainda não conectados

O tipo `EventoFinanceiroWhatsapp` nomeia os eventos futuros: `mensalidade.criada`, `cobranca.criada`, `mensalidade.quitada`, `mensalidade.cancelada`, `pagamento.confirmado`, `pagamento.estornado` e `cobranca.reconciliacao_pendente`. Eles devem carregar o escopo e versão do agregado. Eventos são gatilhos para recalcular agendamentos; a leitura autoritativa continua obrigatória para evitar depender de eventos atrasados/repetidos.

Quando um evento de quitação/cancelamento for integrado, o financeiro deve expor operação transacional/idempotente para cancelar tarefas pendentes do escopo, ou um consumidor WhatsApp com política de retry. Até lá, o worker bloqueia cada tarefa pela consulta atual quando ela vence.

## Dono da integração

O módulo financeiro deve implementar o provider/adaptador e fornecer checkout de saldo após pagamento parcial, estado de reconciliação e versão. O WhatsApp mantém o scheduler, template, consentimento, fila e histórico. Nenhum endpoint ou evento InfinitePay/Mercado Pago foi alterado nesta etapa.
