# Quitação manual e recuperação de pagamentos

O recebimento interno e a confirmação do provedor são registros diferentes. O botão **Registrar recebimento** usa a transação financeira existente, com lock da conta a receber, saldo calculado no backend, histórico e auditoria. A mesma chave idempotente não pode alterar os dados de um recebimento.

Após quitação integral, a mensalidade aparece como paga e o saldo fica zerado. A página privada informa **Mensalidade quitada**, não oferece outro pagamento e não retorna checkout utilizável. O painel remove as ações de gerar, copiar e conferir link. Não é preciso conferir o checkout para concluir o recebimento manual.

A intenção do formulário fica em `sessionStorage`, por usuário, organização, área e mensalidade, antes do envio. Em timeout ou recarga, **Conferir recebimento** consulta o financeiro interno. Se não houver novo recebimento, a recuperação reutiliza a chave e os dados originais. Dados de recuperação inválidos ou indisponibilidade do armazenamento impedem novo envio. Um recebimento parcial novo exige revisão do histórico antes de repetir uma operação incerta.

## Recebimento parcial e links compartilhados

Na baixa parcial, permanece o saldo calculado no backend. Um link cujo valor ultrapassa esse saldo deixa de ser oferecido pela plataforma. Uma intenção de checkout ainda não enviada é encerrada localmente quando o saldo muda. Antes do POST externo, o backend revalida saldo e situação sob lock da conta.

Ocultar o link na plataforma não cancela uma URL que o provedor já recebeu. Não há cancelamento externo automático de checkout nesta mudança. Não se cancela uma assinatura recorrente por quitar uma competência. Se houver débito externo em andamento, consulte a situação da cobrança/recorrência antes de um ajuste financeiro.

## Confirmação externa posterior

O webhook continua sendo autenticado e persistido depois de uma baixa manual. Uma transação externa nova, sem saldo compatível, fica em revisão e não gera outro recebimento. O painel preserva a quitação e apresenta o aviso de recebimento externo a conferir. Na baixa parcial, uma confirmação incompatível mantém a situação **Pagamento em análise**. Não há associação por coincidência de valor/data, estorno automático ou perda do histórico.

## Worker e idempotência

Os eventos ficam em PostgreSQL antes da resposta de sucesso. Entregas repetidas preservam o registro original. Na AbacatePay, reutilizar o ID do evento com conteúdo financeiro diferente resulta em rejeição, sem sobrescrever o primeiro evento. A identidade inclui organização, provedor e ambiente conforme o índice já previsto na migration071.

Claims usam locks e leases. A transação que registra a baixa verifica token, validade do lease, organização e provedor. Um worker substituído não registra pagamentos nem conclui o evento do novo worker. Reexecução após baixa e antes do checkpoint reutiliza a identidade da transação externa. Retentativas transitórias têm espera progressiva e limite; situações não recuperáveis seguem para revisão.

Falha de um provedor não impede a execução do outro no mesmo ciclo. Se um cancelamento de recorrência por data incompatível falhar, a intenção de cancelamento é preservada para recuperação.

## Validação e operação

- Não foi criada, alterada ou aplicada migration nesta mudança.
- Não executar suites que chamem migrations, mesmo com mocks, para validar este ajuste.
- Os testes financeiros exigem banco previamente preparado, exclusivo e com dados fictícios. Nunca usar banco de produção.
- O banco QA legado usado nesta tarefa ainda possui o índice de eventos AbacatePay sem ambiente e não possui `chk_abacatepay_evento_identidade`. A atualização desse schema não foi executada; a unicidade entre ambientes no índice atual da migration071 precisa de validação em ambiente preparado.
- Testes de interface isolados: `npm run test:e2e -- --payments-ui-only`, no frontend. Interceptam APIs e não executam migrations nem pagamentos.
- Homologação externa real, inclusive disponibilidade de Pix Automático, continua sujeita às condições documentadas em [AbacatePay](abacatepay.md) e [InfinitePay](infinitepay.md).

Para conferir na interface: abra uma mensalidade pendente com link, registre recebimento integral, confirme o status pago/saldo zero e reabra os detalhes. Não deve haver ação de pagar ou conferir link. Abra o link privado já compartilhado: deve informar quitação. Para saldo parcial, confira o valor restante e o bloqueio do checkout antigo.

## Arquivos desta alteração

### controle-mensalidades-backend

- `src/modules/financeiro/financeiro.service.ts`
- `src/modules/pagamentos/abacatepay/abacatepay.service.ts`
- `src/modules/pagamentos/abacatepay/cobrancas.ts`
- `src/modules/pagamentos/abacatepay/eventos.ts`
- `src/modules/pagamentos/abacatepay/recorrencias.ts`
- `src/modules/pagamentos/pagamentos.eventos.ts`
- `src/modules/pagamentos/pagamentos.service.ts`
- `src/modules/pagamentos/pagamentos.worker.ts`
- `tests/modules/pagamentos/abacatepay.integration.test.ts`
- `tests/modules/pagamentos/pagamentos.integration.test.ts`
- `docs/integracao/quitacao-e-webhooks.md`
- `src/modules/pagamentos/evento-lease.ts`
- `src/modules/pagamentos/situacao-cobranca.ts`
- `tests/modules/pagamentos/pagamentos.worker.test.ts`
- `tests/modules/pagamentos/situacao-cobranca.test.ts`

### controle-mensalidades-frontend

- `e2e/infinitepay.spec.ts`
- `src/features/finance/finance-api.ts`
- `src/features/finance/finance-page.tsx`
- `src/features/finance/receive-dialog.test.tsx`
- `src/features/finance/receive-dialog.tsx`
- `src/features/payments/charge-panel.tsx`
- `src/features/payments/payment-page.tsx`
- `src/features/payments/payment-utils.ts`
- `src/features/payments/payments-api.ts`
- `src/features/payments/settlement-ui.test.tsx`

## Resultado da validação desta alteração

- Branch nos dois repositórios: `codex/webhooks-manual-settlement`, atualizada com `origin/main`. Os commits da funcionalidade ficam nessa branch para revisão; o merge na `main` cabe ao proprietário. Nenhum deploy foi executado.
- Backend: typecheck de aplicação e testes, ESLint e build aprovados. Dez arquivos de testes executados explicitamente: **125 passaram, nenhum ignorado**. Incluem adaptadores InfinitePay/AbacatePay, dados de checkout, políticas, situação financeira, worker, integrações com PostgreSQL e rotas financeiras/AbacatePay.
- Frontend: typecheck, build e ESLint aprovados. ESLint continua com quatro avisos preexistentes em dois testes clínicos não alterados. **183 testes Vitest passaram em 34 arquivos**, após incorporar a aba de mensalidades dos clientes já presente na `main`.
- Playwright com APIs interceptadas: **6 cenários passaram**, incluindo quitação manual com clique duplo, nenhuma consulta externa obrigatória, saldo zero e página privada sem novo pagamento nas larguras de 1440 e 375 pixels. Inspeção visual do cenário mobile sem overflow.
- Regressores incluem ambas as ordens da corrida manual/webhook, recebimento parcial, chave reutilizada com conteúdo diferente, entrega paralela, transação já aplicada, lease expirado/substituído, retomada depois da baixa, oito tentativas com espera progressiva, indisponibilidade de provedor e cancelamento com timeout.
- Arquivos privados de ambiente e migrations foram preservados. A atualização com `origin/main` incorpora o nome `ENCRYPTION_KEY` sem alterar a chave de criptografia. Arquivos gerados pelo build foram restaurados ao conteúdo anterior.

Não executados: `financeiro.rotina.test.ts` (cria schema e chama `migrate.latest`), `abacatepay.migration.test.ts` (chama migration mesmo com mock), `clinical_history_migration.test.ts` (cria schema e chama migrations) e E2E completo com fixtures de banco. A suite financeira foi executada explicitamente no banco QA previamente existente; não houve `npm test` genérico no backend. Esta validação não homologa APIs externas reais nem comprova o índice com ambiente no schema QA legado.
