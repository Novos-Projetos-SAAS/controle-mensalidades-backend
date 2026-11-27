# AbacatePay MVP Implementation Plan

> Execução autorizada pelo pedido completo do usuário. Repositórios D:; branches codex/abacatepay-mvp. Sem commit, merge ou deploy.

**Goal:** integrar checkout avulso e recorrência v2 ao financeiro existente, preservando InfinitePay e a fonte interna das competências.
**Architecture:** novos arquivos coesos dentro de pagamentos/abacatepay, adaptador HTTP v2 isolado e mesma baixa transacional. Configuração, cobranças e eventos usam tabelas existentes; migration068 adiciona vínculos recorrentes e recursos externos.
**Tech Stack:** TypeScript, Express, Knex/PostgreSQL, Zod, Next/React, testes node/Vitest/Playwright existentes.
**Spec:** pedido do usuário de 25/11/2026, seções1..12; documentação oficial docs.abacatepay.com/pages.

## Restrições e decisões
- Histórico e migrations1..67 imutáveis; credenciais AES256GCM com AAD organização/provedor/ambiente. Reutilizar INFINITEPAY_ENCRYPTION_KEY com escopos separados.
- Browser envia somente provedor/método, nunca valor/nome/contato como autoridade. Compartilhar apenas email/nome/telefone válidos; checkout hospedado coleta campos obrigatórios faltantes.
- Nenhum POST financeiro repetido cegamente após timeout; persistir intenção antes de HTTP e reconciliar por externalId. IDs bill_ e subs_ distintos.
- Mesma transação externa só produz um recebimento; eventos fora de ordem não reabrem cancelamento. Divergências ficam em revisão.
- Sem chave abc_dev_ fornecida, testes de contrato usam mocks e banco real exclusivo. Produção permanece indisponível até homologação externa; não apresentar mocks como homologação.
- Pix Automático indisponível sem comprovação de liberação. Não inventar endpoint de capacidade.
- API não permite escolher dia inicial: MVP autoriza adesão somente no vencimento atual, dias1..28. Expirar checkout de adesão ao virar dia; confirmação incompatível exige cancelamento e revisão, nunca ativação silenciosa.

## Tarefas e provas
- [x] 1 Auditoria Git/AGENTS/docs, preservar hashes migrations/env e criar branches (root).
- [x] 2 Adapter abacatepay.provider.ts/types.ts + HMAC e testes RED/GREEN (agente API).
- [x] 3 Migration068, configuração segura, default provider e testes integração isolados (root).
- [x] 4 Checkout avulso persistido, reconciliação, webhook bruto autenticado e baixa financeira; falhas/concorrência/IDOR/duplicidade (root).
- [x] 5 Recorrência individual, recursos cliente/produto reutilizados, primeiro pagamento/renovação/falha/cancelamento e datas (root).
- [x] 6 Extrair gerarMensalidadeTransacional preservando comportamento; rotina atual+próxima competência, locks e testes RED/GREEN (agente QA).
- [x] 7 UI configuração/default/provedor/recorrência, callbacks seguros, estados claros; testes e responsividade (agente frontend).
- [x] 8 Banco exclusivo fresco, suites completas, typecheck/lint/build, revisão independente e documentação operacional (todos por escopo).

## Review Focus
- Timeout depois de criação externa e antes da persistência não pode gerar segunda cobrança.
- Mesmo payment.id em checkout.completed e subscription.renewed só baixa uma vez.
- Atraso de eventos não pode reativar recorrência cancelada ou pagar competência errada.
- Pagamento manual/InfinitePay concorrente com adesão/renovação deve preservar saldo e registrar divergência em revisão.
- Desativar integração não impede confirmação de transações existentes, mas impede novas cobranças.

## Resultado da execução
Backend: 631 passaram, 0 falhas, 4 testes CPF ignorados (legacy). Frontend: 70 testes e 4 Playwright aprovados. Typecheck, lint e build aprovados nos dois repositórios. Sem commit, merge, deploy ou pagamentos reais.
Pendências externas: homologação com abc_dev_, liberação/validação Pix Automático e futura liberação de produção. As etapas indicadas como implementadas usam mocks e banco QA exclusivo; não significam homologação externa.
