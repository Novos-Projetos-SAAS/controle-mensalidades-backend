# Prontuário persistido em PostgreSQL/Neon — homologação

## O que foi implementado

A área clínica pode usar as APIs do **backend Express**, que salvam os dados no **PostgreSQL**. Não se trata do arquivo de demonstração do Next.js.

- `POST /api/v1/documentos-clinicos`: cria anamnese ou rascunho de laudo e a versão inicial.
- `GET /api/v1/documentos-clinicos/:id`: lê registro e versões existentes no banco.
- `POST /api/v1/documentos-clinicos/:id/revisoes`: corrige, preservando versões anteriores.
- `POST /api/v1/documentos-clinicos/:id/finalizar`: finaliza sem assinatura digital.
- `POST /api/v1/sessoes-clinicas`: grava evolução e procedimentos executados na sessão.
- `GET /api/v1/sessoes-clinicas/:id`: reabre sessão persistida.
- `GET /api/v1/prontuario/pacientes/:id/historico`: linha do tempo.
- `GET /api/v1/prontuario/pacientes`: apenas pacientes vinculados ao fisioterapeuta.
- `POST /api/v1/vinculos-clinicos`: administrador concede autorização clínica.
- `POST /api/v1/vinculos-clinicos/:id/revogar`: administrador revoga autorização.

Os serviços já possuem transações, histórico, validação de autoria, segregação de organização/área, auditoria e vínculo explícito entre paciente e fisioterapeuta. **Dados reais de pacientes não estão autorizados.**

## Uma branch Neon isolada já está criada

Projeto: `mensalidades-test`  
Branch de homologação: `homologacao-prontuario-20261125`  
Branch ID: `br-dry-sunset-acg9bq38`  
Host direto: `ep-calm-leaf-acrljc08.sa-east-1.aws.neon.tech`  
Nome do banco: `neondb`

Essa branch foi criada a partir do estado de teste até a migration `066`.
Ela **ainda não possui** o esquema clínico (`068`, `069`, `070`) e
**não recebeu scripts de escrita** nesta implementação. Não use a
branch padrão de `mensalidades-test` ou `mensalidades-desenv`.

> Por ter sido derivada do banco de testes, confira a origem e a
> natureza sintética dos dados antes de utilizá-la. Se não forem
> exclusivamente fictícios, crie um banco completamente separado com
> conteúdo sintético.

## Como aplicar as migrations usando o Knex (passo obrigatório)

1. Em Neon, abra o projeto `mensalidades-test` e escolha
   **apenas** a branch `homologacao-prontuario-20261125`.
2. Copie sua URL de conexão **direta** (sem pooler) e guarde-a
   somente no `.env` local do backend. Nunca envie a URL no chat,
   nem a registre no Git ou em logs.
3. No backend:

```powershell
git fetch origin
git switch feat/prontuario-persistencia-postgres-homologacao-20261125
git pull --ff-only origin feat/prontuario-persistencia-postgres-homologacao-20261125
npm ci
```

Configure estas variáveis no `.env` **somente local**:

```dotenv
NODE_ENV=development
AMBIENTE_BANCO=homologacao
DB_SSL=true
DATABASE_URL=COLE_A_URL_DIRETA_DA_BRANCH_CLINICA
DATABASE_URL_MIGRATIONS=COLE_A_URL_DIRETA_DA_BRANCH_CLINICA
CLINICAL_HOMOLOGATION_ENABLED=true
CLINICAL_HOMOLOGATION_CONFIRMATION=SOMENTE_DADOS_FICTICIOS
CLINICAL_HOMOLOGATION_EXPECTED_HOST=ep-calm-leaf-acrljc08.sa-east-1.aws.neon.tech
CLINICAL_HOMOLOGATION_EXPECTED_DATABASE=neondb
```

**Atenção:** mantenha também as demais variáveis já requeridas pela
aplicação (JWT, CPF e outras). Não altere as chaves criptográficas se
houver dados previamente criptografados.

Para aplicar as migrations no **host explicitamente conferido**:

```powershell
npm run migrations:preflight -- --env development
npm run prontuario:migrate:homologacao
```

O comando de migração rejeita `NODE_ENV=production`, a ausência da
confirmação, hosts Neon diferentes, host de pooler, nome de banco
incorreto, `DB_SSL` não habilitado e migrações já aplicadas mas
ausentes do checkout. Ele usa o executor **original do Knex**, não
reescreve `knex_migrations` manualmente e não faz rollback.
Em branch Neon derivada da `066`, são previstas `067 → 068 → 069 → 070`.

## Como testar a persistência

Inicie o backend em desenvolvimento com as mesmas configurações:

```powershell
npm run dev
```

Em outro terminal, rode o frontend
`feat/prontuario-workspace-postgres-20261125` com `BACKEND_URL=http://localhost:3333`
e `npm run dev`. Acesse:

- `http://localhost:3000/prontuario-vinculos`: administrador autoriza um profissional a acessar um paciente inteiramente fictício. Esse profissional precisa ter conta de usuário ligada ao cadastro, área clínica e autorização clínica administrativa habilitadas.
- `http://localhost:3000/prontuario`: fisioterapeuta autenticado encontra os pacientes autorizados, preenche e salva a anamnese, evolução e laudo.
- Depois de salvar, atualize a página, feche o navegador e reabra o sistema. Os registros permanecem no **PostgreSQL**, com histórico de versões.

**Limitações:** este fluxo é somente de homologação, sem assinatura
profissional digital, sem dados reais, sem exportação oficial de laudos.
A rota em Vercel/produção segue 404 por definição; a API não é montada
em produção, independentemente das flags. A produção clínica depende de
revisão de segurança, privacidade, papéis do banco, backups/restauração,
auditoria e liberação específica.
