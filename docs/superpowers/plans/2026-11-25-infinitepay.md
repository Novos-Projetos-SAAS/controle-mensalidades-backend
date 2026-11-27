# InfinitePay Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the backend and superpowers:dispatching-parallel-agents for independent provider and frontend tasks. Track completion here. No commits, push, deployment or real financial calls are authorized by this plan.

**Goal:** Generate a single payable checkout per monthly balance, manually or automatically one/two calendar days before its due date, with an individual private payment page.

**Architecture:** The existing finance service remains responsible for balance, accounting, history and audit. A payments module owns tenant-scoped configuration, persisted attempts, a durable webhook inbox and an in-process bounded scheduler. A small provider contract isolates InfinitePay for a future provider. The frontend proxies callbacks, so no public backend URL is configured.

**Tech Stack:** Existing TypeScript, Express, Knex/PostgreSQL, Next.js, React Query and node:test/Vitest. No new runtime dependencies.

**Spec:** User requests in this chat dated 2026-11-25; the previous proposed MVP is approved for implementation with the changes below.

## Global Constraints

- Work in the existing clean `codex/infinitepay-integration` checkouts; preserve historical migrations and sources/.
- Only new environment variable: `INFINITEPAY_ENCRYPTION_KEY` (canonical Base64, 32 bytes).
- Configuration in the database: enabled, automatic generation, advance days (1 or 2), InfiniteTag, encrypted/versioned account credential, trusted platform origin.
- No backend URL or frontend return URL fields. Use existing CORS allowlist and proxy-supplied platform origin. Return path is `/pagamento/retorno`; webhook path on the platform is `/api/v1/pagamentos/webhook/infinitepay`.
- User has no client authentication today. Default MVP is a private per-charge payment page `/pagamento/:token`, no public lookup by customer ID or CPF. Tokens are random, hashed for lookup and encrypted for administrative recovery; no clinical/customer details are exposed.
- Checkout is for the current balance of an existing monthly charge. It does not generate future monthly debts or automatically charge saved cards.
- Charge generation is idempotent; one active/uncertain charge per account. A transport timeout must never repeat POST /links automatically.
- Provider confirmation, amount, account, actual method and remaining balance are checked. Duplicate/additional/late/canceled payments are recorded for review, never silently credited twice.
- Disabling integration stops new links, not existing payment verification. Keep historical credential snapshots for verification.
- SQL locks and unique constraints enforce tenant scoping, provider transaction uniqueness and single financial allocation.
- Browser return/webhook are hints. The official payment_check is the proof of payment.
- No real database access except a new isolated local PostgreSQL test instance. No real provider calls, migrations in development/production, or activation.

## Review Focus

1. Concurrent automatic/manual generation and webhook/return/manual receipt races.
2. Forged tenant IDs, tokens, browser status, Host/Origin and webhook fields.
3. Missing webhook delivery, server restart, creation timeout and pending confirmation retries.
4. Date boundaries in America/Sao_Paulo; catch-up within the due window without overdue mass generation.
5. Credential changes, disabled integrations and payments after expiry/cancellation/manual settlement.

## Interfaces

All paths below are relative to `/api/v1`. Envelopes follow `{status:'success',data}`.

- GET/PATCH `/financeiro/infinitepay/configuracao`: `{ativo:boolean,geracao_automatica:boolean,dias_antecedencia:1|2,handle:string|null,has_api_key:boolean}`; PATCH same flags plus optional `api_key`. Secrets never returned. Proxy adds `x-platform-origin` and backend validates it against existing CORS allowlist.
- GET/POST `/financeiro/mensalidades/:mensalidadeId/cobranca`: charge or null; POST creates/reuses current charge.
- POST `/financeiro/cobrancas/:id/conciliar`: validated `{order_nsu,transaction_nsu,slug}`; only admin in charge's organization and area.
- Admin charge response `{id,status,valor,vencimento_em,checkout_url,url_plataforma,expira_em,ultimo_erro}`. Local `url_plataforma` is a path with opaque token. No raw provider payloads or account credentials.
- GET `/pagamentos/publico/:token`: `{status,valor,vencimento_em,checkout_url,expira_em}`. Token identifies exactly one charge. Only usable link returned for payable state and open debt.
- POST `/pagamentos/publico/:token/confirmar`: same three identifiers as reconciliation; must match token's charge.
- POST `/pagamentos/webhook/infinitepay`: validate/normalize signal, persist deduplicated event, respond quickly; worker confirms later. Non-payment events are stored for review, not used to reverse money automatically.

### Task 1: Provider and rules

- [x] Write failing tests for HTTP/URL safety, strict official evidence, encryption binding and scheduling boundaries.
- [x] Adapt Shirley client/policy/credential helpers to typed modules and preserve safe integer/BigInt boundaries.
- [x] Run focused tests, typecheck and lint.

### Task 2: Durable backend and financial allocation

Files: new `src/modules/pagamentos/*`, new migration 063, existing financeiro service/routes, env, server and v1 route registration.

- [x] Run baseline checks against dependencies and isolated local PostgreSQL.
- [x] Write failing integration tests for configuration/auth, token access, single creation, automatic dates and official confirmation/replay/overpayment/tenant isolation.
- [x] Add incremental migration, reuse existing tables and preserve manual receipt semantics.
- [x] Implement persisted creation claim, encrypted account snapshot/token, inbox retries with leases and bounded scheduler.
- [x] Extract shared transactional receipt allocation with an explicit system actor, external origin and idempotency.
- [x] Register admin/public routes with validation/rate limiting and no cache/referrer leakage.
- [x] Execute focused/full tests, lint, typecheck and build; document any baseline/environment limits.

### Task 3: Frontend

Files: existing finance feature, API proxy, payment pages and meaningful tests.

- [x] Follow existing UI components and styles; no redesign or assets.
- [x] Write failing tests for settings, manual link, private payment access, safe redirects and return confirmation.
- [x] Add automatic-generation controls, existing-charge display and private payment page with fixed return route.
- [x] Set proxy platform origin server-side, ignoring a client-supplied custom header; callback uses existing BACKEND_URL.
- [x] Run tests, lint, typecheck and production build; inspect the affected UI when possible.

### Task 4: Review and handoff

- [x] Fresh review of finance correctness, security, scheduler and frontend contracts; fix material findings with regression tests.
- [x] Document setup, only encryption env variable, CORS origin/proxy prerequisites, scheduler lifecycle and remaining homologation steps.
- [x] Final Git status/diff check; leave changes uncommitted on the requested branches.

## Execution ledger

- Initial check: both repositories clean on the requested branch. No existing client login. PostgreSQL 18 is installed locally; use a separate data directory and loopback port for tests.
- Ruling: per-charge private page is the default while the optional user preference question is pending; a full client login portal requires a separate identity design.
- Ruling: the platform must be reachable by HTTPS for real provider callbacks. This uses the existing trusted CORS origin and frontend proxy, not a new URL setting or environment variable.

- User confirmed the private individual payment page explicitly during execution.
- Task 1 complete: 15 provider/policy tests verified RED then GREEN; no real API calls.
- Task 2 complete: financial core extracted with the existing manual regression suite preserved; real isolated PostgreSQL 18 clean installation applied all 63 migrations.
- Task 3 complete: 34/34 frontend tests, 3/3 browser flows with API mocks, lint, typecheck and production build passed. Mobile and administration screenshots inspected; no browser/server processes left running.
- Final review: independent read-only review found five P2 issues. Each was reproduced by a failing regression and corrected: subminimum starvation, exhausted event recovery, divergent official payment hiding checkout, disable pausing persisted creation, and shared proxy rate-limit interference with webhook delivery.
- Ruling: an expired link can receive a delayed official confirmation. Apply only if the debt remains valid and has sufficient balance; otherwise preserve the payment for review. The provider contract does not identify the actual original payment time, so expiration alone does not establish a late payment. Cost if wrong: operator review/refund may be required; financial allocation remains bounded by the debt.
- Final backend suite: 523/523 passed, zero failures/skips. Lint/build passed. Test-only header narrowing corrected after the full suite; final typecheck passed.
- Both repository diff checks passed. Existing branches retained, changes uncommitted. No deployment, development/production migrations or real financial calls performed.
- Isolated PostgreSQL test cluster stopped after validation; data retained in ignored/scratch locations. Existing services were not stopped.
