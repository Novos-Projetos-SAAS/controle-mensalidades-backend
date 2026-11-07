# Testes Bruno — vínculo usuário-profissional

Esta suíte valida, em ordem, os 15 cenários do endpoint administrativo `PATCH /profissionais/:profissionalId/usuario`. Ela usa somente registros fictícios criados em um banco exclusivo de testes.

## Execução automatizada

Na raiz do repositório, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\bruno\executar_vinculo_usuario_profissional.ps1
```

O runner exige que `.env.test` configure `NODE_ENV=test` e `AMBIENTE_BANCO=teste`. Ele prepara a fixture, inicia a API em uma porta isolada, injeta no Bruno os IDs e as credenciais efêmeras, executa os requests de `01` a `15`, verifica o estado final e sempre tenta limpar os dados.

Para usar outra porta:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\bruno\executar_vinculo_usuario_profissional.ps1 -Porta 3340
```

## Preparação e limpeza manuais

Se for necessário inspecionar a coleção no aplicativo Bruno, prepare a fixture com:

```powershell
$env:NODE_ENV = 'test'
node --import ./tests/bruno/tsx_windows_shim.mjs --env-file=.env.test --import tsx tests/bruno/vinculo_usuario_profissional.fixture.ts setup
```

Copie os valores retornados apenas para um ambiente local não versionado. Configure `baseUrl`, `organizacao-id`, `area-negocio-id`, os seis IDs `vinculo-*`, `vinculo-area-sem-agenda-id` e as credenciais de administrador/operador. As senhas devem continuar marcadas como secrets. Execute a pasta inteira em ordem crescente; os cenários de repetição dependem do vínculo criado no request `09` e removido no `12`.

Ao finalizar, execute:

```powershell
node --import ./tests/bruno/tsx_windows_shim.mjs --env-file=.env.test --import tsx tests/bruno/vinculo_usuario_profissional.fixture.ts verify
node --import ./tests/bruno/tsx_windows_shim.mjs --env-file=.env.test --import tsx tests/bruno/vinculo_usuario_profissional.fixture.ts cleanup
```

Para repetir a suíte, execute novamente o runner. O `setup` remove resíduos identificados da própria fixture antes de criar UUIDs novos, e o bloco `finally` do runner executa a limpeza mesmo quando há falha.

## Interpretação de falhas

- `401`: cookie ausente, inválido ou não capturado pelos logins `01` e `02`.
- `403 PERFIL_NAO_AUTORIZADO`: o usuário autenticado não é administrador.
- `404`: o profissional ou usuário não pertence à organização informada.
- `403 MODULO_NAO_HABILITADO`: a área própria usada no request `14` está com AGENDA desabilitada, como esperado.
- `409`: conflito de vínculo repetido, usuário já associado ou tentativa de troca direta.
- Falha em `verify`: o profissional fictício permaneceu vinculado, a autorização clínica antiga não foi revogada ou as auditorias esperadas não foram gravadas.

Um banco exclusivo de testes é obrigatório porque a suíte cria e remove organizações, áreas, usuários, profissionais, vínculos de módulo e auditorias. A fixture recusa execução fora de `NODE_ENV=test` e `AMBIENTE_BANCO=teste`; nenhum paciente ou prontuário real é criado ou consultado.
