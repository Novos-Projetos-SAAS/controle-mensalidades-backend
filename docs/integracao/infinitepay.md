# InfinitePay: mensalidades e página privada de pagamento

## Comportamento entregue

O administrador configura a integração na aba InfinitePay do financeiro. A configuração pertence à organização e vale para suas áreas. A integração começa desativada; a geração automática também começa desativada.

Quando habilitada, a rotina procura mensalidades **já existentes**, com conta pendente e saldo mínimo de R$ 1,00. Ela gera o checkout entre um ou dois dias corridos antes do vencimento, conforme a preferência do administrador. O fuso utilizado é `America/Sao_Paulo`. A janela inclui o vencimento para recuperar uma execução perdida; mensalidades vencidas não entram nessa geração automática.

Esta funcionalidade não cria competências futuras, não constitui uma assinatura recorrente no provedor e não debita cartões automaticamente. Mensalidades continuam sendo geradas pelo fluxo financeiro existente. O administrador também pode gerar um link manualmente pelos detalhes da mensalidade, inclusive para uma conta vencida.

Uma cobrança possui uma página privada individual em `/pagamento/:token`. A página mostra somente valor, vencimento, situação e checkout utilizável. O token aleatório de 256 bits é uma capacidade de acesso: quem possui o endereço pode consultar essa cobrança. Não existe busca pública por nome, CPF, cliente ou ID da mensalidade. O administrador pode copiar o endereço no painel e compartilhá-lo diretamente com o cliente. O sistema não envia WhatsApp ou e-mail nesta entrega.

## Configuração e URLs

Há somente uma nova variável de ambiente no backend:

```dotenv
INFINITEPAY_ENCRYPTION_KEY=<32 bytes aleatórios em Base64 canônico>
```

Uma chave pode ser gerada localmente, sem serviços externos:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Guarde a chave no gerenciador de segredos do backend. Não a envie ao navegador, não a publique e não a troque sem um processo de recifragem: cobranças existentes dependem dela para recuperar suas credenciais históricas.

InfiniteTag, chave da conta InfinitePay, ativação, geração automática e antecedência ficam no banco. As respostas administrativas informam apenas `has_api_key`. AES-256-GCM com IV aleatório e AAD vincula cada segredo à organização, à conta e à sua finalidade. Uma cobrança mantém uma cópia cifrada da credencial utilizada na criação, permitindo consultar pagamentos existentes após a troca da conta configurada.

**Não há campos de URL pública do backend ou de URL de retorno do frontend.** O proxy Next.js acrescenta `x-platform-origin` a partir da origem da requisição no servidor. O backend aceita somente uma origem exata da configuração **já existente** `CORS_ALLOWED_ORIGINS`; não utiliza um `Host` arbitrário como endereço de callback. Para uma chamada administrativa direta, pode ser informado um `Origin` autorizado; na ausência dele o fallback exige exatamente uma origem autorizada.

Os caminhos são fixos no código:

- Retorno: `https://<origem-autorizada>/pagamento/retorno`.
- Webhook: `https://<origem-autorizada>/api/v1/pagamentos/webhook/infinitepay`.

O webhook passa pelo proxy da plataforma. O frontend continua usando seu `BACKEND_URL` existente para alcançar o backend, inclusive em rede interna. Pagamentos públicos não encaminham cookies ou headers de organização/área. O backend não precisa de endereço público separado; a plataforma precisa ser alcançável por HTTPS pelo cliente e pela InfinitePay. HTTP em loopback é tolerado somente fora de produção, para testes com provedor simulado.

## Persistência e segurança financeira

A migration `20261125120000_067_infinitepay_cobrancas.js` amplia as tabelas existentes `integracoes_pagamento`, `cobrancas_pagamento`, `pagamentos` e `eventos_webhook`. A tabela nova `transacoes_pagamento` registra a transação oficial e sua classificação, inclusive quando exige revisão. Migrations históricas foram preservadas.

- A cobrança é persistida antes de chamar `/links`; a criação tem claim exclusivo.
- Existe no máximo uma cobrança ativa ou incerta por conta. Repetir a solicitação devolve a cobrança existente.
- O payload usa o saldo calculado no backend, em centavos, com descrição genérica da competência. Dados clínicos e identidade do cliente não são enviados.
- O checkout recebe `single_payment=true` e validade. Para uma dívida futura, a validade termina no fim do vencimento em São Paulo; para geração manual vencida, dura 24 horas. A validade respeita o limite do provedor.
- Falha de transporte deixa `CRIACAO_INCERTA`; o sistema não repete `/links` automaticamente, pois uma resposta perdida não prova que o link não foi criado.
- Webhook e retorno são pistas. O pagamento depende de consulta oficial a `/payment_check`, com a conta histórica e os identificadores da cobrança.
- Confirmação exige `success=true`, `paid=true`, valor original exato, valor pago suficiente, método reconhecido e identificadores consistentes. Taxas adicionais de parcelamento não aumentam o valor baixado na mensalidade.
- Uma transação do provedor tem unicidade global. A baixa utiliza o núcleo transacional do financeiro, com lock da conta, saldo, histórico e auditoria na mesma transação. Pagamento externo tem origem `INFINITEPAY` e ator do sistema; não simula usuário administrador.
- A API consultada não fornece o instante original do pagamento no contrato utilizado. `pago_em` representa o instante da verificação; a evidência externa e `verificado_em` permitem identificar essa origem temporal.
- Se a dívida já foi paga manualmente, cancelada ou não comporta o valor recebido, a transação fica em revisão sem nova baixa. Uma confirmação tardia de checkout expirado pode quitar uma dívida que continua válida: expiração da URL não prova quando o cliente pagou.
- Divergência oficial de pagamento bloqueia a oferta do checkout e preserva a evidência para conferência.
- Eventos sem prova financeira, como estorno/cancelamento notificados por webhook sem assinatura, são registrados para revisão e não revertem recebimentos automaticamente.

Tokens são consultados pelo hash e recuperados administrativamente por envelope cifrado. A página pública utiliza `no-store`, `no-referrer` e `noindex`; o service worker e o contexto autenticado não envolvem essa página. Logs de erro ocultam o token na rota. Consultas são limitadas por cobrança conhecida, tentativas com token desconhecido por IP e webhooks por um limitador independente. Assim o tráfego de polling pelo proxy não esgota o bucket dos callbacks, sem confiar em IP encaminhado pelo cliente.

## Rotina e recuperação

A rotina inicia em `src/server.ts`, executa ao subir e a cada minuto, sem sobreposição dentro do processo. Ela não roda ao importar o app nos testes. Múltiplos processos são protegidos por locks, claims e índices únicos no PostgreSQL.

A cada ciclo, processa até cinco eventos, até cinco criações persistidas e até dez mensalidades novas elegíveis. Os limites impedem trabalho sem controle; o próximo ciclo continua a fila. Saldos abaixo do mínimo são filtrados antes do limite, evitando bloqueio da fila. A geração automática cria somente a primeira cobrança da conta; renovar um checkout expirado exige solicitação manual.

Eventos são persistidos antes da resposta do webhook. Leases vencidos são recuperados; falhas transitórias têm backoff limitado e até oito tentativas por rodada. Uma reentrega legítima pode rearmar um evento esgotado após o intervalo de recuperação. O administrador também pode solicitar conciliação explicitamente. Uma criação interrompida após o claim vira incerta, sem repetir a chamada financeira.

O backend precisa permanecer em execução para a rotina funcionar. Hospedagem que suspende o processo ou executa apenas funções sob demanda precisa de um processo persistente para esta rotina. A recuperação cobre a janela até o vencimento; não faz disparo indiscriminado para cobranças antigas após uma longa indisponibilidade.

Desativar pausa novas criações, inclusive pendências ainda não enviadas ao provedor. Verificações e recebimentos de cobranças existentes continuam. Reativar permite recuperar pendências ainda válidas.

## Rotas

Prefixo `/api/v1`. Rotas administrativas exigem sessão, organização, área e perfil `ADMINISTRADOR`.

| Método e caminho | Uso |
|---|---|
| `GET/PATCH /financeiro/infinitepay/configuracao` | Consultar e salvar configuração da organização |
| `GET/POST /financeiro/mensalidades/:id/cobranca` | Consultar ou gerar/reutilizar cobrança |
| `POST /financeiro/cobrancas/:id/conciliar` | Solicitar consulta oficial por identificadores conhecidos |
| `GET /pagamentos/publico/:token` | Consultar cobrança individual sem dados do cliente |
| `POST /pagamentos/publico/:token/confirmar` | Persistir pistas do retorno e consultar oficialmente |
| `POST /pagamentos/webhook/infinitepay` | Receber sinal do provedor |

O corpo da confirmação/conciliação contém `order_nsu`, `transaction_nsu` e `slug`. Apenas `order_nsu` não permite consultar o provedor. Se webhook e retorno forem perdidos, os identificadores precisam ser recuperados na conta InfinitePay; não há busca automática de pagamento só pelo número interno da mensalidade.

Estornos e divergências exigem conferência na conta do proprietário. O MVP não oferece estorno pela API, reversão contábil automática ou um botão para ignorar evidência divergente.

## Implantação e reversão

1. Revisar o diff e realizar backup recuperável do banco de destino.
2. Aplicar a migration nova pelo processo autorizado do projeto. Esta entrega não executa migrations em desenvolvimento ou produção.
3. Publicar backend e frontend compatíveis; verificar a origem HTTPS já autorizada e o proxy existente.
4. Definir a única chave de encriptação nova, mantendo-a exclusiva do backend.
5. Configurar a conta pela aba InfinitePay, inicialmente sem geração automática.
6. Homologar uma cobrança controlada com autorização própria para movimentação real; conferir recebimento, webhook e retorno.
7. Habilitar geração automática com antecedência de um ou dois dias após a homologação.

A reversão operacional consiste em desativar novas cobranças e preservar banco, credenciais e processamento dos recebimentos em curso. O `down` da migration nova recusa remoção destrutiva de evidências financeiras. Não retornar a uma versão incompatível enquanto houver pagamentos pendentes.

## Reaproveitamento e evolução

Cliente HTTP, validação de URLs, consulta oficial e envelope AES-GCM foram adaptados de `Novos-Projetos-SAAS/Lanchonete-Shirley-Backend`, referência `c89df7cdf10db694f00c7ac7d67a340b38c0109f`. O frontend reaproveita a política de links/retorno da Shirley, referência `9244126ba574e45b676259fc7315439ac660922c`, com adaptação ao financeiro deste projeto.

O contrato `PagamentoProvider` separa chamadas do provedor da baixa financeira. Uma integração futura pode implementar outro adaptador e normalizar suas provas oficiais. A configuração, as rotas e os estados atuais ainda são específicos da InfinitePay; o segundo provedor não está implementado.

Documentação oficial consultada: [Checkout InfinitePay](https://www.infinitepay.io/checkout-documentacao).
