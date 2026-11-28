# Desenvolvimento do prontuário no Neon mensalidades-desenv

**Destino confirmado em 26/11/2026:** projeto Neon `mensalidades-desenv`,
branch padrão `production` **dentro desse projeto de desenvolvimento**,
PostgreSQL `neondb`, host DIRECT
`ep-lively-wildflower-ac3t3qcu.sa-east-1.aws.neon.tech`.

A migration `20261125120000_067_infinitepay_cobrancas.js` já consta no
`knex_migrations` deste banco. As migrations **068, 069 e 070 estão
pendentes**. Não executamos migrations na data desta documentação.

## Não é necessário hospedar a API para migrar o banco

Knex precisa de **Node.js com URL de conexão ao Neon**, não de um
servidor HTTP na internet. Pode executar o CLI na pasta do backend
localmente, com as credenciais de migration em arquivo `.env`
não versionado.

## Preparar o backend local

```powershell
git fetch origin
git switch feat/prontuario-persistencia-postgres-homologacao-20261125
git pull --ff-only origin feat/prontuario-persistencia-postgres-homologacao-20261125
npm ci
```

Variáveis necessárias no `.env` do **backend**:

```dotenv
NODE_ENV=development
AMBIENTE_BANCO=desenv
DB_SSL=true

# Copie do Neon a URL DIRECT do projeto mensalidades-desenv.
# Não compartilhe senha, host com segredo ou URL em tickets/logs/chats.
DATABASE_URL=postgresql://USUARIO:SENHA@ep-lively-wildflower-ac3t3qcu.sa-east-1.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_MIGRATIONS=postgresql://USUARIO_MIGRACAO:SENHA@ep-lively-wildflower-ac3t3qcu.sa-east-1.aws.neon.tech/neondb?sslmode=require

# Só habilite o clínico em desenvolvimento, com dados fictícios.
CLINICAL_HOMOLOGATION_ENABLED=true
CLINICAL_HOMOLOGATION_CONFIRMATION=SOMENTE_DADOS_FICTICIOS
CLINICAL_DESENV_MIGRATION_CONFIRMATION=APLICAR_PRONTUARIO_SOMENTE_DESENV
```

Preservar as demais chaves existentes no `.env` — especialmente JWT e
chaves de criptografia do CPF. Nunca enviar credenciais no frontend.

## Validar e aplicar as migrations apenas no desenv

**Antes**: conferir backup/restauração do banco e garantir que não há
dados clínicos reais no conjunto usado para testar. O nome
`production` é a branch padrão do projeto `mensalidades-desenv`;
não representa homologação isolada.

Primeiro executar comandos seguros de leitura:

```powershell
npm run test:migrations:preflight
npm run test:prontuario:migrate:desenv
npm run migrations:preflight -- --env development
```

Verificar que a saída não mostra migrations aplicadas sem arquivo
correspondente e que as **únicas pendentes são 068, 069 e 070**.

Depois da revisão e backup, executar deliberadamente:

```powershell
npm run prontuario:migrate:desenv
```

Esse comando:

- Rejeita outros bancos, host de pooler, outro projeto/branch Neon,
  `NODE_ENV=production`, `DB_SSL=false` e ausência de confirmação;
- Compara todo o ledger do Knex, exige 067 existente e não permite outras
  migrations pendentes além de 068/069/070;
- Executa somente as migrations clínicas pendentes pelo Knex original,
  sem editar manualmente o ledger;
- Confirma a presença das quatro migrations 067/068/069/070 no final.

## Testar a API e o frontend sem hospedagem

No backend: `npm run dev` (porta padrão 3333).
No frontend: `BACKEND_URL=http://localhost:3333` no `.env.local`,
`npm run dev` (porta padrão 3000), branch
`feat/prontuario-workspace-postgres-20261125`.

Acesse `/prontuario-vinculos` com administrador para conceder vínculo
a um paciente fictício e `/prontuario` com fisioterapeuta autorizado
para salvar e reabrir anamnese, evolução e laudo no PostgreSQL.
O simulador `/prontuario-demo` continua separado, sem tocar na API
clínica. O backend não monta as rotas clínicas em produção.

**Não publicar prontuários reais** nem alterar a política de
autorização até revisar LGPD, auditoria, backups, retenção e assinatura
profissional. Para usar o frontend pela internet sem manter o PC ligado,
será necessário hospedar o backend posteriormente.
