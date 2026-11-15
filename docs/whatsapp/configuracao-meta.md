# Meta WhatsApp Cloud API — Embedded Signup 03B.1

## Estado

O backend prepara o onboarding multiempresa do Embedded Signup v4. Não houve conexão de conta real nem envio de mensagem; envio real, worker e cron permanecem desativados. A autorização, registro do número, assinatura de webhook, aprovação de templates e ativação operacional são estados distintos. Mesmo após concluir o onboarding, `prontaParaEnvio` permanece `false`.

O frontend ainda não faz parte desta entrega. A API fornece configuração pública do SDK e correlação `state` de uso único. O código de autorização é trocado exclusivamente pelo backend e o token de cada integração é guardado no cofre AES-256-GCM existente. App Secret e tokens nunca são retornados à API pública, auditoria ou logs.

## Contrato para o frontend

Prefixo `/api/v1/whatsapp`; todas as rotas abaixo exigem sessão, perfil `ADMINISTRADOR`, organização e área autenticadas (`x-organizacao-id` e `x-area-negocio-id`). A área não é aceita no corpo como substituta do contexto autenticado.

| Método e rota                               | Uso                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /onboarding/configuracao-sdk`          | App ID, Configuration ID, versão Graph, permissões e opções públicas para inicializar o SDK. Não inclui App Secret.                                                                                                                                                      |
| `POST /onboarding/iniciar`                  | Cria `correlacaoId`, `state` aleatório e validade de 10 minutos, vinculados a usuário/organização/área. Inicie o SDK com o `state` e a configuração retornados.                                                                                                          |
| `POST /onboarding/concluir`                 | Recebe `{resultado:"AUTORIZADO", correlacaoId, state, codigo, wabaId, phoneNumberId, businessId?, modoOnboarding, registrationPin?}` ou `{resultado:"CANCELADO", correlacaoId, state}`. A Meta verifica no servidor se a conta e o número pertencem ao token autorizado. |
| `POST /onboarding/{correlacaoId}/continuar` | Retoma registro Cloud API com `{registrationPin?}` e assinatura do app nos webhooks. Pode retornar `202` e requisitos pendentes.                                                                                                                                         |
| `GET /onboarding/{correlacaoId}`            | Consulta estados públicos de autorização, registro, webhook, templates, conexão e requisitos pendentes. Nunca retorna credenciais.                                                                                                                                       |

O resultado do onboarding contém identificadores Meta e `ativa:false`; `prontaParaEnvio:false` é mantido mesmo com autorização, registro e webhook concluídos. `202` representa etapa/ação pendente; erros retornam códigos públicos estáveis, sem mensagem bruta da Meta. Um código é aceito uma única vez. `state` é comparado em hash e correlação é restrita ao usuário, organização e área originais. Iniciar novo fluxo após cancelamento/expiração.

O frontend deve mapear o callback oficial do Embedded Signup v4 ao DTO, enviar somente os campos documentados e tratar cancelamento/expiração sem tentar reutilizar código. A opção de coexistência só aparece quando habilitada no SDK e a elegibilidade ainda é confirmada no servidor. O PIN Cloud API, quando necessário, é enviado pelo canal autenticado de continuação e não fica persistido.

## Configuração segura por ambiente

- `WHATSAPP_META_APP_ID`: App ID público, necessário para disponibilizar configuração do SDK.
- `WHATSAPP_META_CONFIGURATION_ID`: Configuration ID do Facebook Login for Business/Embedded Signup.
- `WHATSAPP_META_APP_SECRET`: segredo servidor-servidor para troca de código e HMAC dos webhooks; somente secret manager.
- `WHATSAPP_META_GRAPH_API_VERSION`: versão explícita `vN.N` (default atual do projeto: `v27.0`); revisar antes de cada liberação.
- `WHATSAPP_META_COEXISTENCE_ENABLED=false`: feature flag de coexistência. Mesmo habilitada, cada número precisa ser elegível e confirmado por consulta autenticada à Graph API.
- `WHATSAPP_META_WEBHOOK_VERIFY_TOKEN`: segredo exclusivo do handshake GET.
- `WHATSAPP_CREDENTIALS_ENCRYPTION_KEY`: chave base64 de 32 bytes usada pelo cofre AES-256-GCM já existente.
- `WHATSAPP_META_REAL_SEND_ENABLED=false`: manter desabilitada; a integração não liga o envio real ao worker.

Não registrar códigos, tokens, App Secret, PIN, corpos autenticados ou URLs com credenciais. O gateway Graph usa timeout e não repete requests automaticamente. O schema de credenciais está na migration `20261115160000_064_credenciais_meta_whatsapp.js`; os estados e correlações do onboarding estão na migration `20261116120000_065_onboarding_embedded_signup_whatsapp.js`. Aplicar somente em ambiente controlado autorizado; não executar em banco compartilhado nesta etapa.

## Requisitos no Meta Developers antes da conexão real

1. Criar/selecionar app Meta e Business Portfolio, habilitar WhatsApp e configurar Facebook Login for Business com produto Embedded Signup v4; copiar o Configuration ID, registrar origens/domínios HTTPS permitidos e definir a configuração de login para o fluxo necessário.
2. Configurar permissões `whatsapp_business_management` e `whatsapp_business_messaging` com Advanced Access/App Review para onboarding de empresas externas; aprovar o caso de uso de Tech Provider/solution provider quando exigido pela Meta.
3. Configurar webhook HTTPS do app, `messages` e os campos/eventos exigidos pelo fluxo, cadastrar o verify token no ambiente e manter o App Secret apenas no backend. A integração também assina cada Messaging Account autorizada via Graph API.
4. Para Cloud API padrão, concluir a verificação/registro do número e seu PIN de verificação em duas etapas. Para coexistência, habilitar o recurso/fluxo elegível do app e confirmar requisitos de Tech Provider/solution partner; o backend não chama `/register` quando a elegibilidade de coexistência é confirmada.
5. Confirmar verificação do Business Portfolio, faturamento, elegibilidade de país/número, limites, políticas e atribuição dos ativos. A conta pode autorizar sem que o número esteja registrado ou pronto para tráfego.
6. Criar e aprovar templates, idioma e categoria (por exemplo, Utility) e validar placeholders antes de qualquer envio.
7. Definir responsáveis por rotação/revogação de tokens, App Review, custos, privacidade, opt-out, limites e incidentes. Só depois da homologação controlada deve haver decisão separada de ativação operacional.

O Embedded Signup v4 é a versão a integrar: a documentação informa descontinuação das versões v2/v3 a partir de 15/10/2026. A evolução do modelo separa WhatsApp Accounts (WAAC) e Messaging Accounts; o fluxo atual usa o identificador retornado como Messaging Account/WABA e conserva `whatsapp_account_id` nulo se não for fornecido/confirmado. Coexistência não deve ser inferida a partir de dados do navegador.

## Documentação oficial consultada

- [Embedded Signup v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4)
- [Visão geral, permissões e requisitos de Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview)
- [Fluxo padrão](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow)
- [Onboarding de usuários do WhatsApp Business App e coexistência](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)
- [Evolução do modelo de contas](https://developers.facebook.com/documentation/business-messaging/whatsapp/account-model-evolution/)
- [Graph API: WhatsApp Business Account](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/)
- [Graph API: Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
