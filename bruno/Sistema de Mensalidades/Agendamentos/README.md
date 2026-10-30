# Agendamentos

Preencha no ambiente Local as variáveis vazias `cliente-id`, `profissional-id`, `servico-id` e, depois da primeira criação, `agendamento-id` com o valor retornado em `data.id`.

Os horários são exemplos editáveis. A API aceita datas passadas e futuras, desde que `inicio_em` use `Z` ou offset explícito. Para exercitar **Conflito de horário**, execute primeiro **Criar** e mantenha o mesmo início e os mesmos recursos.

Os requests possuem assertions e encadeamento por variável de runtime, sem sobrescrever `agendamento-id` no ambiente. Para execução automática segura, prepare a fixture no banco de testes, suba a API com `NODE_ENV=test` em uma porta isolada e execute a pasta recursivamente com o Bruno CLI. A fixture está em `tests/bruno/agendamentos.fixture.ts` e aceita `setup` ou `cleanup`.
