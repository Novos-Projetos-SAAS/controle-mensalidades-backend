# AbacatePay MVP — API v2

Integração local em `codex/abacatepay-mvp`, sobre a implementação InfinitePay. A fonte financeira continua sendo assinatura comercial → mensalidade → conta a receber → cobrança → pagamento. Não há módulo financeiro paralelo.

## Estado da entrega

Implementados configuração por organização, checkout hospedado avulso, adesão recorrente individual por cartão, processamento seguro de eventos, baixa transacional, consulta, cancelamento externo, geração automática de competências e interface integrada. Pix Automático tem contrato HTTP e processamento compartilhado, mas permanece indisponível até liberação da conta e homologação real. Produção permanece bloqueada: testes com mocks não comprovam liberação nem homologação.

## Configuração local

1. Aplique migrations **068** e **069**, após as migrations existentes. Não altere nem renomeie a 067.
2. Configure no backend a chave de criptografia já utilizada pela InfinitePay: `ENCRYPTION_KEY`. Não substitua uma chave existente: isso tornaria as credenciais antigas ilegíveis. A AbacatePay usa escopos separados por organização/provedor/ambiente.
3. No Financeiro, abra **Integrações de pagamento**. Configure uma chave `abc_dev_...` e um segredo de webhook com pelo menos 32 caracteres. Os campos ficam vazios após salvar; somente indicadores de configuração são retornados.
4. Ative a conta no ambiente Teste. Selecione o provedor padrão. Isso afeta somente novas cobranças; cobranças existentes preservam o provedor e a credencial de origem.
5. Para recorrência, habilite **Oferecer pagamento automático** e cartão. Cada contrato precisa de adesão individual.

Gere uma chave apenas se ainda não existir:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Backend:

```powershell
cd D:\Downloads\GitHub\controle-mensalidades-backend
npm run migrate:status
npm run migrate:latest
npm run dev
```

Esses comandos usam o ambiente local configurado pelo projeto. Confira o banco de destino antes da migração. A execução automatizada desta entrega usou banco exclusivo de QA, sem alterar `.env`, `.env.test`, desenvolvimento ou produção.

Frontend:

```powershell
cd D:\Downloads\GitHub\controle-mensalidades-frontend
npm run dev
```

## Checkout e dados do cliente

Nos detalhes de uma mensalidade, selecione AbacatePay e **Gerar cobrança**. Copie o link privado da plataforma. O valor é calculado pelo backend a partir do saldo real. Cliques repetidos e requisições concorrentes reutilizam a intenção já persistida.

Nome, email e telefone vêm do cliente vinculado à conta e à organização. Somente contatos normalizados são enviados. A API de clientes v2 exige email; sem email válido, o backend omite `customerId` e o checkout hospedado coleta o cadastro. Não são enviados CPF, prontuário, descrições clínicas nem dados de cartão. Campos adicionais exigidos pelo meio são coletados diretamente pelo checkout.

O backend cria o produto em BRL/centavos e consulta o checkout oficial antes de confirmar um evento avulso. `checkout.methods` indica opções disponíveis, não necessariamente a forma utilizada. O evento autenticado fornece `payerInformation.method`. Se a consulta isolada não identifica com segurança a forma utilizada, a cobrança aguarda os detalhes; não se inventa uma forma de pagamento.

## Recorrência e datas

Abra os detalhes de um contrato mensal e escolha pagamento automático. O produto externo usa o valor contratado menos desconto recorrente e ciclo `MONTHLY`. O `externalId` do checkout recorrente é o ID da assinatura interna. O ID `bill_...` é salvo na adesão; `subs_...` só é vinculado após confirmação efetiva externa.

Limites deliberados deste MVP:

- Adesão inicial somente no vencimento do contrato, entre os dias **1 e 28**. A API não oferece agendamento do dia inicial nesse endpoint.
- Contratos com término definido usam cobrança avulsa neste MVP. Não se cria autorização sem encerramento programado seguro.
- Checkout não autorizado é encerrado após a janela de adesão. Confirmação inicial em data incompatível não ativa silenciosamente a recorrência: fica em conferência e solicita cancelamento externo.
- Renovações aprovadas em retentativa usam a competência do vencimento contratual anterior ou igual ao débito. A restrição do primeiro dia não cancela uma renovação legítima no dia seguinte.
- Data do primeiro débito confirmado é exibida. Períodos e próxima cobrança só são exibidos quando retornados pela API; datas estimadas não são apresentadas como confirmação externa.
- Cancelar recorrência não encerra o contrato interno nem exclui mensalidades ou pagamentos. Nova autorização após cancelamento exige novo contrato neste MVP, preservando a referência externa anterior.
- Valor autorizado não é alterado silenciosamente. Divergência entre contrato, mensalidade e assinatura externa exige conferência.

O worker existente executa a cada minuto. Gera competências atual e seguinte dentro do período comercial, com lock da assinatura e unicidade por assinatura/competência. Gerar competência nunca confirma pagamento. Recorrência em andamento bloqueia checkout avulso e geração automática InfinitePay para o mesmo contrato. Para recuperação avulsa, cancele e confirme o encerramento externo antes de gerar outro link.

## Webhook HTTPS e reconciliação

Cadastre no painel AbacatePay a URL HTTPS pública que encaminhe para o caminho retornado na configuração:

```text
/api/v1/pagamentos/webhook/abacatepay/<id-da-integracao>
```

O backend não exige URL pública como campo de configuração. Para receber notificações externas na homologação, o caminho precisa estar acessível por HTTPS. Pode ser encaminhado pelo mesmo domínio/proxy do frontend, conforme a infraestrutura escolhida. Não publique nem exponha ambiente local sem configurar corretamente esse encaminhamento.

Use o mesmo segredo configurado, preferindo `X-Webhook-Secret` para evitar segredo em logs de URL. O backend também valida `X-Webhook-Signature` HMAC-SHA256/base64 sobre o corpo bruto, usando a chave pública indicada pela documentação oficial. O segredo independente comprova origem; a chave pública do HMAC não é um segredo de autenticação.

Eventos tratados: `checkout.completed`, `subscription.completed`, `subscription.renewed`, `subscription.payment_failed` e `subscription.cancelled`. O evento é autenticado, minimizado e persistido antes de processamento. Não se armazenam os objetos pessoais do pagador.

Avulso é liquidado uma vez por checkout. Recorrência é liquidada por `data.payment.id`, nunca pelo ID fixo da assinatura ou do checkout de contratação. O `checkout.completed` recorrente sem identificador individual é registrado e aguarda o evento `subscription.*` correspondente. Eventos repetidos, concorrentes ou fora de ordem não criam novo recebimento para a mesma transação. Cancelamento não é reaberto por sucesso antigo.

**Conferir pagamento** consulta o provedor; a página de retorno não comprova pagamento. O worker retoma intenções persistidas ainda não iniciadas e recupera operações interrompidas. Timeout não provoca segundo POST financeiro sem consultar a referência persistida.

Limitação oficial: as consultas de assinatura/checkout recorrente não fornecem histórico completo de pagamentos individuais. Uma renovação cujo evento se perdeu exige reenvio pelo provedor ou conferência operacional. O sistema mantém a mensalidade pendente e não inventa IDs, competência quitada ou valor recebido.

## Homologação necessária antes de produção

Os testes automatizados utilizam adaptador HTTP com respostas fictícias e PostgreSQL exclusivo. Nenhuma cobrança real foi executada. Ainda é necessário, com uma chave real do Modo Teste:

1. Validar permissões de clientes, produtos, checkout, assinaturas e cancelamento.
2. Criar checkout e simular pagamento no painel, verificando evento HTTPS e persistência.
3. Autorizar assinatura, simular primeiro pagamento, renovação, recusa, duplicidade e cancelamento.
4. Solicitar liberação de Pix Automático ao suporte; testar autorização bancária e eventos no Modo Teste. `/stores/get` não expõe capacidade Pix, portanto um checkbox não comprova liberação.
5. Confirmar datas efetivas e reenvio de notificações.
6. Registrar a homologação e liberar produção em mudança revisada. A interface atual não oferece um atalho para burlar esse bloqueio.

Não enviar chave API ou segredo por chat, logs ou commits.

## Validação automatizada

Backend: typecheck, lint, build, testes do adaptador, configuração/tenant/IDOR, eventos oficiais avulsos, recorrência, retentativas, falhas, cancelamento, recuperação, baixa idempotente e geração concorrente de competências.

Frontend: typecheck, lint, Vitest, build e Playwright isolado, sem usar serviços existentes ou banco de produção. Para repetir o teste de interface com APIs interceptadas:

```powershell
node scripts/run-e2e.mjs --payments-ui-only
```

As migrations068/069 preservam evidências: rollback operacional desativa a integração em vez de apagar histórico financeiro.

## Referências oficiais consultadas

- [API v2 e Modo Teste](https://docs.abacatepay.com/pages/comecar/modo-teste)
- [Checkout avulso](https://docs.abacatepay.com/pages/payment/create)
- [Clientes](https://docs.abacatepay.com/pages/client/create)
- [Produtos](https://docs.abacatepay.com/pages/products/create)
- [Criar checkout recorrente](https://docs.abacatepay.com/pages/subscriptions/create)
- [Assinaturas e ciclos](https://docs.abacatepay.com/pages/cobrar/assinaturas)
- [Pix Automático](https://docs.abacatepay.com/pages/cobrar/pix-automatico)
- [Eventos de checkout](https://docs.abacatepay.com/pages/webhooks/events/checkout)
- [Eventos de assinatura](https://docs.abacatepay.com/pages/webhooks/events/subscriptions)
- [Segurança dos webhooks](https://docs.abacatepay.com/pages/notificacoes/seguranca)
