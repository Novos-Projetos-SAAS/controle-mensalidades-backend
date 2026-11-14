# Checklist do administrador Neon para homologação clínica

Uso por Infra/DBA, Segurança e responsável clínico antes da futura preparação de homologação. Esta lista não autoriza conexão pelo Codex nem altera recursos Neon. O acesso remoto para diagnóstico só ocorre depois de autorização explícita do usuário para homologação.

## Regras para evidências

- Registrar data/hora UTC, responsável, projeto/branch por identificador não sensível e resultado.
- Não colar connection strings, tokens, senhas, certificados privados, IDs de pacientes ou conteúdo clínico em documentos, tickets, logs ou chats.
- Usar capturas redigidas ou exportações que mostrem configuração sem revelar secrets.
- Diferenciar `APROVADO`, `REPROVADO`, `PENDENTE` e `NÃO VERIFICADO`; não preencher lacunas com base em documentação pública.
- Se uma verificação depender de consulta remota, obter autorização explícita para o ambiente antes da conexão. Os diagnósticos são somente leitura, mas ainda estabelecem uma conexão remota.

## 1. Identificar e isolar o ambiente

- [ ] Confirmar organização, projeto, região, branch, database e compute corretos no painel Neon.
- [ ] Confirmar que produção e homologação usam projetos/endpoints distintos e secrets com escopos separados. Registrar IDs não sensíveis, nunca connection strings.
- [ ] Confirmar a linhagem da branch de homologação. Uma branch criada a partir de produção pode herdar dados clínicos reais no ponto de origem; não considerar a branch segura apenas por ser diferente.
- [ ] Confirmar uso de dados sintéticos na homologação. Não exportar nem copiar prontuários reais para desenvolvimento, `.env.test`, Bruno, laptop ou ferramentas externas.
- [ ] Confirmar quem tem acesso ao projeto/branch, quais operadores podem restaurar e como o acesso fica auditado.
- [ ] Registrar se a aplicação usa endpoint direto ou pooled. Identificar limite de conexões, compute e configurações do plano no painel, sem extrapolar limites publicados.

**Reprovar** se a separação de produção não puder ser demonstrada, se a linhagem dos dados for desconhecida ou se houver dado clínico real sem autorização e controles documentados.

## 2. Conferir runtime e migrations

- [ ] Identificar o nome da role runtime usada pelo processo HTTP e conferir `SUPERUSER`, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, `REPLICATION`, ownership e memberships/`SET ROLE`.
- [ ] Confirmar somente grants necessários para tabelas, sequences, funções e schema; revisar grants herdados e `PUBLIC`.
- [ ] Confirmar `SELECT`/`INSERT` necessários no histórico e ausência de `UPDATE`, `DELETE`, `TRUNCATE`, ownership, `TRIGGER` ou capacidade de alterar função/trigger de imutabilidade.
- [ ] Identificar role de migrations e conferir credencial diferente, DDL mínimo necessário e disponibilidade somente ao job de migrations. Confirmar que o processo HTTP não recebe esse secret.
- [ ] Confirmar que runtime não é membro nem pode assumir a role de migrations. URL diferente não basta; registrar identidade e privilégios efetivos das duas roles.
- [ ] Confirmar que migrations usam endpoint apropriado (normalmente direto quando a ferramenta exige sessão estável); runtime pode usar pooler depois de validar compatibilidade e limites.
- [ ] Conferir registro da migration `061_bloquear_truncate_historico_clinico` na tabela de migrations e estado ativo (`O` ou `A`) dos triggers para `UPDATE`/`DELETE` e `TRUNCATE`.

O diagnóstico local existente pode ser usado após a autorização para conectar ao alvo. Obter a credencial runtime pelo secret manager e injetá-la no processo de forma protegida. Não inserir o valor em argumento de linha de comando nem imprimi-lo.

```powershell
# DIAGNOSTIC_DATABASE_URL: secret runtime injetado pelo mecanismo aprovado.
# DIAGNOSTIC_EXPECTED_HOST e DIAGNOSTIC_EXPECTED_DATABASE: valores conferidos no painel.
# DIAGNOSTIC_MIGRATIONS_ROLE: somente nome da role, sem senha.
node --import tsx src/diagnostics/postgres-clinico.ts --target=homologacao --confirm=homologacao
```

O diagnóstico executa consultas dentro de `BEGIN READ ONLY`; não aplica migrations nem modifica privilégios. Ele não substitui a revisão completa de grants, roles herdadas, sequences, funções, `PUBLIC` e tabela `knex_migrations`. Guardar a saída redigida junto da matriz de evidências.

## 3. Validar conexão TLS

- [ ] Confirmar que a connection string do runtime usa o endpoint e database corretos, sem copiar a URL para a evidência.
- [ ] Confirmar que a aplicação de produção normaliza a conexão para `sslmode=verify-full` e não configura `rejectUnauthorized: false`.
- [ ] Injetar o secret runtime somente após autorização específica para homologação e executar o handshake:

```powershell
node --import tsx src/diagnostics/tls-clinico.ts --target=homologacao --confirm=homologacao
```

- [ ] Registrar `APROVADO` somente quando o diagnóstico confirmar socket TLS autorizado, certificado e hostname válidos. O script não executa SQL e omite detalhes sensíveis.
- [ ] Guardar separadamente o teste de configuração local e o handshake remoto. Um não substitui o outro.

## 4. Conferir pool, timeouts e capacidade

- [ ] Registrar overrides reais de `DATABASE_POOL_ACQUIRE_TIMEOUT_MS` e `DATABASE_CONNECTION_TIMEOUT_MS`; defaults atuais do código são 5 s e 8 s.
- [ ] Registrar `min=2` e `max=10` por processo Knex, total de instâncias/processos, uso de pooler e limite PostgreSQL do compute.
- [ ] Conferir timeouts clínicos efetivos por transação: `statement_timeout`, `lock_timeout` e `idle_in_transaction_session_timeout` (defaults locais: 15 s, 3 s e 30 s).
- [ ] Revisar parâmetros/limites Neon no painel e métricas de conexões/filas. Pooler pode ter limites por cliente, transação, usuário/database e compute; o limite agregado de clientes não é o limite de queries concorrentes.
- [ ] Validar com carga sintética aprovada, observando espera do pool, conexões rejeitadas, latência, timeouts e 5xx.

Registrar valores observados por configuração e ambiente. Não aumentar compute, mudar endpoint ou alterar plano durante esta checagem.

## 5. Verificar backup, snapshots e recuperação

- [ ] No painel, identificar plano atual, janela de histórico configurada, ponto mais antigo disponível para restore e custo/impacto estimado.
- [ ] Na área Backup & Restore, confirmar se snapshots estão disponíveis para o projeto, frequência/agendamento efetivo, último snapshot, retenção, expiração e operador autorizado.
- [ ] Consultar limites e cobrança atuais do plano no painel/contrato. A documentação pública descreve capacidades, mas não prova a configuração desta conta.
- [ ] Nomear quem pode solicitar, aprovar e executar restauração; verificar trilha de auditoria e controle de acesso.
- [ ] Planejar exercício de restauração em branch isolada e restrita, com aprovação de Segurança e negócio. Não promover, sobrescrever ou excluir a origem.
- [ ] Se o ponto restaurado contiver dados clínicos reais, mantê-lo no perímetro autorizado, limitar operadores e registrar finalidade/acesso. Não copiar dados para desenvolvimento ou equipamento local.
- [ ] Definir checks de integridade que não exponham conteúdo: migration/version table, schema, constraints/índices, triggers, conectividade TLS e contagens agregadas aprovadas.
- [ ] Registrar duração observada, ponto escolhido, resultado, falhas, custo, aprovadores e plano de limpeza da branch após aprovação.

A documentação Neon informa que a janela de histórico varia por plano e configuração, e que ampliá-la pode aumentar o custo de armazenamento. O painel do projeto é a evidência. [Branching e recuperação Neon](https://neon.com/docs/introduction/branching) · [Snapshots Neon](https://neon.com/blog/three-ways-to-use-your-snapshots)

## 6. Aprovar RPO/RTO e registrar resultado

- [ ] Responsável de negócio escolhe e aprova RPO (perda de dados tolerável) e RTO (tempo máximo de restabelecimento) por escrito.
- [ ] DBA confirma que janela, snapshots, permissões e custo podem suportar o objetivo escolhido.
- [ ] Operações executa e cronometra o exercício de recuperação; responsável clínico valida impacto e limites de acesso aos dados.
- [ ] Atualizar `docs/clinico/evidencias-homologacao-neon.md` com estado, evidência, responsável, pendência e próxima ação.
- [ ] Registrar decisão como aprovada ou reprovada com ticket, data e aprovadores. A decisão pertence ao responsável do projeto.

RPO/RTO permanecem `PENDENTE` enquanto não houver decisão formal e exercício compatível. Os cenários indicativos estão em [plano-liberacao-controlada.md](plano-liberacao-controlada.md); não são garantias nem SLAs.
