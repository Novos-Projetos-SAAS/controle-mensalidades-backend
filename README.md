# Controle de Mensalidades Backend

Backend da Plataforma Modular de Gestão de Atendimentos e Cobranças.

## Stack

- Node.js + Express + TypeScript + ES Modules
- Zod
- node:test + node:assert/strict + Supertest
- PostgreSQL + Knex (próxima etapa)

## Versionamento da API

A API pública usa versionamento por URL.

Versão atual:

```text
/api/v1
```

Exemplo:

```text
GET /api/v1/saude
```

Mudanças compatíveis permanecem na mesma versão. Uma nova versão (`/api/v2`) só deve ser criada quando houver mudança incompatível no contrato HTTP.

As regras de domínio, serviços e repositórios não devem ser duplicados por versão. Quando necessário, versões diferentes devem divergir somente na camada de contrato/roteamento/controladores.

## OpenAPI / Swagger

A especificação oficial da API usa OpenAPI 3.1.

Com a aplicação em execução:

```text
Swagger UI:     http://localhost:3000/docs
OpenAPI JSON:   http://localhost:3000/docs/openapi.json
```

A documentação deve evoluir junto com cada endpoint. Um endpoint novo só é considerado pronto quando rota, validação, testes e contrato OpenAPI estiverem atualizados.

## Comandos

```bash
npm run dev
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```
