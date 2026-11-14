# Critérios de entrada para homologação clínica controlada

Este documento define o que precisa estar comprovado antes de autorizar a preparação de uma futura Etapa 18. A decisão final é do responsável pelo projeto. Aprovar a entrada não monta rotas, não publica endpoints e não libera prontuários.

**Estado atual em 08/11/2026: MANTER HOMOLOGAÇÃO BLOQUEADA.** Não há evidências do ambiente Neon de homologação; o banco de teste apresentou role de privilégios elevados e não pode ser tratado como evidência de homologação.

## Critérios obrigatórios

Todos os itens devem estar `APROVADO` para o ambiente candidato, com evidência datada e responsável. `PENDENTE`, `REPROVADO` ou `NÃO VERIFICADO` em qualquer item obrigatório bloqueia a entrada.

| Área                | Critério de aprovação                                                                                                                                                                      | Bloqueio objetivo                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Ambiente e dados    | Projeto/endpoint de homologação identificado e separado de produção; linhagem conhecida; dados sintéticos; acessos e secrets segregados.                                                   | Ambiente compartilhado/ambíguo, branch herdando dados reais sem proteção aprovada ou origem desconhecida.     |
| Runtime             | Identidade confirmada; sem superuser, `CREATEROLE`, `CREATEDB`, `BYPASSRLS`, replicação indevida, ownership protegido, `TRUNCATE`, grants de DDL ou membership/`SET ROLE` para migrations. | Qualquer privilégio estrutural perigoso ou role efetiva desconhecida.                                         |
| Migrations          | Identidade e credencial próprias; não disponíveis ao processo HTTP; privilégios restritos à execução controlada; migration 061 registrada no ambiente correto.                             | Mesma credencial, secret acessível ao runtime ou ledger/estado de migration não verificado.                   |
| Histórico clínico   | Runtime sem `UPDATE`, `DELETE` e `TRUNCATE` no histórico; ownership e capacidade de alterar função/triggers protegidos; triggers de `UPDATE`/`DELETE` e `TRUNCATE` ativos.                 | Trigger ausente/desabilitado ou role capaz de contornar imutabilidade.                                        |
| TLS                 | Handshake real do runtime em homologação confirmou `verify-full`, CA/certificado e hostname.                                                                                               | Apenas configuração local aprovada, handshake de outro ambiente ou falha/certificado/hostname não verificado. |
| Pool e timeouts     | Defaults/overrides de pool, timeout de conexão, aquisição, statement, lock e idle transaction registrados; limites/compute avaliados e carga sintética aprovada.                           | Valores efetivos desconhecidos, limites incompatíveis ou falhas sob carga.                                    |
| Recuperação         | Plano de backup/snapshot e janela reais verificados no painel; exercício isolado aprovado; integridade demonstrada sem exportar dados clínicos.                                            | Recurso presumido, restore não testado, acesso à restauração sem controle ou integridade duvidosa.            |
| Continuidade        | RPO e RTO aprovados por negócio, coerentes com capacidade observada e com teste de recuperação.                                                                                            | RPO/RTO sem decisão formal ou incompatíveis com o exercício.                                                  |
| Autorização clínica | Testes autorizados demonstram isolamento por profissional, área e organização, negação após revogação e comportamento de acesso negado.                                                    | Qualquer acesso cruzado, permissão implícita ou falha em revogação.                                           |
| Auditoria           | Escrita de auditoria atômica com a operação, reversão em rollback e integridade das trilhas verificadas no candidato.                                                                      | Operação clínica sem auditoria, trilha parcial ou rollback inconsistente.                                     |
| Logs e privacidade  | Logs, tracing, alertas e sinks revisados com dados sintéticos; sem conteúdo clínico, tokens ou connection strings; acessos e retenção definidos.                                           | Conteúdo clínico/segredo exposto ou sinks sem revisão.                                                        |
| Código e testes     | Typecheck, lint, formatação, suíte automatizada e contratos autorizados aprovados no candidato exato; Bruno sem arquivos ignorados.                                                        | Qualquer falha, evidência de outro commit ou teste omitido sem justificativa aprovada.                        |
| Bloqueio de rotas   | `sessoesClinicasRoutes` continua fora da API v1; `ACESSO_CLINICO_NAO_CONFIGURADO` segue ativo até etapa e decisão futuras.                                                                 | Rota montada, autenticação/autorização relaxada ou gate removido sem autorização específica.                  |
| Operação            | Escopo, duração, participantes, on-call, responsável de parada, monitoramento e procedimento de incidente nomeados.                                                                        | Sem responsável para interromper ou responder a incidente.                                                    |

## Melhorias recomendadas

Estas melhorias não substituem os critérios obrigatórios nem devem alterar infraestrutura sem aprovação própria:

- Exercitar alertas de conexões, timeouts, fila do pool, deadlocks e respostas 5xx com carga sintética.
- Revisar rotação de credenciais, trilha de acesso ao secret manager e remoção de secrets de jobs concluídos.
- Reavaliar tamanho do pool e endpoint pooled/direct com métricas do compute e comportamento transacional real.
- Programar exercícios periódicos de recuperação e revisão de responsáveis/contatos.
- Preparar runbook de rollback de aplicação que mantenha triggers e controles de banco intactos.

## Decisão administrativa

Preencher depois da revisão de todas as evidências:

```text
Projeto/branch identificado (sem secrets):
Versão/commit candidato:
Matriz de evidências revisada em:
Pendências obrigatórias restantes:
Responsável de negócio:
Responsável técnico/DBA:
Segurança/privacidade:
Data da decisão:
Ticket/registro da decisão:

Decisão (escolher uma):
[ ] AUTORIZAR PREPARAÇÃO DA HOMOLOGAÇÃO CONTROLADA
[ ] MANTER HOMOLOGAÇÃO BLOQUEADA

Justificativa e evidências referenciadas:
```

`AUTORIZAR PREPARAÇÃO DA HOMOLOGAÇÃO CONTROLADA` somente autoriza planejar e preparar o ambiente restrito conforme escopo aprovado. Não autoriza montar ou publicar rotas clínicas, expor endpoints, liberar prontuários, rodar migrations em produção ou alterar infraestrutura automaticamente. Qualquer execução remota precisa da autorização correspondente e de change aprovado.

Com um ou mais controles obrigatórios pendentes, reprovados ou não verificados, selecionar `MANTER HOMOLOGAÇÃO BLOQUEADA` e atribuir dono e prazo para cada ação.

## Evidências atuais

- Banco de teste: diagnóstico de privilégios reprovado para a role de teste; não representa a role de homologação.
- TLS de teste: handshake aprovado somente para o endpoint de teste; homologação não verificada.
- Código local: timeout de conexão PostgreSQL explícito com default de 8 s; timeouts e pool revisados em código, mas valores efetivos de homologação não verificados.
- Rotas clínicas: não montadas em `src/routes/v1/index.ts`; middleware de bloqueio permanece no módulo.
- Recuperação, RPO/RTO, roles efetivas, isolamento e logs de homologação: não verificados/pendentes.

Consultar [matriz de evidências](evidencias-homologacao-neon.md), [checklist do administrador Neon](checklist-administrador-neon.md) e [plano de liberação controlada](plano-liberacao-controlada.md).
