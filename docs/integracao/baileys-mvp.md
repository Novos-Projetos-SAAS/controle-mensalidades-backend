# Baileys — demonstração integrada (branch codex/whatsapp-baileys)

**Status:** implementação candidata para homologação, não liberada para produção. O diagnóstico de terminal foi validado pelo desenvolvedor. O build integrado, migrations e teste real da interface ainda precisam ser executados. As dependências foram declaradas no package.json, mas o lockfile precisa ser regenerado antes do merge.

## Backend

Com alterações locais salvas e Node 22+:

```powershell
git fetch origin
git switch codex/whatsapp-baileys
git pull --ff-only origin codex/whatsapp-baileys
npm install --package-lock-only
npm ci
npm run typecheck
npm run build
npm audit --omit=dev
node --import tsx --test tests/modules/whatsapp/whatsapp.janela.test.ts tests/modules/whatsapp/whatsapp.baileys.crypto.test.ts
```

Confira DATABASE_URL e DATABASE_URL_MIGRATIONS no .env privado: somente banco de desenvolvimento/homologação, nunca produção. Execute primeiro o preflight somente leitura (`npm run migrations:preflight -- --env development`). Se houver migrations ausentes no checkout ou divergências, pare e reconcilie o ledger antes de executar `npm run migrate:latest`. Foram adicionadas três migrations: sessões Baileys, rotina diária financeira e separação da fila de mensagens.

Configuração privada (.env):

```dotenv
WHATSAPP_BAILEYS_DEMO_ENABLED=true
WHATSAPP_BAILEYS_DEMO_ORG_ID=<UUID da organização de demonstração>
WHATSAPP_BAILEYS_DEMO_AREA_ID=<UUID da área de demonstração>
WHATSAPP_BAILEYS_DEMO_TEST_NUMBER=<55+DDD+número sob seu controle, sem sinal +>
WHATSAPP_BAILEYS_ENCRYPTION_KEY=<32 bytes aleatórios em Base64>
WHATSAPP_BAILEYS_AUTOMATIC_ENABLED=false
FINANCEIRO_GERACAO_PROGRAMADA_ENABLED=false
```

Gere a chave uma única vez por ambiente, com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Guarde a chave no gerenciador de segredos; nunca no GitHub, frontend ou chat. Trocar a chave inviabiliza ler as sessões já armazenadas. Use uma organização e uma área de demonstração, sem dados de pacientes.

`npm run dev`

## Frontend

Na branch de mesmo nome, `npm ci`, `npm run typecheck`, `npm run dev`. Configure o destino de API já utilizado pelo projeto para apontar ao backend local. Abra WhatsApp Business > Conexão Baileys como administrador da área configurada.

1. Conectar WhatsApp e escanear o QR com um número remetente exclusivo.
2. Confirmar o destinatário de demonstração e enviar a mensagem.
3. Confirmar recebimento no celular: o status de submissão não prova entrega.
4. Encerrar a conexão, reiniciar o backend e reconectar: deve utilizar a sessão cifrada persistida no Neon.
5. Se apagar a sessão, remover também o dispositivo em Aparelhos conectados no WhatsApp. Apagar localmente não revoga o aparelho na Meta.

A conexão expira após três minutos e não há timer de keep-alive. O frontend consulta o status apenas durante uma conexão ativa. O lease no banco impede abertura simultânea do mesmo escopo e expira se o processo morrer.

## Rotinas programadas (ativar somente após homologar em ambiente de demonstração)

Por padrão, as duas rotinas externas estão desligadas. A primeira substitui a geração automática de competências feita pelo ciclo AbacatePay, mas não interrompe o processamento de pagamentos. Não ative antes de configurar o agendador.

```dotenv
FINANCEIRO_GERACAO_PROGRAMADA_ENABLED=true
FINANCEIRO_ROTINA_TOKEN=<segredo aleatório independente, mínimo 32 caracteres>
WHATSAPP_BAILEYS_AUTOMATIC_ENABLED=true
WHATSAPP_BAILEYS_ROTINA_TOKEN=<outro segredo aleatório, mínimo 32 caracteres>
WHATSAPP_BAILEYS_CHECKOUT_ORIGIN=<origem HTTPS confiável do frontend, permitida no CORS>
```

Configure um agendador externo em America/Sao_Paulo com POST HTTPS e header Authorization: Bearer <segredo correspondente> (não colocar segredo na URL):

| Horário | Rota |
| --- | --- |
| 07:00 | /api/v1/rotinas/financeiro/gerar-mensalidades |
| 09:00, 12:00, 15:00, 18:00 | /api/v1/whatsapp/baileys/rotina |

Financeiro: janela 07–19h, no máximo uma execução concluída por dia, lock transacional; falhas podem ser reprocessadas. Avaliar duração da transação em bases maiores. A geração é global, como a rotina financeira original. Não ativar no ambiente compartilhado sem testar previamente.

WhatsApp: janela 09–19h, até cinco tarefas por chamada, conexão apenas quando existem pendências. Busca lembretes D-1, D0 e D+3, revalida saldo, vínculo, consentimento, data e link HTTPS, marca envio incerto antes do efeito externo. Resultado incerto não é reenviado automaticamente. Não habilita nem modifica o worker real da Meta. Tarefas antigas da fila simulada não são convertidas em tarefas Baileys. A rotina envia **apenas ao número autorizado de demonstração**, mesmo com as flags ligadas; para validar, use cliente fictício, telefone E.164, consentimento válido e mensalidade com checkout real de teste e saldo correto. Uma cobrança quitada/cancelada não gera envio. Para D+3, é necessário checkout ainda válido para o saldo, e não se cria link automaticamente quando ausente.

A mensagem é registrada como enviada quando a biblioteca retorna identificador; isso não comprova entrega. Não se mantém socket para capturar recibos durante hibernação. A homologação de múltiplas clínicas, revogação remota de dispositivos e sincronização de recibos são etapas de produção ainda pendentes.

Não configure pings de 10 em 10 minutos. Monitore a franquia compartilhada do Render. Use uma conta/número exclusivo: a Baileys é extraoficial e há risco de bloqueio. Não transmitir conteúdo clínico por essa integração.
