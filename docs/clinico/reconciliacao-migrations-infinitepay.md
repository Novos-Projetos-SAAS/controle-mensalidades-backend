# Reconciliação de migrations — Clínica × InfinitePay

## Estado identificado em 25/11/2026

Consultas **somente leitura** aos projetos Neon:

| Projeto | Última migration registrada |
|---|---|
| mensalidades-test | `20261121130000_066_preparar_criptografia_cpf.js` |
| mensalidades-desenv | `20261125120000_067_infinitepay_cobrancas.js` |

Na branch clínica, existem os arquivos:

- `20261125121000_068_documentos_clinicos_versionados.js`
- `20261125122000_069_vinculos_clinicos_pacientes.js`
- `20261125130000_070_campos_evolucao_fisioterapia.js`

A `070` substituiu a antiga `20261122170000_067_campos_evolucao_fisioterapia.js`
nas quatro branches clínicas empilhadas, sem modificar seu conteúdo.

**Bloqueio restante:** `20261125120000_067_infinitepay_cobrancas.js` está
registrada no ledger do `mensalidades-desenv`, porém o **arquivo original
ainda não foi publicado nas branches GitHub consultadas**, incluindo
`codex/infinitepay-integration` e `main`. Não recriar o arquivo nem
renomear a migration aplicada; não editar a tabela `knex_migrations`
para ocultar esta divergência.

A ordem lexicográfica esperada dos arquivos no checkout consolidado é:
`066 → 068 → 069 → 067 (InfinitePay, timestamp 20261125120000) → 070`.
**A ordenação do Knex segue o prefixo timestamp do nome, não o número
lógico entre underscores.** A ordem numérica visual não é a ordem de execução.
As mudanças `068` e `069` devem ser revisadas quanto às suas dependências
antes de usar essa árvore contra qualquer banco compartilhado.

## Próximo passo para o desenvolvedor InfinitePay

1. Publicar a migration **exatamente com o conteúdo original executado no
   mensalidades-desenv** e o nome
   `20261125120000_067_infinitepay_cobrancas.js`.
2. Conferir se a mudança de banco da InfinitePay é reversível somente sob
   condições aprovadas, e se a migração original não depende de alterações
   adicionais ainda não publicadas.
3. Incorporar esse arquivo de forma controlada à branch consolidada para
   testes. **Não copiar a API ou serviços InfinitePay em desenvolvimento
   sem coordenação com o responsável.**
4. Executar o preflight abaixo com a configuração correta e avaliar a
   lista de migrations pendentes antes de dar qualquer comando de migração.

## Comando de diagnóstico somente leitura

Na pasta backend atualizada:

```powershell
git switch feat/prontuario-pacientes-vinculados-20261123
git pull --ff-only origin feat/prontuario-pacientes-vinculados-20261123
npm ci

# Verifique manualmente que .env aponta para o banco pretendido.
$env:NODE_ENV = "development"
npm run migrations:preflight -- --env development
```

O comando consulta o banco configurado para migrations (prioridade
`DATABASE_URL_MIGRATIONS`, depois `DATABASE_URL`) e a tabela
`knex_migrations`, compara com os arquivos locais e lista:
- migrations registradas no banco que **não** existem no checkout;
- migrations no checkout ainda não registradas no banco;
- nomes de migrations com mesmo número lógico.

Ele **não executa qualquer escrita, migração ou rollback**. Código de
saída `2` indica divergência bloqueante no ledger/checkout.
Para `NODE_ENV=test`, ele usa somente `DATABASE_URL_TEST` e requer
`AMBIENTE_BANCO=teste`.

### O que não fazer

- **Não** executar `migrate:latest` da branch clínica no
  `mensalidades-desenv` antes da recuperação do arquivo InfinitePay.
- **Não** forçar `migrate:rollback`, editar `knex_migrations` ou adicionar
  arquivo `067` falso/vazio para satisfazer o Knex.
- **Não** aplicar migrations clínicas no Neon compartilhado sem aprovação
  do plano clínico, avaliação de papéis (runtime/migration), backups e
  homologação numa branch Neon isolada, com dados sintéticos.
- **Não** mexer na migration aplicada da InfinitePay, que pertence a outro
  desenvolvedor.

## Próxima verificação de integridade

Após receber o arquivo original do responsável, comparar
`git diff`, nomes das migrations e estrutura real do banco; rodar
`npm run migrations:preflight` (saída sem registros faltantes).
Somente depois preparar a execução do Knex por um job Node isolado e
homologado, jamais por SQL parcial copiado da migration.
