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
