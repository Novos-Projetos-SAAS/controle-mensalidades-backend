# Vinculação clínica paciente–fisioterapeuta — etapa preparatória 069

Status: implementação proposta e testada com dados sintéticos. **Não
autorizada para Neon real, pacientes reais ou publicação de rotas.**

## Escopo técnico

A migration `20261125122000_069_vinculos_clinicos_pacientes.js` cria
`vinculos_clinicos_pacientes`, separando:
- organização, área, cliente e profissional responsável;
- administrador que concede o vínculo e instante da concessão;
- administrador que revoga, data e motivo obrigatório da revogação;
- histórico permanente de concessões/revogações.

Há índice único parcial para cada vínculo **ativo**, validação de escopo
de organização/área, paciente/profissional elegíveis, permissão clínica
explícita e administrador autenticado da organização. É proibido alterar
identidade, apagar ou truncar vínculos. Um vínculo revogado não volta
a ficar ativo: um novo vínculo deverá ser concedido, criando outra linha.

A partir desta branch, os documentos e suas versões, a linha do tempo
e as sessões clínicas exigem que o profissional responsável mantenha
o vínculo ativo com o paciente, além do vínculo de usuário, área,
organização e permissão clínica preexistentes. O histórico documental
não é excluído quando o vínculo termina; a consulta é negada. A
concessão/revogação administrativa registra auditoria **na mesma
transação**, sem texto clínico nos logs.

Os endpoints administrativos de concessão, consulta e revogação estão
implementados, mas **não montados em `/api/v1`** e possuem gate explícito
`ACESSO_CLINICO_NAO_CONFIGURADO`. Eles não estarão disponíveis após
o deploy da `main`.

## Testes sintéticos

O workflow `.github/workflows/documentos-clinicos.yml` executa
migrations, typecheck, lint e testes HTTP com PostgreSQL 16 efêmero
`prontuario_ficticio` de localhost. A suíte testa:

- sem vínculo, profissional habilitado não cria anamnese, laudo ou
  evolução, nem lê sessão ou histórico;
- administrador concede vínculo A e B, mas profissional não pode
  se autoatribuir pacientes;
- concessão duplicada negada;
- vínculo de outra organização/área e mutação de identidade rejeitados
  no PostgreSQL, assim como DELETE e TRUNCATE;
- titular só vê suas sessões/documentos;
- revogação impede leitura, adendos e histórico do profissional A,
  sem afetar profissional B;
- linha do tempo retorna metadados sem textos clínicos;
- falha de auditoria impede confirmação da operação;
- as rotas continuam ausentes do roteador público e bloqueadas no
  roteador administrativo isolado.

Não confundir aprovação em PostgreSQL descartável com homologação
da instância Neon. O teste de gatilhos não prova segurança contra
proprietário de tabela ou role com DDL.

## Dependências e sequência de integração

Ordem de PRs/backend: **#8 → #11 → #12** (este). Nesta etapa os
PRs são rascunhos e nenhuma migration foi aplicada no Neon.

1. Deploy inicial dos repositórios pela `main` somente para validar
   infraestrutura, TLS, cookies, proxy e saúde da API.
2. Provisionar no futuro uma instância/branch isolada de Neon para
   homologação, com dados sintéticos e credenciais runtime/migrations
   segregadas. Conferir backup/restauração.
3. Aplicar as migrations clínicas aprovadas 068/069/070 apenas através da role
   controlada e change autorizado; conferir `knex_migrations` e triggers.
4. Testar concessão/revogação de vínculo, concorrência, auditoria,
   regras de atendimento e isolamento multi-organização no ambiente.
5. Implementar UI autenticada que só mostre pacientes vinculados
   e conecte anamnese/evolução/laudo aos serviços persistidos.
6. Aprovar matriz de acesso e eventual compartilhamento de pacientes
   entre profissionais com supervisão e base legal. Hoje apenas o
   titular do registro pode vê-lo, mesmo que um segundo profissional
   tenha vínculo com o mesmo paciente.
7. Homologar integridade de laudos, identificação e assinatura do
   profissional e política de retenção antes de qualquer uso real.

### Rollback seguro

Não executar `migrate:rollback` automático em dados clínicos.
A migration 069 recusa o `down` se existir qualquer vínculo,
inclusive revogado. Reverta o código sem remover os controles do banco.
Nunca desabilitar triggers para contornar falha de aplicação.

## Critério de liberação

Continuar **bloqueado** enquanto não houver evidência de TLS
`verify-full`, role runtime sem DDL/TRUNCATE, auditoria de leitura
e escrita, permissões por paciente, operação segura de backups,
recuperação testada, política de privacidade e autorização técnica.

> **Importante (novembro/2026):** a migration da evolução foi renomeada de `20261122170000_067_campos_evolucao_fisioterapia.js` para `20261125130000_070_campos_evolucao_fisioterapia.js`. O conteúdo SQL não foi alterado. A ordem por timestamp passa a ser documentos `068`, vínculos `069`, evolução `070`, sem dependências SQL entre essas três migrações. A migration original InfinitePay `20261125120000_067_infinitepay_cobrancas.js` já foi copiada sem alterações para as branches clínicas. A sequência completa por timestamp é 067 → 068 → 069 → 070. Execução em Neon requer homologação prévia.
