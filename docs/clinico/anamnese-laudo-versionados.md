# Anamnese e laudo versionados — base preparatoria (PR empilhado sobre evolucao #8)

## Entregue em codigo

A migration `068_documentos_clinicos_versionados` adiciona:
- `registros_clinicos_documentais`: vinculo com organizacao, area, paciente, profissional e tipo (`ANAMNESE` ou `LAUDO`);
- `versoes_registros_clinicos`: revisoes com numero sequencial, autor, data de registro, estado, natureza, justificativa e conteudo JSONB, sem sobrescrever versoes anteriores;
- restricoes de referencia entre registro e versao, verificacao de pertencimento de paciente e profissional a organizacao/area na criacao, validacao de autoria contra o profissional dono do documento e bloqueio de UPDATE/DELETE/TRUNCATE via trigger;
- bloqueio de rollback quando houver registro ou versao.

O conteudo JSONB e destinado exclusivamente a dados ficticios na etapa de testes; sua estrutura de campos de anamnese e laudo sera validada na camada de dominio antes de qualquer uso clinico. A migration nao contem endpoints nem cria permissao de leitura: os dados nao devem ser disponibilizados por APIs genericas.

## Regras do fluxo futuro

A anamnese deve contemplar queixa principal, historia do problema, antecedentes, medicamentos/alergias informados, limitacoes funcionais, avaliacao inicial e objetivos. Laudo: finalidade, achados, diagnostico fisioterapeutico, conclusao, recomendacoes e identificacao do profissional com registro de conselho. A evolucao por sessao usa os campos da migration 067.

Toda revisao gera nova linha (numeracao crescente). Primeira revisao e INICIAL; apos versao FINALIZADO so se permitem ADENDOS. Nao e uma assinatura digital, nem prova de autenticidade documental; emissao/assinatura e PDF protegido sao etapas separadas. A linha do tempo do paciente so pode ser composta apos autorizacao e auditoria de leitura.

## Limitacoes e validacoes obrigatorias

- **Nao executar em Neon real nem em producao** sem revisao de migration/operacao e identificacao do ambiente. O PR e preparatorio.
- Executar migrações em PostgreSQL 16 descartavel com dados **sinteticos**; provar escopo cruzado bloqueado, autor incorreto, numeracao concorrente, imutabilidade, adendo e rollback seguro.
- Escrever servicos transacionais que gravem auditoria atomica e identifiquem usuario autenticado; a coluna autor enviada por cliente jamais deve ser confiada diretamente.
- Restringir grants DML do runtime, ownership, schema e funcoes de trigger. Triggers sozinhos **nao** protegem contra roles com privilegios de alterar schema/desabilitar trigger.
- Definir schema estrito do JSONB e evitar PII/sensivel em logs, eventos, WhatsApp, analytics ou cobrancas.
- Validar acesso por organizacao, area, profissional, paciente e necessidade clinica, com revogacao imediata.
- Aplicar a politica de retencao, backup e restauracao e criterios de `docs/clinico/criterios-entrada-homologacao.md`.
- A migration 068 depende da 067 no PR backend #8, portanto **nao mesclar isoladamente na main** antes da revisao da base.

Status: estrutura proposta e commitada; ainda **nao homologada nem testada em banco real**, sem endpoints publicados.


## Incremento: contratos HTTP isolados e fluxos transacionais

Foram acrescentados os modulos `src/modules/documentos_clinicos`:
- `validator`: anamnese/laudo com campos estritos, versoes e justificativa;
- `service`: CRUD de **versoes por INSERT**, restricao a profissional identificado por permissao clinica explicita, consulta por titular, escopo de paciente, checagem de concorrencia por `ultima_versao_esperada`, auditoria transacional de criacao/leitura/listagem/revisao/finalizacao;
- `controller`: respostas HTTP e contexto autenticado do middleware;
- `routes`: seguranca fail-closed, **nao montadas** em `/api/v1` e protegidas por `ACESSO_CLINICO_NAO_CONFIGURADO`.

O fluxo HTTP completo foi ensaiado **somente em app Express de teste isolado**, com JWTs e dados sinteticos em PostgreSQL 16 descartavel `prontuario_ficticio`: criacao, consultas, separacao profissional/organizacao, negacao de administrador sem acesso clinico, conflito de versao, finalizacao, adendo, historico imutavel, revogacao de permissoes e trilha de auditoria. O teste impede execucao em host de banco remoto.

O CI fica em `.github/workflows/documentos-clinicos.yml`. **Nao significa homologacao do Neon**, nem autoriza publicacao em um sistema de atendimento. O frontend de treinamento tem estado em memoria e nao consome este contrato ainda.

### Pendencias para liberacao

1. Operar a role do runtime sem grants destrutivos e validar triggers e imutabilidade com essa role.
2. Verificar ACL do paciente com profissional e eventuais relacionamentos de tratamento, compartilhamento clinico consentido e regras especificas de acesso.
3. Testar revogacao simultanea / isolamento e auditoria com carga e concorrencia.
4. Verificar seguranca dos logs, backup/restauracao, retencao e privacidade em homologacao.
5. Projetar e homologar assinatura e emissao do laudo com identificacao profissional e integridade.
6. Conectar interface real ao contrato somente apos autorizacao e homologacao de seguranca.


## Linha do tempo unificada do prontuário (implementação preparatória)

Novo serviço `src/modules/prontuario/prontuario.timeline.service.ts`, com controller,
validator e roteador **não publicado**:

`GET /prontuario/pacientes/:pacienteId/historico?limite=50`

Requer cookie JWT, organização e área do contexto autenticado, além do vínculo
`profissionais_areas.acesso_clinico_autorizado`; a própria sessão, anamnese
e laudo ficam restritos ao **profissional responsável**. A listagem devolve
apenas metadados mínimos: `id`, `tipo` (`ANAMNESE`, `LAUDO`, `EVOLUCAO`),
`paciente_id`, `data`, `profissional_id`, `profissional_nome`, `titulo`,
`versao` e `estado`. Para sessões, versão e estado são `null`. O limite
aceito é de 1 a 100 itens e a ordenação é cronológica decrescente, com desempate
por ID. Para ler o conteúdo, o cliente deverá consultar o endpoint específico
de documento/sessão, que autoriza e audita novamente.

A linha do tempo é montada dentro da mesma transação que registra a auditoria
`PRONTUARIO.LINHA_TEMPO_CONSULTADA`, sem copiar textos clínicos ou CPF para os
logs. Se a auditoria falhar, a consulta falha fechada. Os testes HTTP em app
Express isolado verificam pacientes fictícios, duas identidades, tenant
cruzado, admin sem autorização, limite, histórico, metadados sem conteúdo e
revogação de acesso. A API real **continua sem essa rota montada** e o roteador
possui seu próprio bloqueio explícito de homologação.

### Limite intencional do acesso

Esta primeira versão **não é um prontuário compartilhado entre fisioterapeutas**.
Cada profissional vê somente seus próprios registros do paciente. A matriz de
permissões para compartilhamento, substituição de profissional, delegação e
custódia de registros precisa de decisão clínica e homologação independente.
Não conceder acesso administrativo implícito.
