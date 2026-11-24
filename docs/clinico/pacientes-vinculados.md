# Listagem dos pacientes vinculados ao fisioterapeuta

**Status:** código preparatório (não liberado na API pública). Este incremento depende dos PRs backend **#8 → #11 → #12**.

## Rota proposta

`GET /prontuario/pacientes?pagina=1&limite=20`

- Requer autenticação de usuário, organização e área autenticadas, identidade profissional única, acesso clínico explícito e vínculo paciente–fisioterapeuta ativo.
- Retorna **somente** `id` e `nome`. CPF, telefone, endereço, nascimento, diagnósticos e evolução não entram na listagem.
- Paginação validada: `pagina` de 1 a 100 e `limite` de 1 a 50, padrão 1/20; ordenação por nome/ID e indicador `temMais`, sem contagem total sensível.
- Filtro no banco por organização, área, paciente e profissional ativos, inclusive permissões e revogação.
- Auditoria da consulta gravada na mesma transação, apenas com página, limite e quantidade; nenhuma informação clínica nos logs.
- Erros de autorização não são substituídos por fallback geral que listaria pacientes do cadastro comercial.
- Não inclui pesquisa por nome nesta versão, evitando novos vazamentos em logs e URLs. Pesquisa poderá ser adicionada com parâmetros de privacidade específicos.

Resposta fictícia:

```json
{
  "data": {
    "items": [
      { "id": "33333333-3333-4333-8333-333333333333", "nome": "Paciente Exemplo A" }
    ],
    "pagina": 1,
    "limite": 20,
    "temMais": false
  }
}
```

## Como homologar

1. Executar exclusivamente em PostgreSQL 16 descartável a suíte documental HTTP com dois fisioterapeutas, dois pacientes e vínculos concedidos pelo administrador.
2. Antes de conceder vínculo, a lista do profissional é vazia. Após conceder, aparecem apenas seus pacientes. Sem permissão clínica, retornar 403.
3. Testar páginas 1/2, limites fora do contrato (400), paciente alheio e outro tenant.
4. Revogar um vínculo: o paciente deve desaparecer imediatamente da listagem, sem eliminar documentos históricos do banco.
5. Testar falha de auditoria: a listagem não pode devolver sucesso.
6. **Não publicar os endpoints** antes da homologação da role runtime, backup/restauração, RLS/grants, autenticação, autorização clínica e contrato de privacidade.

Próximo passo: conectar esta listagem ao seletor de pacientes da interface clínica real e manter o simulador completamente separado do banco clínico.
