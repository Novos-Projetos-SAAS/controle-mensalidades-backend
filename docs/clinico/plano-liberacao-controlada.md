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
