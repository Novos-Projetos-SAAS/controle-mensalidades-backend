# Reconciliação de migrations — InfinitePay e prontuário

## Auditoria em 25/11/2026

Foram verificadas as 6 branches do backend e as 8 do frontend.
O frontend não contém migrations Knex/SQL.

Verificações **somente leitura** no Neon:

| Projeto | Última migration no `knex_migrations` |
|---|---|
| `mensalidades-test` | `20261121130000_066_preparar_criptografia_cpf.js` |
| `mensalidades-desenv` | `20261125120000_067_infinitepay_cobrancas.js` |

A migration `067` original **foi localizada** na branch
`codex/infinitepay-integration` e copiada com conteúdo integral e
idêntico para as quatro branches clínicas; o arquivo da InfinitePay
não foi alterado.

As migrations clínicas `068` e `069` ainda não constam nos ledgers dos
dois projetos; seus timestamps foram reorganizados **antes de qualquer
aplicação em Neon**, para ordenar as quatro migrations:

```
20261125120000_067_infinitepay_cobrancas.js
20261125121000_068_documentos_clinicos_versionados.js
20261125122000_069_vinculos_clinicos_pacientes.js
20261125130000_070_campos_evolucao_fisioterapia.js
```

A antiga `20261122170000_067_campos_evolucao_fisioterapia.js` foi
substituída por `070`. Os SQLs de `068`, `069` e `070`
não foram alterados; apenas nomes e caminhos foram reorganizados.
O Knex ordena por **nome completo do arquivo (timestamp inicial)**.

**Atenção:** `main` do backend ainda **não contém** a migration
`067`, pois a integração de pagamentos continua em branch de outro
desenvolvedor. Os PRs de prontuário são drafts. Nenhum banco Neon
foi alterado por este trabalho. O checkout reconciliado não autoriza
habilitar a API clínica sem homologação.

## Checkout para verificação

```powershell
git fetch origin
git switch feat/prontuario-pacientes-vinculados-20261123
git pull --ff-only origin feat/prontuario-pacientes-vinculados-20261123
npm ci
npm run test:migrations:preflight
```

Para comparar ledger/arquivos em banco explicitamente configurado,
sem gravar:

```powershell
$env:NODE_ENV = "development"
npm run migrations:preflight -- --env development
```

O CLI mostra migrations já aplicadas mas ausentes, números duplicados e
arquivos pendentes. Não executa DDL, `migrate:latest` nem
`rollback`. Em desenvolvimento, utiliza `DATABASE_URL_MIGRATIONS`
ou `DATABASE_URL` do `.env`; confira o destino antes de rodar.

## Critérios de liberação no Neon

1. Confirmar com o responsável da InfinitePay que a `067` publicada é
   idêntica àquela aplicada no `mensalidades-desenv`. Uma cópia de
   arquivo no Git não comprova isoladamente o SQL executado.
2. Confirmar CI completa em PostgreSQL descartável com a ordem
   `067 → 068 → 069 → 070`, sem divergências no ledger.
3. Preparar branch Neon isolada sem dados reais, backup/restauração,
   auditoria e privilégios segregados de runtime e migration.
4. Aplicar migrations via Knex somente após change aprovado e escolha
   explícita do banco/branch. Não rodar automaticamente em
   `mensalidades-desenv` ou `mensalidades-test`.
5. Integrar PRs encadeadas de modo controlado e revisar o efeito
   de colocar a `067` em `main` no deploy dos dois projetos.

**Não editar `knex_migrations`, criar placeholders, alterar o SQL da
InfinitePay ou executar rollback de cobranças ou documentos clínicos.**
