# Evolução clínica estruturada — fase preparatória

Campos adicionados de maneira **aditiva** à sessão clínica (todos opcionais/nullable para manter prontuários anteriores):
- objetivo_sessao
- avaliacao_previa
- procedimentos_realizados (**o que foi trabalhado**)
- exercicios_parametros
- resposta_paciente
- orientacoes
- plano_proxima_sessao

Os campos devem ser preenchidos pelo profissional responsável. A evolução do atendimento existente continua em `evolucao`; o diagnóstico, prognóstico e plano terapêutico continuam independentes. Correções preservam versões anteriores no histórico clínico, com auditoria transacional. **Não reduzir tudo a um campo de texto livre nem apagar o histórico de correções.**

Este PR mantém inalterado o bloqueio de `sessoesClinicasRoutes`, que permanece fora da API pública. O fluxo HTTP é executado apenas em aplicativo Express isolado com PostgreSQL descartável e registros fictícios. Isso **não autoriza** uso com paciente real.

**Anamnese e laudos** ainda exigem serviços persistentes e autorização clínica com rastreabilidade, preferencialmente reutilizando as tabelas `formularios`/`preenchimentos_formulario` e `documentos_clinicos`; não estão implementados neste PR. A liberação clínica exige cumprir os critérios em `docs/clinico/criterios-entrada-homologacao.md`, incluindo segregação de privilégios, backup/restore e revisão de logs.

A alteração de migration deve ser coordenada com a frente InfinitePay para evitar conflitos de numeração ou deploy.
