# Integração do frontend Next.js com a API

Este documento descreve os contratos HTTP disponíveis para o frontend. As rotas financeiras abaixo compõem o primeiro fluxo manual, protegido e limitado à organização e à área selecionadas. A interface financeira ainda não foi criada neste repositório.

## Base, sessão e contexto

- Base local do backend: `http://localhost:3333/api/v1`.
- O Next.js já reescreve `/api/:path*` para `BACKEND_URL` ou `http://localhost:3333`. No browser, continue usando caminhos relativos como `/api/v1/financeiro/planos`; não exponha o endereço do backend nem o cookie ao JavaScript.
- Login: `POST /api/v1/auth/login`, body `{ "email": "admin@example.test", "senha": "senha-ficticia" }`. O backend responde `{ status, message, data: { usuario, organizacoes } }` e grava o JWT no cookie HTTP-only `token`.
- Sessão: `GET /api/v1/auth/me`; saída: `POST /api/v1/auth/logout`.
- As chamadas pelo rewrite Next.js usam o cookie same-origin. A API não espera `Authorization: Bearer`; não leia nem persista o token no client state, localStorage ou Cache Storage.
- Depois de escolher a organização, envie `x-organizacao-id: <UUID>`. Depois de escolher a área, envie também `x-area-negocio-id: <UUID>`. As rotas financeiras exigem ambos e verificam a associação em cada requisição.
- Todas as rotas financeiras exigem perfil `ADMINISTRADOR`. Não há autorização financeira separada por módulo no backend atual.
- Para chamadas diretas cross-origin, configure `CORS_ALLOWED_ORIGINS` com origens HTTP(S) exatas separadas por vírgula. Desenvolvimento e teste permitem por padrão `http://localhost:3000`; produção não habilita uma origem implícita. O preflight aceita `Content-Type`, `X-Organizacao-Id`, `X-Area-Negocio-Id` e `Idempotency-Key`, com credenciais. O caminho recomendado para o Next.js/PWA é same-origin pelo rewrite.
- Respostas incluem `X-Request-Id`. Erros usam `{ "situacao": "falha", "codigo": "...", "mensagem": "...", "request_id": "..." }`.

## Cabeçalhos financeiros

Todas as chamadas financeiras usam:

```http
Cookie: token=<gerenciado pelo browser>
x-organizacao-id: 2f69bc56-2664-4e59-9d3a-3eed69c3fd8b
x-area-negocio-id: 61d4ab8f-c1e6-4330-a768-6f42b8e3c834
Content-Type: application/json
```

O cookie é `HttpOnly`, `SameSite=Lax` e `Secure` em produção. As chamadas mutáveis devem ser feitas pelo mesmo origin Next.js para que o browser envie o cookie de sessão.

## Planos

### Listar planos ativos

`GET /api/v1/financeiro/planos`

Sem parâmetros. Retorna array direto em `data`, com planos da área selecionada e planos globais (`area_negocio_id: null`) da mesma organização. Somente planos ativos e não excluídos são listados.

Exemplo de sucesso `200`:

```json
{
  "status": "success",
  "message": "Planos listados.",
  "data": [
    {
      "id": "2b69fc6d-516e-4f4b-9be1-b43485ccab32",
      "nome": "Mensal",
      "descricao": null,
      "valor_base": "100.00",
      "periodicidade": "MENSAL",
      "area_negocio_id": "61d4ab8f-c1e6-4330-a768-6f42b8e3c834"
    }
  ]
}
```

### Consultar plano

`GET /api/v1/financeiro/planos/{planoId}`

Retorna o plano se pertencer à organização e à área atual (ou se for global dessa organização). UUID inexistente ou fora do contexto: `404 PLANO_NAO_ENCONTRADO`.

### Criar plano mensal

`POST /api/v1/financeiro/planos`

Body estrito:

```json
{
  "nome": "Mensal",
  "descricao": "Plano fictício",
  "valor_base": "100.00"
}
```

`descricao` é opcional. `valor_base` precisa ser string decimal positiva com até duas casas, no máximo `9999999999.99`. A periodicidade é gravada como `MENSAL`. Sucesso: `201` com o plano em `data`. Erros: `400 DADOS_PLANO_INVALIDOS` ou `400 VALOR_PLANO_INVALIDO`.

Não existe endpoint de edição ou desativação de plano neste fluxo. Isso preserva o valor contratado pelas assinaturas já existentes.

## Assinaturas

### Listar assinaturas

`GET /api/v1/financeiro/assinaturas?page=1&pageSize=20&status=ATIVA&clienteId=<UUID>`

Filtros opcionais: `page` (padrão 1), `pageSize` (padrão 20, máximo 100), `status` (`ATIVA`, `CANCELADA`, `ENCERRADA`) e `clienteId`.

Sucesso `200`: `data: { items: [...], pagination: { page, pageSize, total, pages } }`. Cada item informa cliente, plano e valor contratado.

### Consultar assinatura

`GET /api/v1/financeiro/assinaturas/{assinaturaId}`

Retorna cliente, plano, valor e datas da assinatura no contexto atual. Fora da organização/área ou inexistente: `404 ASSINATURA_NAO_ENCONTRADA`.

### Criar assinatura

`POST /api/v1/financeiro/assinaturas`

```json
{
  "cliente_id": "3becd846-8162-4e99-a0bc-14059971a443",
  "plano_comercial_id": "2b69fc6d-516e-4f4b-9be1-b43485ccab32",
  "dia_vencimento": 5,
  "inicio_em": "2026-11-01"
}
```

O cliente deve estar ativo e associado à área. O plano deve estar ativo, mensal, da organização atual e da mesma área ou ser global. A assinatura guarda uma cópia do valor do plano; desconto recorrente permanece `0.00`. Sucesso: `201` com os dados da assinatura. Erros principais: `400 DADOS_ASSINATURA_INVALIDOS`, `404 CLIENTE_FINANCEIRO_NAO_ENCONTRADO`, `404 PLANO_NAO_ENCONTRADO`, `409 PERIODICIDADE_NAO_SUPORTADA` e `409 PLANO_SEM_COBRANCA`.

Não há cobrança recorrente automática nem endpoints para alterar, encerrar ou cancelar assinatura.

## Mensalidades

### Gerar uma mensalidade manualmente

`POST /api/v1/financeiro/assinaturas/{assinaturaId}/mensalidades`

```json
{ "competencia": "2026-11" }
```

A competência deve ficar dentro do período da assinatura. A mensalidade é gerada manualmente e no máximo uma vez por assinatura/competência. O dia de vencimento vem da assinatura; em meses mais curtos, usa-se o último dia do mês. Desconto e ajuste ficam zerados no fluxo atual.

- `201`: criada; `data: { mensalidade, criada: true }`.
- `200`: já existia; devolve a mesma mensalidade com `criada: false`.
- `404 ASSINATURA_NAO_ENCONTRADA`, `409 ASSINATURA_INATIVA`, `409 COMPETENCIA_FORA_DA_ASSINATURA` ou `409 VALOR_MENSALIDADE_INVALIDO`.

### Listar mensalidades

`GET /api/v1/financeiro/mensalidades?page=1&pageSize=20&clienteId=<UUID>&competencia=2026-11&status=PENDENTE&vencimentoDe=2026-11-01&vencimentoAte=2026-11-30`

Filtros opcionais: `page`, `pageSize`, `clienteId`, `competencia` (`YYYY-MM`), `status` (`PENDENTE`, `PARCIAL`, `VENCIDA`, `PAGA`, `CANCELADA`), `vencimentoDe` e `vencimentoAte` (`YYYY-MM-DD`, inclusivos). O intervalo de vencimento deve ser crescente. A resposta `200` tem `data: { items, pagination }`.

O status é calculado na consulta: cancelamento prevalece; conta quitada vira `PAGA`; vencimento anterior à data atual do banco vira `VENCIDA`; pagamentos parciais ainda dentro do prazo viram `PARCIAL`; demais ficam `PENDENTE`. Mensalidade parcialmente paga e já vencida é retornada como `VENCIDA`, com `valor_pago` e `saldo` para mostrar a baixa parcial.

### Consultar mensalidade e recebimentos

`GET /api/v1/financeiro/mensalidades/{mensalidadeId}`

Retorna valores como strings decimais (`valor_final`, `valor_pago`, `saldo`), situação calculada e array de recebimentos. UUID fora da área/organização: `404 MENSALIDADE_NAO_ENCONTRADA`.

## Recebimentos manuais

### Registrar um recebimento

`POST /api/v1/financeiro/mensalidades/{mensalidadeId}/recebimentos`

Além dos cabeçalhos financeiros, exige `Idempotency-Key` única por organização, de 1 a 150 caracteres.

```http
Idempotency-Key: recebimento-cliente-3becd846-2026-11-01
```

```json
{
  "valor": "40.00",
  "forma_pagamento": "PIX",
  "pago_em": "2026-11-05T14:30:00-03:00"
}
```

`valor` deve ser string decimal positiva com até duas casas. `pago_em` deve ser ISO 8601 com `Z` ou offset, com no máximo três casas fracionárias de segundo (milissegundos). A forma de pagamento é texto obrigatório com até 30 caracteres; o domínio ainda não define uma enumeração canônica.

- `201`: novo recebimento gravado.
- `200`: repetição idêntica; devolve o mesmo pagamento, sem criar outro.
- `400`: body inválido, valor inválido ou header de idempotência ausente/inválido.
- `404 MENSALIDADE_NAO_ENCONTRADA`: mensalidade fora do contexto.
- `409`: mensalidade cancelada/paga, valor maior que o saldo, situação não suportada ou chave já usada com outro recurso/valor/forma/data.

São permitidos recebimentos parciais. O saldo e o estado da conta são atualizados dentro da mesma transação PostgreSQL que grava o pagamento, o histórico e a auditoria. A conta só passa a `PAGO` quando a soma dos recebimentos alcança o valor final. Uma chave reutilizada com mesmo recurso, valor, forma e instante de pagamento é idempotente mesmo se o offset representar o mesmo instante.

### Consultar resumo financeiro

`GET /api/v1/financeiro/resumo?inicio=2026-11-01&fim=2026-11-30`

`inicio` e `fim` são datas ISO e inclusivas para os recebimentos do período. O resumo informa clientes/profissionais ativos na área, mensalidades e valores em aberto/vencidos e o total recebido no período. Intervalo invertido: `400 PERIODO_RESUMO_INVALIDO`.

## Exemplos de fluxo

1. Fazer login e guardar apenas a sessão HTTP-only do browser.
2. Consultar organizações e áreas, selecionar contexto e anexar `x-organizacao-id` e `x-area-negocio-id`.
3. `GET /financeiro/planos`; escolher um plano mensal ativo.
4. `POST /financeiro/assinaturas` com cliente, plano, vencimento e início.
5. `GET /financeiro/assinaturas` ou `/financeiro/assinaturas/{id}` para conferir a contratação.
6. `POST /financeiro/assinaturas/{id}/mensalidades` para a competência desejada. A API não agenda esta operação automaticamente.
7. `GET /financeiro/mensalidades` para listar por cliente, situação ou vencimento.
8. Registrar valor realmente recebido em `POST /financeiro/mensalidades/{id}/recebimentos`, sempre com uma chave de idempotência estável por tentativa lógica.
9. `GET /financeiro/mensalidades/{id}` para atualizar situação, saldo e recebimentos.

Use `X-Request-Id` para suporte e diagnóstico; não repita uma operação financeira com uma nova chave quando estiver recuperando de timeout. Reenvie a mesma chave e o mesmo payload.

## Vínculo usuário-profissional

- `GET /api/v1/profissionais/{profissionalId}/usuario`: exige cookie, organização/área, módulo AGENDA e `ADMINISTRADOR`. Retorna `data: { profissionalId, usuario: { id, nome } | null, vinculoAtivo }`. Não retorna email, senha nem dados clínicos.
- `PATCH /api/v1/profissionais/{profissionalId}/usuario` aceita `{ "usuarioId": "<UUID>" }` para vincular ou `{ "usuarioId": null }` para desvincular. A alteração não herda nem concede acesso clínico; mudanças permanecem bloqueadas quando existe histórico clínico, conforme as regras atuais.

## Fora do escopo atual

Não foram implementados edição/arquivamento de planos, cancelamento ou alteração de assinatura, cancelamento de mensalidade, estorno, desconto, multa, juros, cobrança automática, geração automática mensal, gateway, webhook, conciliação bancária nem comprovante. Esses comportamentos precisam de regra de negócio definida antes de serem expostos.
