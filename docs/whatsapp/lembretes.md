# Lembretes de cobrança

## Calendário

O agendador cria lembretes D-1, D0 e D+3 às 09:00 em `America/Sao_Paulo`. A data do lembrete deriva do vencimento. Horários já passados são ignorados. O ciclo é `YYYY-MM` e a restrição única por organização, área, cliente, mensalidade, tipo e ciclo impede duplicidade concorrente.

O agendamento depende de um `FinanceiroWhatsappProvider`. Sem esse contrato, o serviço responde `503 INTEGRACAO_FINANCEIRA_WHATSAPP_PENDENTE`; nenhum valor, status ou link é inferido localmente.

## Bloqueios antes de processar

- Cliente ativo, consentimento explícito atual com origem/data, sem opt-out posterior, vínculo ativo na área e telefone E.164.
- Remetente e autorização Meta ativos, credencial referenciada e template Meta aprovado.
- Consulta atual da mensalidade, escopo idêntico, não quitada/cancelada e sem reconciliação pendente.
- Valores total, pago e saldo consistentes; URL HTTPS de checkout presente e valor do checkout igual ao saldo restante.
- Tarefa adquirida com lease; tarefas antigas sem mensalidade ficam fora da fila nova.

Pagamento parcial só é elegível se o provedor financeiro fornecer saldo restante e checkout atualizado exatamente desse valor. Ao detectar mensalidade quitada, saldo zero ou cancelada, o worker cancela em transação os demais lembretes pendentes/em processamento daquele vínculo. A etapa 01 não cria nem modifica cobranças.

## Estados e tentativas

Estados usados: `PENDENTE`, `PROCESSANDO`, `ENVIADA`, `ENTREGUE`, `FALHOU`, `CANCELADA`, `RESULTADO_INCERTO`. `ENVIADA` representa aceite do adapter, não entrega. O lease recupera reservas expiradas; falhas explicitamente temporárias usam backoff limitado. Resultado desconhecido não é repetido automaticamente. Webhook Meta pode atualizar estados em ordem monotônica e eventos repetidos são idempotentes.

## Execução

Não há cron nem comando operacional habilitado porque o adaptador financeiro ainda não existe. Para executar o worker em modo simulado com fixtures isoladas, use `npm run test:whatsapp`; o teste injeta `SimulatedWhatsAppProvider` e um provedor financeiro fictício pelo `.env.test`. O adapter simulado não abre conexões de rede. Uma futura CLI/worker deve verificar `NODE_ENV`, ambiente de banco, limite operacional e modo simulado antes de processar.
