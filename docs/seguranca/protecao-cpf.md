# Proteção de CPF — fase 1 (clientes e profissionais)

**A implementação está preparada, mas a proteção ainda NÃO está ativa por padrão.**
O modo padrão continua legacy para manter compatibilidade com bancos sem a nova migration.
Enquanto houver valores na coluna antiga "cpf", um dump do banco AINDA expõe esses dados.

## Arquitetura

- A migration 066 é aditiva: cria cpf_cifrado (texto) e cpf_indice (HMAC hexadecimal) em clientes e profissionais, com índice único por organização; não remove dados existentes.
- AES-256-GCM cifra o CPF com nonce aleatório de 96 bits por registro, tag autenticada e AAD vinculado à organização, ID e tipo de entidade. Armazenamento versão v1.nonce.tag.cifra em Base64URL.
- Índice cego HMAC-SHA-256 usa OUTRA chave, com namespace separado para tipo de entidade + organização. Não usar SHA-256 sem chave: CPF pode ser enumerado.
- O backend decifra para o contrato HTTP autenticado e exclui campos cpf_cifrado/cpf_indice dos objetos retornados. Não expor CPF em logs ou auditorias.
- Busca completa por CPF usa HMAC, com igualdade por organização. Busca parcial de CPF é desativada em modos cifrados; nome, e-mail e telefone ainda podem ser pesquisados parcialmente.

## Segredos — APENAS no backend

- CPF_CRYPTO_MODE=legacy, transition ou strict.
- CPF_ENCRYPTION_KEY = chave aleatória de 32 bytes codificada em hexadecimal, 64 caracteres.
- CPF_LOOKUP_KEY = OUTRA chave aleatória de 32 bytes codificada em hexadecimal, 64 caracteres.
- Chaves devem ser diferentes e guardadas em cofre/KMS; nunca no banco, Git, frontend, logs, backups sem criptografia ou tickets.
- Para gerar uma chave localmente sem divulgar seu valor: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))". Execute duas vezes e guarde em local seguro. Não envie essas chaves no chat.
- A rotação das chaves não está automatizada. A perda da chave de cifra pode tornar os CPFs irrecuperáveis. Planejar backup seguro e versionamento antes da produção.

## Modos

| Modo | Leitura | Escrita | Uso |
|---|---|---|---|
| legacy (padrão) | cpf plaintext | cpf plaintext | Bancos antigos; INSEGURO contra dump |
| transition | cifra + fallback legado | cifra/HMAC; cpf antigo fica NULL | Migração isolada |
| strict | somente cifrados (recusa CPF legado) | cifra/HMAC; cpf antigo fica NULL | Após backfill verificado |

Os modos transition/strict exigem as duas chaves válidas na inicialização.
Não retornar ao modo legacy depois de criar valores cifrados: o código legado não consegue recuperar esses CPFs.

## Procedimento SOMENTE no banco exclusivo de testes

1. Confirme NODE_ENV=test, AMBIENTE_BANCO=teste e DATABASE_URL_TEST exclusivo, diferente de desenvolvimento e produção. Não reutilize chaves de produção e faça backup de teste. Suspenda requisições de escrita durante o backfill.
2. Configure na .env.test privada CPF_CRYPTO_MODE=transition e as duas chaves distintas de 64 caracteres hexadecimais.
3. Confira e aplique a migration 066 somente quando autorizado, no banco exclusivo: npm run migrate:status -- --env test ; npm run migrate:latest -- --env test.
4. Confira quantos CPFs legados ainda estão em claro: npm run cpf:verify:test (somente contagens; nunca imprime CPF).
5. Execute o backfill SOMENTE no banco exclusivo de testes: npm run cpf:backfill:test. O script exige dupla confirmação (--target=test e --confirm=CPF-TEST-ONLY), usa lotes transacionais de 100 registros e é retomável.
6. Confirme 0 registros legados com npm run cpf:verify:test, valide índices, leia e edite cadastros, busque CPF completo e teste CPF duplicado em diferentes organizações. O backfill também cobre registros soft-deleted.
7. Só então configure CPF_CRYPTO_MODE=strict no teste e reexecute testes de integração. Nunca habilitar strict sobre um banco que ainda contenha CPF plaintext.

O backfill aborta se CPF legado tiver tamanho não-11 ou se o dado cifrado existente divergir; não imprime o valor. CPFs legados com verificadores matemáticos inválidos são preservados criptografados para evitar perda silenciosa. A validação matemática permanece ativa nos novos cadastros de clientes.

## Fase final pendente ANTES da produção

- Implementar um corte separado que bloqueie escritas plaintext no PostgreSQL e remova a coluna "cpf" original e seus índices somente após verificar todos os tenants e trabalhadores atualizados.
- Não adicionar automaticamente a migration destrutiva ao migrate:latest: requer migração validada, plano de retorno e confirmação explícita.
- Revisar cópias antigas: backups, WAL, dumps, relatórios, logs SQL, réplicas, snapshots e exportações podem continuar com CPF em claro.
- Minimizar exibição: mascarar CPF nas listagens, expor documento completo apenas com permissão/necessidade, auditar o acesso sem logar CPF.
- Planejar rotação de chaves, retenção e controles LGPD. Cifra protege contra vazamento isolado do banco, não contra comprometimento simultâneo do backend e das chaves.

## Validação recomendada

- Testes unitários: nonce diferente, roundtrip, rejeição de adulteração, chave errada, tipo/tenant/id errado, HMAC determinístico por tenant.
- Testes integrados: CRUD/ciclo de vida, busca CPF exato, duplicidades concorrentes, APIs sem campos de cifra, recuperação legada e modo strict.
- Rollback da 066 é permitido somente antes de haver dados cifrados; depois disso é bloqueado para prevenir perda de documentos.

**Nenhuma migration, backfill ou alteração no banco foi executada nesta entrega.**
