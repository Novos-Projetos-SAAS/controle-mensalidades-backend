# Plano operacional do módulo clínico

Este documento prepara uma futura homologação controlada. Não autoriza a montagem nem a publicação das rotas clínicas. A API v1 deve continuar sem montar `sessoesClinicasRoutes`, e o middleware `ACESSO_CLINICO_NAO_CONFIGURADO` deve permanecer ativo até uma decisão posterior explícita.

## Estado observado no workspace

- A migration 061 e os triggers 058/061 foram exercitados no banco exclusivo de testes. Nenhuma migration foi aplicada em produção.
- A suíte automatizada, incluindo testes PostgreSQL de timeout, auditoria e concorrência, deve ser aprovada antes de cada homologação.
- `.env` e `.env.test` locais usam `sslmode=require` e `DB_SSL=true`. O código transforma a URL em `sslmode=verify-full` e não combina a URL com um objeto `ssl` que a possa sobrescrever.
- A verificação de privilégios executada no banco de testes retornou: credencial não é superuser, mas é dona da tabela de histórico e possui `TRUNCATE`, `CREATE` no schema e `CREATE` no banco. Isso descreve somente a credencial de teste observada; não comprova o estado de produção.
- O banco de teste não comprova disponibilidade de backups, recuperação, retenção, RPO/RTO ou privilégios do Neon de homologação/produção.

## Timeouts PostgreSQL

Os limites configuráveis são aplicados com `set_config(..., true)` dentro de cada transação clínica. O terceiro argumento `true` limita a mudança à transação e evita que uma conexão reutilizada pelo pool herde o valor.

| Variável                                  |    Padrão | Efeito                                                           |
| ----------------------------------------- | --------: | ---------------------------------------------------------------- |
| `CLINICAL_DB_LOCK_TIMEOUT_MS`             |  3.000 ms | Aborta uma aquisição de lock que exceda o limite.                |
| `CLINICAL_DB_STATEMENT_TIMEOUT_MS`        | 15.000 ms | Aborta um statement que exceda o limite.                         |
| `CLINICAL_DB_IDLE_TRANSACTION_TIMEOUT_MS` | 30.000 ms | Encerra uma sessão que permaneça ociosa dentro de uma transação. |
| `DATABASE_POOL_ACQUIRE_TIMEOUT_MS`        |  5.000 ms | Limita a espera por uma conexão do pool Knex.                    |

O schema Zod restringe os intervalos, exige `lock_timeout < statement_timeout` e `idle_in_transaction_session_timeout > statement_timeout`. O statement timeout é por statement; não é um limite total para a duração de uma transação que execute vários statements. O idle timeout encerra a conexão PostgreSQL se um processo ficar parado com a transação aberta. Valores iniciais precisam ser validados com carga e latência reais do Neon e do serviço.

Não há retentativa automática de operação clínica. Uma falha de timeout, deadlock ou conexão aborta a transação; o cliente recebe um erro seguro e deve seguir o procedimento operacional da aplicação.

### Classificação de erros

| Origem                                         | Resposta/código seguro            | Observação                                                                                            |
| ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SQLSTATE `25P03`                               | 503 `TRANSACAO_BANCO_EXPIRADA`    | Transação encerrada por permanecer ociosa.                                                            |
| SQLSTATE `57014`                               | 503 `CONSULTA_BANCO_INTERROMPIDA` | A classe inclui cancelamento e statement timeout; não se afirma que todo cancelamento foi um timeout. |
| SQLSTATE `55P03`                               | 503 `BANCO_DADOS_OCUPADO`         | Lock não disponível/espera de lock expirada.                                                          |
| SQLSTATE `40P01`                               | 503 `CONFLITO_TRANSACIONAL_BANCO` | Deadlock; sem retry automático.                                                                       |
| Classe SQLSTATE `08`, `57P01`–`57P03`, `53300` | 503 `BANCO_DADOS_INDISPONIVEL`    | Conexão/servidor indisponível ou limite de conexões.                                                  |
| `KnexTimeoutError`                             | 503 `POOL_BANCO_TIMEOUT`          | A conexão não foi obtida dentro do limite do pool.                                                    |
| Outro SQLSTATE válido                          | 500 `ERRO_BANCO_DADOS`            | Não é rotulado incorretamente como timeout; mensagem e SQL do driver não são retornados.              |

O log operacional mantém categoria, SQLSTATE quando disponível, rota sem query string e `requestId`. Não registra mensagem, stack, SQL, parâmetros ou conteúdo clínico de erros PostgreSQL.

## SSL PostgreSQL e Neon

O aviso do teste vinha do `pg-connection-string` 2.14.0 (`pg` 8.23.0): `require`, `prefer` e `verify-ca` têm comportamento transitório de `verify-full` nessa versão e a biblioteca avisa que isso mudará na major seguinte. O código normaliza modos com TLS para `verify-full`, que valida cadeia de certificados e hostname. O modo explícito `sslmode=disable` só é preservado em desenvolvimento/teste quando SSL não foi exigido; configuração de produção sempre exige `verify-full`.

O `ssl` inline do driver não é passado junto com `connectionString`; o node-postgres documenta que parâmetros SSL da URL podem substituir o objeto SSL. `sslrootcert` e outros parâmetros presentes na URL são preservados pela normalização. Certificados privados ou cadeias específicas precisam ser validados no ambiente-alvo; não foram inventados certificados nem alteradas URLs reais.

Referências: [documentação de conexão Neon](https://neon.com/docs/connect/connect-from-any-app), [SSL do node-postgres](https://node-postgres.com/features/ssl) e [modos SSL do PostgreSQL](https://www.postgresql.org/docs/current/libpq-ssl.html).

## Segregação de privilégios

Não foi possível verificar roles ou grants de homologação/produção. Nenhum `GRANT`, `REVOKE` ou criação de role foi executado. Proposta para a equipe responsável pelo Neon:

### Role de runtime

- Não deve ser superuser, dono do banco/schema/tabelas/funções nem membro da role de migrations.
- Deve ter `CONNECT` no banco e `USAGE` no schema da aplicação.
- Deve receber somente `SELECT`, `INSERT`, `UPDATE` e `DELETE` necessários por tabela, após revisão das consultas do backend. Não conceder DML em massa sem essa matriz.
- Para `historico_correcoes_sessoes_clinicas`, limitar a `SELECT` e `INSERT`; não conceder `UPDATE`, `DELETE` ou `TRUNCATE`.
- Não deve ter `CREATE` no schema/banco, propriedade de objetos, `ALTER`, `DROP`, criação/remoção de triggers ou alteração da função de imutabilidade.
- Conceder apenas `USAGE`/`SELECT` nas sequences efetivamente usadas.

### Role de migrations

- Credencial distinta, usada somente por job controlado de migrations e nunca pelo processo HTTP.
- Deve possuir ou receber as permissões estruturais necessárias para schema, tabelas, índices, triggers e funções.
- Armazenar a credencial no secret manager da hospedagem; não colocá-la em `.env` commitado, log ou variável disponível ao runtime.
- Configurar `DATABASE_URL_MIGRATIONS` separadamente. O `knexfile.ts` exige essa variável em `NODE_ENV=production`; runtime continua lendo apenas `DATABASE_URL`.

Antes de aplicar grants, produzir uma matriz de consultas por tabela e validar uma cópia/branch de homologação. A credencial de teste observada é dona da tabela clínica, logo os testes de trigger não demonstram resistência a um dono/superuser que desabilite triggers.

## Migration 061: revisão e procedimento de homologação

A migration 061 adiciona `BEFORE TRUNCATE` e reutiliza `impedir_alteracao_historico_correcoes`, criada pela migration 058. A migration não remove nem altera os triggers de `UPDATE`/`DELETE`. O teste de migração usa schema isolado, confirma que `up` bloqueia `TRUNCATE`, que `down` remove somente o trigger novo e que `UPDATE`/`DELETE` continuam bloqueados; toda a fixture sofre rollback.

### Pré-verificações

- [ ] Confirmar branch/projeto/endpoint de Neon e ambiente **homologação** usando a tela administrativa, sem imprimir a connection string.
- [ ] Confirmar backup restaurável e responsável de plantão.
- [ ] Confirmar que migrations até 058, incluindo a função de imutabilidade, foram aplicadas.
- [ ] Confirmar `DATABASE_URL_MIGRATIONS` com role separada e TLS `verify-full`.
- [ ] Confirmar ausência de operação de escrita clínica durante a janela.
- [ ] Registrar versão do código, horário, aprovador e plano de interrupção.

### Aplicação e verificação

1. Executar `npm run migrate:latest` por job aprovado apontado exclusivamente ao segredo de homologação. Para a configuração de migrations de produção, o código agora exige `DATABASE_URL_MIGRATIONS`; a homologação deve usar sua própria credencial e nunca a URL de produção.
2. Consultar `knex_migrations` e confirmar a migration 061.
3. Consultar `pg_trigger`/`pg_get_triggerdef` para confirmar `tg_bloquear_alteracao_historico_correcoes` (`BEFORE UPDATE OR DELETE`) e `tg_bloquear_truncate_historico_correcoes` (`BEFORE TRUNCATE`).
4. Executar os testes automatizados na branch de homologação. Não executar `TRUNCATE` manualmente fora de transação de teste descartável.
5. Revisar logs de aplicação para confirmar que erros operacionais contêm somente categoria, SQLSTATE, caminho sem query e `requestId`.

### Falha e reversão

- A criação de trigger é DDL transacional em PostgreSQL; se a migration falhar, interromper a janela e verificar a tabela de migrations e o catálogo antes de qualquer nova tentativa.
- Se a aplicação apresentar problema, interromper o rollout da aplicação e manter ambos os triggers. A reversão normal é voltar a versão da aplicação, sem reverter a migration 061.
- O `down` de 061 remove a barreira contra `TRUNCATE`. Só considerar essa reversão com aprovação de segurança/DBA, janela sem escrita clínica e controles compensatórios efetivos de privilégio; não executar como rollback padrão.
- Em qualquer divergência de trigger, pausar a homologação, preservar logs sem dados clínicos e acionar o responsável pelo banco. Não corrigir com `DISABLE TRIGGER`.

## Backup, retenção e recuperação

O código mantém soft delete em sessões e vínculo para preservar titularidade; o histórico específico registra valores anteriores/novos e bloqueia `UPDATE`, `DELETE` e `TRUNCATE`. A suíte confirma essas regras no banco de testes. Isso não comprova backups, PITR, retenção ou restauração no Neon.

| Controle                                          | Estado    | Responsável/decisão                                                                     |
| ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| Responsável pelo backup clínico                   | Pendente  | Designar DBA/owner da hospedagem.                                                       |
| Frequência de backup/PITR                         | Pendente  | Definir com área de negócio e infraestrutura.                                           |
| Criptografia e proteção dos backups               | Pendente  | Confirmar criptografia em repouso e gestão de chaves no Neon.                           |
| Controle de acesso e trilha de acesso aos backups | Pendente  | Restringir a operadores nominados e auditar acessos.                                    |
| Procedimento de restauração isolada               | Pendente  | Documentar restauração para branch/ambiente separado.                                   |
| Teste periódico de recuperação                    | Pendente  | Definir frequência, evidência e responsável.                                            |
| RPO                                               | A definir | Aprovação administrativa/negócio.                                                       |
| RTO                                               | A definir | Aprovação administrativa/negócio.                                                       |
| Retenção legal/operacional                        | A definir | Não há política inferida ou configurada por esta etapa.                                 |
| Tratamento de dados clínicos restaurados          | Pendente  | Restringir acesso, registrar finalidade e impedir cópia para ambientes não autorizados. |

Não foram criados jobs de backup nem alterada retenção.

## Checklist de homologação

- [ ] Testes, TypeScript, lint e formatação aprovados no commit candidato.
- [ ] Migrations e triggers conferidos no banco de homologação.
- [ ] SSL `verify-full` confirmado por handshake no serviço de homologação.
- [ ] Role de runtime não é dona de tabelas e não pode executar `TRUNCATE`/DDL.
- [ ] Role de migrations separada e segredo não disponível ao runtime HTTP.
- [ ] Timeouts avaliados com carga, latência e limite de conexões do Neon.
- [ ] Backup, restauração, RPO e RTO aprovados e testados.
- [ ] Login, organização e área do profissional confirmados.
- [ ] Permissão clínica concedida explicitamente; perfil administrativo não concede acesso clínico.
- [ ] Prontuário próprio funciona; IDs de outros profissionais/áreas/organizações retornam negação/404 esperados.
- [ ] Revogação, rollback, auditoria e concorrência confirmados.
- [ ] Contratos HTTP e dados sensíveis em logs revisados.
- [ ] Critérios de parada e responsável por interromper a homologação nomeados.

Os itens acima permanecem pendentes até evidência registrada pela equipe do ambiente-alvo.

## Procedimento futuro de liberação controlada

1. Aprovar separadamente o escopo, profissionais/organizações participantes e duração da janela.
2. Preparar branch/ambiente isolado e confirmar secrets, SSL, roles, timeouts, backup e restauração.
3. Aplicar migrations aprovadas com a role de migrations e verificar catálogo/tabela de migrations.
4. Executar testes de fumaça em aplicação isolada, incluindo autorização e tentativa negada de acesso cruzado.
5. Confirmar auditoria transacional, ausência de conteúdo clínico nos logs e comportamento de timeout/rollback.
6. Só após uma decisão explícita posterior avaliar uma feature gate restrita; esta etapa não habilita nem monta as rotas.
7. Monitorar `requestId`, categorias de falha do banco, timeouts, deadlocks, pool e respostas 5xx sem coletar conteúdo clínico.
8. Interromper a participação se houver falha de autorização, auditoria, trigger, TLS, backup ou exposição em logs. Preferir reverter a aplicação mantendo as proteções de banco.

## Etapa 17.1 — evidências e fechamento operacional

Registro de 2026-11-08. O escopo foi limitado a alterações locais, diagnósticos de leitura no banco de teste e validações Bruno locais. Nenhuma conexão de homologação/produção foi selecionada; nenhum `GRANT`, `REVOKE`, migration, alteração de backup ou operação de restauração foi executada. As rotas clínicas seguem fora da API v1 e bloqueadas pelo middleware.

### Resultado das pendências

| Controle                                  | Estado                                                                    | Evidência obtida                                                                                                                                                                                                                                                                                            | Próxima ação e responsável sugerido                                                                                                  | Critério de aprovação / bloqueador                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role mínima de runtime                    | **REPROVADO no banco de teste**; **NÃO VERIFICADO em homologação**        | Diagnóstico somente leitura em `.env.test`, role `neondb_owner`, sem superuser; proprietária da tabela/função clínica; `CREATE` no schema e banco; `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` no histórico. Membership de migrations não foi verificado porque a role não foi identificada/configurada. | DBA/administrador Neon deve criar ou selecionar role de runtime e role de migrations separada.                                       | Rodar com a credencial de runtime real em homologação; comprovar ausência de ownership, superuser, membership de migrations, `CREATE`, `UPDATE`, `DELETE` e `TRUNCATE`; triggers devem estar `O` ou `A`. |
| Handshake TLS                             | **APROVADO somente no banco de teste**; **NÃO VERIFICADO em homologação** | Handshake real em `.env.test`, `verify-full`, certificado autorizado, hostname validado, TLS 1.3 / `TLS_AES_256_GCM_SHA384`; nenhum SQL executado.                                                                                                                                                          | Administrador Neon fornece identificação do endpoint de homologação; operador confere host/database na console e roda o diagnóstico. | Handshake real com credencial de runtime de homologação, cadeia autorizada, hostname validado e `verify-full`. Teste unitário sozinho não satisfaz o critério.                                           |
| Backup/PITR e recuperação no projeto Neon | **NÃO VERIFICADO**                                                        | A documentação pública da Neon descreve Instant Restore/PITR dentro da janela de histórico e snapshots com restauração para branch; o projeto, conta, plano, retenção, snapshots e permissões deste workspace não foram inspecionados.                                                                      | Administrador Neon/DBA e responsável de negócio devem registrar o que está habilitado no projeto e realizar um exercício isolado.    | Evidência de configuração/último ponto disponível, restauração em branch isolada, integridade validada, controle de acesso e resultado de exercício aprovado.                                            |
| RPO/RTO                                   | **PENDENTE de decisão**                                                   | Dependências e alternativas estão abaixo; nenhum valor foi aprovado.                                                                                                                                                                                                                                        | Responsável de negócio, com DBA e responsável de continuidade.                                                                       | Aprovação registrada, compatível com retenção/preço do plano, cobertura de plantão e resultado do teste de recuperação.                                                                                  |
| Arquivos YAML Bruno                       | **APROVADO após correção**                                                | Bruno CLI 4.3.0: zero arquivos ignorados após remover U+200B dos três arquivos reproduzidos.                                                                                                                                                                                                                | Responsável da coleção Bruno deve manter validação antes dos testes de API.                                                          | CLI deve continuar sem `Skipping invalid file`; coleções clínicas passam com fixtures de teste. A afirmação anterior de quatro arquivos não se reproduziu nesta cópia: foram listados três.              |

### Matriz recomendada de permissões

Esta é uma matriz de princípio, a aplicar somente após inventário completo das consultas e revisão do DBA. Não é um script de grants nem uma confirmação dos grants existentes.

| Objeto/tabela                                             | Runtime HTTP                                                                                                                                                | Role de migrations                                                                | Observação                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Banco da aplicação                                        | `CONNECT`; sem `CREATE`                                                                                                                                     | `CONNECT`; `CREATE` no banco só se o processo de provisionamento realmente exigir | Criar banco/projeto é responsabilidade de provisionamento, não do job de migrations comum.                     |
| Schema da aplicação                                       | `USAGE`; sem `CREATE`                                                                                                                                       | `USAGE` e `CREATE` durante migrations controladas                                 | Runtime não deve criar tabelas, funções, schemas, índices ou triggers.                                         |
| `sessoes_clinicas`                                        | `SELECT`, `INSERT`, `UPDATE` estritamente necessários; sem `DELETE`/`TRUNCATE`                                                                              | DDL/DML de migration sob janela aprovada                                          | Soft delete e correção preservam trilha; não conceder `TRUNCATE`. Revisar permissões por coluna quando viável. |
| `historico_correcoes_sessoes_clinicas`                    | `SELECT`, `INSERT`; sem `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER` ou ownership                                                                              | Alterações estruturais apenas pelo job/owner de migrations, com janela e revisão  | Os triggers 058/061 são defesa adicional; não substituem privilégios mínimos.                                  |
| `profissionais_areas`                                     | `SELECT` e atualização estritamente necessária do indicador de autorização clínica; demais DML somente conforme outros fluxos administrativos inventariados | DDL controlada                                                                    | Não conceder permissões amplas de tabela sem revisar os endpoints que mantêm vínculos e áreas.                 |
| `registros_auditoria`                                     | `INSERT`; `SELECT` somente se uma rota aprovada realmente consultar registros; sem `UPDATE`/`DELETE`                                                        | DDL controlada                                                                    | Escritas de auditoria ocorrem na mesma transação da operação clínica.                                          |
| `knex_migrations`                                         | Sem acesso necessário para o processo HTTP                                                                                                                  | `SELECT`/`INSERT`/`UPDATE`/`DELETE` requeridos pelo Knex e ownership controlado   | A credencial é disponibilizada apenas ao job de migrations.                                                    |
| Demais tabelas da aplicação                               | DML mínimo por tabela/coluna após inventário de repositórios e fluxos                                                                                       | DDL/DML estrutural sob job controlado                                             | Evitar `GRANT ALL ON ALL TABLES`; sequences recebem só `USAGE`/`SELECT` nas usadas.                            |
| Função `impedir_alteracao_historico_correcoes` e triggers | Sem ownership, `CREATE OR REPLACE`, `ALTER`, `DROP` ou permissão de desabilitar trigger                                                                     | Owner ou role de migrations controlada                                            | Runtime não deve poder substituir a função nem remover/desabilitar os triggers.                                |

O runtime deve ser uma role sem `SUPERUSER`, ownership dos objetos protegidos, membership/`SET ROLE` para a role de migrations, `CREATEROLE`, `BYPASSRLS` ou permissões de replicação. A matriz final deve confirmar também sequences, funções e qualquer privilégio concedido via `PUBLIC` ou roles herdadas.

### Diagnósticos somente leitura

Os comandos de teste abaixo selecionam explicitamente `.env.test`, exigem `AMBIENTE_BANCO=teste` e leem exclusivamente `DATABASE_URL_TEST`:

```powershell
npm run diagnostico:clinico:privilegios:test
npm run diagnostico:clinico:tls:test
```

O diagnóstico PostgreSQL executa `BEGIN READ ONLY`, consultas a `pg_roles`, `pg_class`, `pg_proc`, `pg_trigger` e funções `has_*_privilege`/`pg_has_role`, depois encerra a transação. Não emite DDL/DML, não lê linhas clínicas e não exibe connection string. Quando `DIAGNOSTIC_MIGRATIONS_ROLE` não for fornecida, membership dessa role fica `NÃO VERIFICADO`, não presumida como ausente. Triggers em modo `R` não contam como ativos para sessões normais; `O` e `A` contam.

O diagnóstico TLS conecta com `verify-full`, valida a autorização do certificado e o hostname pelo driver TLS e encerra a conexão sem executar SQL. Erros são reduzidos a categorias; mensagem do driver, URL, host, certificado e credenciais não são impressos.

Para homologação, não existe comando que selecione endpoint automaticamente. O operador deve obter a connection string da role **runtime** pelo secret manager e conferir o host/database na console Neon. Em sessão `NODE_ENV` diferente de `production`, fornecer `DIAGNOSTIC_DATABASE_URL`, `DIAGNOSTIC_EXPECTED_HOST` e `DIAGNOSTIC_EXPECTED_DATABASE` sem imprimir valores e executar manualmente:

```powershell
node --import tsx src/diagnostics/postgres-clinico.ts --target=homologacao --confirm=homologacao
node --import tsx src/diagnostics/tls-clinico.ts --target=homologacao --confirm=homologacao
```

Os dois scripts recusam target `production`, recusam `NODE_ENV=production`, exigem confirmação explícita e validam o host e banco informados contra a URL sem mostrá-los. Produção não foi nem será selecionada automaticamente.

### Backup, restauração e integridade

Neon documenta Instant Restore/PITR dentro da janela de histórico configurada. A página oficial de branching, atualizada em 01/09/2026, informa defaults de 6 horas no plano Free e 1 dia nos planos pagos; o máximo configurável é 7 dias em Launch e 30 dias em Scale, com aumento de armazenamento conforme a janela cresce. O artigo oficial de snapshots publicado em 11/11/2025 descreve snapshots agendados diários, semanais ou mensais. Esses materiais descrevem o produto, mas não comprovam o plano, a disponibilidade atual, a janela, a agenda, a retenção, o custo ou as permissões da conta deste projeto; todos esses itens dependem de conferência pelo administrador Neon. Referências: [branching e recuperação Neon](https://neon.com/docs/introduction/branching), [snapshots Neon](https://neon.com/blog/three-ways-to-use-your-snapshots), [conexão segura](https://neon.com/docs/connect/connect-securely) e [pool de conexões](https://neon.com/docs/connect/connection-pooling).

Procedimento a aprovar e ensaiar em branch isolada:

1. DBA/administrador confirma o projeto e branch de origem na console; registra plano, janela de PITR habilitada, última execução de snapshot, agenda, retenção, custo e operadores autorizados. Não copiar a URL de conexão para evidências.
2. Responsável de negócio aprova o ponto de recuperação. On-call abre incidente, interrompe a janela clínica e preserva a branch original para investigação.
3. DBA cria uma branch de restauração a partir do timestamp/LSN ou snapshot aprovado, sem promover ou sobrescrever a branch original. A branch recebe compute/credenciais somente quando necessário e fica restrita ao grupo de recuperação.
4. Validar schema/migrations aplicadas, constraints/índices esperados, triggers de `UPDATE`/`DELETE` e `TRUNCATE`, contagens agregadas necessárias e conectividade com `verify-full`. Não exibir IDs nem conteúdo de prontuário em logs/evidências.
5. Fazer o teste de fumaça em ambiente sintético separado. Não exportar dados clínicos reais para laptop, `.env.test`, Bruno, issue ou ambiente de desenvolvimento. Dados restaurados permanecem na branch restrita.
6. Registrar ticket, aprovador, operadores, horário e ponto escolhido, branch de origem/restauração, janela de retenção observada, checks sem conteúdo clínico, duração real, falhas e decisão final. Segredos não fazem parte da evidência.
7. Se restauração ou integridade falhar, não promover a branch; manter a origem preservada, escalar DBA/Neon e incidente, comunicar o responsável de negócio e seguir o plano de continuidade aprovado. Excluir branch de análise somente após autorização e preservação das evidências operacionais necessárias.

| Controle de recuperação                    | Estado                  | Responsável sugerido                  | Evidência que falta                                                                            |
| ------------------------------------------ | ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Owner de backup e on-call                  | **PENDENTE**            | DBA/administrador Neon e operações    | Nomes/escala e canal de incidente.                                                             |
| PITR, janela atual e custo                 | **NÃO VERIFICADO**      | Administrador Neon                    | Console/contrato com janela e cobrança efetivas no projeto.                                    |
| Snapshots/agenda e retenção                | **NÃO VERIFICADO**      | Administrador Neon                    | Snapshot disponível, última execução e política efetiva.                                       |
| Acesso, auditoria e criptografia de backup | **NÃO VERIFICADO**      | Segurança/administrador Neon          | Confirmação de controles aplicáveis a restore/snapshot no projeto e quem pode restaurar.       |
| Restauração isolada e validação            | **PENDENTE**            | DBA + operações + responsável clínico | Exercício em branch restrita, checks e duração observada.                                      |
| Cópia fora da conta/projeto Neon           | **PENDENTE de decisão** | Segurança/DBA + negócio               | Avaliar necessidade, destino aprovado, criptografia, retenção, custo e processo de eliminação. |

Nenhuma cópia, snapshot, mudança de PITR ou restauração foi criada por esta etapa.

### Opções para decisão de RPO/RTO

RPO é a perda máxima de dados aceita; RTO é o tempo máximo para restabelecer o serviço. Os números abaixo são **cenários para discussão**, não SLAs, garantias do Neon nem valores aprovados.

| Opção para decisão               | Alvo proposto                    | Dependências e custo/risco a avaliar                                                                                                                                                                                |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Essencial                        | RPO até 24 h; RTO até 1 dia útil | Confirmação de restore history suficiente, snapshots/retensão adequados, on-call em horário comercial e exercício de restauração. Pode não atender operação clínica contínua.                                       |
| Intermediária                    | RPO até 1 h; RTO até 4 h         | Janela PITR superior ao período de detecção/recuperação, alerta rápido, operador fora do horário comercial e restore drill cronometrado. História PITR e compute/branches podem gerar custo variável.               |
| Alta disponibilidade operacional | RPO até 15 min; RTO até 1 h      | Precisa validar suporte/limites do plano, detecção e plantão 24x7, automação de failover/recuperação, branches/compute disponíveis e teste recorrente. Maior custo e complexidade; não comprovado no sistema atual. |

Decisão pendente: responsável de negócio escolhe cenário e aprova formalmente após estimativa do DBA/Neon, segurança, cobertura de plantão e exercício. Se nenhum cenário for aprovado, mantém-se o bloqueio de homologação clínica.

### Bruno CLI: reparo e inventário

Versão executada: `@usebruno/cli 4.3.0`. A reprodução em `bruno run __codex_no_such_folder__` encontrou três arquivos ignorados, cada qual com um caractere invisível U+200B isolado após o documento YAML. O parser reportava `Implicit map keys need to be followed by map values`. Foram removidos apenas esses caracteres:

- `Clientes/Buscar por CPF.yml` (linha 23).
- `Clientes/teste.yml` (linha 15).
- `Módulos por área/Listar módulos de área de outra organização.yml` (linha 21).

A varredura desta cópia não reproduziu um quarto arquivo inválido. A correção não removeu requests, headers, variáveis, scripts nem assertions. O sentinel do Bruno CLI 4.3.0 carregou a coleção após as correções e reportou zero arquivos ignorados.

### RPO, TLS e privilégio: interpretação do resultado

O diagnóstico executado com `--target=test` comprova somente o endpoint de teste e a role que o acessou. Mesmo que retorne privilégio perigoso ou triggers ativos, não representa a role de runtime de homologação. A configuração de TLS e o handshake de teste também não comprovam o handshake do endpoint de homologação. Até haver diagnósticos e evidências do endpoint-alvo, o parecer permanece **PENDÊNCIAS ANTES DA HOMOLOGAÇÃO**.

### Execução final e contagens observadas

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run format:check`: aprovado.
- `npm test`: 473 testes aprovados, 0 reprovados, contra `.env.test`.
- Testes específicos de diagnóstico/configuração: 12/12 aprovados.
- `git diff --check`: aprovado; somente avisos de conversão LF/CRLF do Git.
- Bruno `Permissoes Clinicas`: 9 requests executados, 14/14 testes aprovados, 0 ignorados.
- Bruno `Vinculo Usuario Profissional`: 15 requests executados, 20/20 testes aprovados, 0 ignorados.
- Diagnóstico PostgreSQL: `REPROVADO` em `.env.test`: role `neondb_owner`, sem superuser, mas com `CREATEROLE`, `BYPASSRLS`, `REPLICATION`, `CREATE` em schema/banco, ownership da tabela/função e `UPDATE`/`DELETE`/`TRUNCATE` no histórico. Triggers 058/061 estão ativos (`O`); membership de migrations: `NÃO VERIFICADO`. Isso não descreve homologação/produção.
- Diagnóstico TLS: `APROVADO` no endpoint de teste (`verify-full`, hostname e certificado autorizados, TLS 1.3). Nenhuma conexão de homologação/produção foi feita.

A menção inicial a quatro YAML inválidos não se confirmou: a reprodução do CLI encontrou três arquivos. Após corrigi-los, o inventário Bruno informou zero ignorados.

## Etapa 17.2 — preparação local de evidências Neon

Em 08/11/2026, a preparação foi limitada a configuração, documentação e verificações locais. Nenhum endpoint de homologação foi acessado: a autorização explícita para conexão remota não foi concedida nesta etapa. Não foram criados projetos/branches/roles, alterados grants, executadas migrations ou modificadas políticas de backup.

A revisão da configuração encontrou pool Knex `min=2`/`max=10` por processo e timeout de aquisição padrão de 5 segundos, além de timeouts transacionais clínicos configuráveis. Foi adicionado `DATABASE_CONNECTION_TIMEOUT_MS` com default de 8 segundos e limites validados para limitar o tempo de estabelecimento de uma conexão PostgreSQL. Esses valores descrevem defaults locais; overrides e limites efetivos de homologação precisam ser registrados pelo administrador.

A documentação pública Neon foi conferida para evitar usar referências antigas: o histórico de recuperação atualmente publicado depende de plano/configuração e snapshots têm disponibilidade/agenda que devem ser comprovadas na conta. A documentação não foi usada como evidência de configuração real.

Arquivos de acompanhamento criados:

- `docs/clinico/evidencias-homologacao-neon.md` — matriz dos 15 controles, ambiente/evidência/resultado/responsável/pendência/próxima ação.
- `docs/clinico/checklist-administrador-neon.md` — conferências executáveis pelo administrador do Neon sem expor secrets.
- `docs/clinico/criterios-entrada-homologacao.md` — critérios obrigatórios, bloqueios objetivos e modelo de decisão da futura Etapa 18.

O diagnóstico de teste anterior continua registrado separadamente: a role de teste foi reprovada por privilégios elevados e ownership de objetos clínicos; o handshake TLS foi aprovado somente para o endpoint de teste. Nenhum resultado foi atribuído a homologação. A matriz atual mantém roles, isolamento, migration 061, TLS, timeouts efetivos, backup/restore, logs e auditoria de homologação como `NÃO VERIFICADO` ou `PENDENTE`, conforme o controle. As rotas clínicas permanecem desmontadas e bloqueadas.

### Verificações executadas nesta preparação

- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm run format:check`: aprovado.
- `npm test`: 474 testes aprovados, 0 reprovados, usando `.env.test`.
- Prettier nos documentos clínicos alterados: aprovado.
- `git diff --check`: aprovado; Git emitiu somente avisos conhecidos de conversão LF/CRLF.
- Rotas: `sessoesClinicasRoutes` não aparece em `src/routes/v1/index.ts`; o middleware continua retornando `ACESSO_CLINICO_NAO_CONFIGURADO`.
- Nenhum diagnóstico remoto de homologação, migration ou teste destrutivo foi executado nesta etapa.
