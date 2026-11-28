# Laudo fisioterapêutico: PDF e impressão (desenvolvimento)

Implementação ligada ao prontuário persistido nas migrations 068–070, sem migration adicional.

## Fluxo

1. Entrar no frontend local como **fisioterapeuta autenticado**, autorizado à área e ao paciente.
2. Abrir `/prontuario`, selecionar o paciente e criar um **Novo laudo**.
3. Salvar e depois selecionar **Consultar registro** na linha do tempo.
4. Conferir/corrigir o conteúdo. O botão **Finalizar sem assinatura** cria uma nova versão append-only.
5. Escolher a versão desejada; em **Visualizar PDF**, **Baixar PDF** ou **Imprimir**, o frontend requisita o PDF protegido.
6. Se a versão não for atual, o PDF mostra **CÓPIA DE VERSÃO HISTÓRICA**. Rascunhos mostram **RASCUNHO**.
7. O arquivo A4 identifica a clínica, o paciente, o fisioterapeuta, o conselho/registro (se cadastrado), data/hora, versão, conteúdo, local para **assinatura manuscrita** e numeração de páginas.

**Importante:** `FINALIZADO` significa somente finalização do texto clínico. Nenhuma assinatura eletrônica ou certificado digital é aplicado e o PDF informa isso expressamente. Se `conselho/numero_conselho/uf_conselho` não estiverem cadastrados, o PDF avisa para conferir o registro antes de assinar; não inventa registro, CREFITO ou CPF.

## Segurança e privacidade

- URL protegida: `GET /api/v1/documentos-clinicos/:documentoId/pdf?versao=N`.
- O backend revalida autenticação, organização, área, identidade profissional e vínculo clínico com o paciente, usando transação. Revogação impede nova exportação.
- O backend lê apenas conteúdo e nomes necessários, evita CPF/campo financeiro, audita `DOCUMENTO_CLINICO.PDF_GERADO` e responde `Content-Type: application/pdf`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- O Next faz proxy same-origin do PDF, sem enviar a conexão Neon ao navegador.
- O frontend mantém URL `blob:` temporária em memória e a revoga ao fechar a prévia ou sair da tela; não usa localStorage.
- O PDF não é publicado em ambiente `NODE_ENV=production`, já que as rotas clínicas continuam bloqueadas até revisão de segurança e LGPD.
- Somente testes com pacientes fictícios; tratar PDFs gerados como dados de saúde sensíveis.

## Testes

```powershell
# Na branch feat/prontuario-persistencia-postgres-homologacao-20261125
npm run typecheck
node --import tsx --test tests/modules/documentos_clinicos/laudo.pdf.test.ts
node --import tsx --test tests/modules/documentos_clinicos/documentos_clinicos.validator.test.ts
```

O CI documental executa também o fluxo HTTP integrado em PostgreSQL local descartável (nunca diretamente no Neon de desenvolvimento). No frontend, executar `npm test`, `npm run typecheck` e `npm run build`.

Para testar ponta a ponta localmente: API em `http://localhost:3334`, Next em `http://localhost:3000`, banco `mensalidades-desenv` com migrations 067–070 previamente aplicadas. Nenhuma migration nova é necessária.
