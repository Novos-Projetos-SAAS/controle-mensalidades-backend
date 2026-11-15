# WhatsApp — arquitetura da etapa 01

## Escopo e estado

O módulo prepara configuração por organização/área, propostas de templates, consulta do histórico, agendamento persistente e worker simulado. Nesta etapa não existe envio Cloud API, webhook HTTP público, Embedded Signup, cron ou acesso a contas Meta reais. A API só registra metadados como `PENDENTE_AUTORIZACAO`; cadastrar um número não ativa a integração.

## Estruturas reutilizadas

- `integracoes_whatsapp`: remetente e estados de conexão/autorização/templates. A coluna legada `configuracao_criptografada` não é devolvida pelas APIs; segredos futuros devem ser armazenados em cofre e referenciados por `credencial_referencia`.
- `modelos_mensagem`: conteúdo e estado de aprovação do template Meta. As três propostas são internas e começam como `NAO_SUBMETIDO`.
- `tarefas_mensagem` e `mensagens`: fila, lease, tentativas, estado de envio e histórico.
- `clientes.aceite_whatsapp`, origem/data e campos de opt-out existentes: o worker exige consentimento atual, cliente ativo, vínculo com a área e telefone E.164.
- `registros_auditoria`: alterações administrativas de configuração.

A migration `20261113160000_063_base_operacional_whatsapp.js` adiciona escopo por área, vínculos financeiros opcionais, idempotência do ciclo do lembrete, leases e ledger de eventos. Tarefas antigas sem `mensalidade_id` não entram no worker novo.

## APIs autenticadas

Prefixo `/api/v1/whatsapp`; todas as rotas exigem sessão, organização e perfil `ADMINISTRADOR`.

| Rota | Uso |
| --- | --- |
| `GET /configuracoes` | Lista metadados sem credenciais. |
| `PUT /configuracoes` | Registra WABA, Phone Number ID, número e nome como pendentes; aceita `areaNegocioId` opcional. |
| `GET /modelos` | Exibe as propostas internas, explicitamente não submetidas/aprovadas. |
| `GET /tarefas` | Lista tarefas da área autenticada com paginação e filtro de status. |
| `GET /mensagens` | Lista histórico sem conteúdo da mensagem ou token. |
| `GET /metricas` | Conta tarefas e mensagens por status/categoria/modo; custo estimado fica `null`. |

Não há endpoints de ativação manual, envio ou webhook nesta etapa.

## Worker e segurança

`processarFilaWhatsapp` recebe implementações injetadas do contrato financeiro e do adapter. Só aceita um provider com modo `SIMULADO`; usa `FOR UPDATE SKIP LOCKED`, lease por token, tentativa e backoff. Antes de cada envio simulado relê consentimento, escopo e snapshot financeiro; exige saldo consistente e checkout cujo valor corresponda ao saldo. Exceções de resultado desconhecido viram `RESULTADO_INCERTO` e não são repetidas automaticamente. A execução real está bloqueada.

O processamento interno de status Meta em `whatsapp.webhook.service.ts` exige HMAC SHA-256 antes de gravar o evento e deduplica por hash. Não está conectado a uma rota pública; primeiro será necessário implementar a captura de corpo bruto, o handshake e o vínculo seguro entre Phone Number ID e organização/área.

## Próximas dependências

1. Cofre de credenciais e onboarding Meta oficial, com validação real antes de ativar.
2. Templates submetidos/aprovados na conta e sincronização dos estados.
3. Contrato real com financeiro e checkout de saldo atualizado.
4. Endpoint HTTPS protegido para webhook, observabilidade e política operacional de limite.
5. Revisão de elegibilidade/permissões para Embedded Signup e coexistência do app Business.

Os requisitos externos atuais de Cloud API e webhook estão em [configuracao-meta.md](configuracao-meta.md).
