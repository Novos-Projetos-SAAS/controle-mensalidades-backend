# Financeiro

Fluxo manual de planos, assinaturas, mensalidades e recebimentos. A collection deve ser executada somente pelo runner `tests/bruno/executar_financeiro.ps1`, que prepara uma fixture isolada no banco `.env.test` e inicia a API local com o mesmo ambiente.

Todos os endpoints exigem cookie `token`, `x-organizacao-id`, `x-area-negocio-id` e perfil `ADMINISTRADOR`. O fluxo não integra gateway nem gera cobranças automaticamente.
