# WhatsApp — arquitetura operacional e preparação Meta

## Escopo e estado

O módulo mantém a base operacional da etapa 01 e prepara o Embedded Signup v4 sem conectar contas reais nem enviar mensagens. Envio real, worker e cron permanecem desativados. O onboarding autenticado valida o código no servidor, cifra a credencial, confirma os ativos Meta e provisiona registro/webhook como fases distintas; templates e ativação operacional continuam pendentes.

## Estruturas reutilizadas

- `integracoes_whatsapp`: remetente e estados de conexão/autorização/templates. `configuracao_criptografada` permanece intacta; credenciais novas usam `credenciais_meta_criptografadas`, AES-256-GCM e AAD vinculada à organização/área/integração. APIs públicas não selecionam nem retornam segredo ou referência.
- `modelos_mensagem`: conteúdo e estado de aprovação do template Meta. As três propostas são internas e começam como `NAO_SUBMETIDO`.
- `tarefas_mensagem` e `mensagens`: fila, lease, tentativas, estado de envio e histórico.
- `clientes.aceite_whatsapp`, origem/data e campos de opt-out existentes: o worker exige consentimento atual, cliente ativo, vínculo com a área e telefone E.164.
- `registros_auditoria`: alterações administrativas de configuração.

A migration `20261113160000_063_base_operacional_whatsapp.js` adiciona escopo por área, vínculos financeiros opcionais, idempotência do ciclo do lembrete, leases e ledger de eventos. Tarefas antigas sem `mensalidade_id` não entram no worker novo.

A migration `20261115160000_064_credenciais_meta_whatsapp.js` adiciona armazenamento separado para tokens cifrados. A migration é código versionado, mas não deve ser aplicada ao banco compartilhado sem janela aprovada.

## APIs autenticadas

Prefixo `/api/v1/whatsapp`; todas as rotas exigem sessão, organização e perfil `ADMINISTRADOR`.

| Rota                                        | Uso                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /configuracoes`                        | Lista metadados sem credenciais.                                                                                   |
| `PUT /configuracoes`                        | Registra WABA, Phone Number ID, número e nome como pendentes; aceita `areaNegocioId` opcional.                     |
| `GET /onboarding/configuracao-sdk`          | Retorna somente App ID, Configuration ID, versão Graph e opções públicas.                                          |
| `POST /onboarding/iniciar`                  | Cria correlação/state de uso único por usuário, organização e área, com validade de 10 minutos.                    |
| `POST /onboarding/concluir`                 | Consome callback autorizado/cancelado, troca o código via Graph API e verifica conta/número no escopo autenticado. |
| `POST /onboarding/{correlacaoId}/continuar` | Retoma registro Cloud API se necessário e assinatura de webhooks; aceita PIN efêmero.                              |
| `GET /onboarding/{correlacaoId}`            | Retorna estados públicos e requisitos pendentes, sem token/segredo. `prontaParaEnvio` é sempre `false`.            |
| `GET /modelos`                              | Exibe as propostas internas, explicitamente não submetidas/aprovadas.                                              |
| `GET /tarefas`                              | Lista tarefas da área autenticada com paginação e filtro de status.                                                |
| `GET /mensagens`                            | Lista histórico sem conteúdo da mensagem ou token.                                                                 |
| `GET /metricas`                             | Conta tarefas e mensagens por status/categoria/modo; custo estimado fica `null`.                                   |

As rotas públicas `GET /webhook` (handshake) e `POST /webhook` (HMAC no corpo bruto) são exceções sem autenticação de usuário. O POST identifica a integração pela combinação `entry.id` (Messaging Account) + `metadata.phone_number_id`, exige correspondência do destinatário/mensagem, grava idempotência somente depois da validação e ignora roteamento ambíguo. Status são monotônicos e eventos repetidos não reaplicam efeitos.

## Worker e segurança

`processarFilaWhatsapp` recebe implementações injetadas do contrato financeiro e do adapter. Só aceita um provider com modo `SIMULADO`; usa `FOR UPDATE SKIP LOCKED`, lease por token, tentativa e backoff. Antes de cada envio simulado relê consentimento, escopo e snapshot financeiro; exige saldo consistente e checkout cujo valor corresponda ao saldo. Exceções de resultado desconhecido viram `RESULTADO_INCERTO` e não são repetidas automaticamente. O adapter Meta usa HTTP injetável, envia templates com parâmetros ordenados e classifica falhas sem imprimir segredos; seu flag permanece desligado e não está ligado ao worker real.

O webhook usa o App Secret para HMAC SHA-256 (`X-Hub-Signature-256`) e corpo bruto. Eventos sem Phone Number ID reconhecido, com organização ambígua, destinatário divergente ou mensagem não registrada não escrevem no ledger. Não aceita organização/área informada pelo chamador.

## Próximas dependências

1. Aplicar migrations 064 e 065 somente em banco de testes/homologação autorizado; configurar chave do cofre e segredos por ambiente.
2. Configurar App ID, Configuration ID, App Secret, permissões Advanced Access/App Review e Webhooks no Meta Developers.
3. Integrar o SDK oficial no frontend em tarefa própria; validar state/callback e testar elegibilidade de número/coexistência com ativos Meta de teste.
4. Aprovar templates e homologar políticas, limites, custos e opt-out. Qualquer ativação ou envio real requer etapa e autorização operacional separadas.

Os requisitos externos atuais de Cloud API e webhook estão em [configuracao-meta.md](configuracao-meta.md).
