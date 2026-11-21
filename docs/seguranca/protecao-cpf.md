# CPF dos clientes — ameaça, proteção e migração segura

## Estado atual (atenção)
A coluna `clientes.cpf` armazena 11 dígitos **em texto puro**. Os repositórios usam igualdade para prevenir duplicidade por organização e `LIKE` para a busca parcial; as APIs atuais retornam CPF em detalhes/listagens. **O cadastro agora valida dígitos verificadores e a interface aplica máscara, mas isso NÃO criptografa nem protege os CPFs existentes contra extração do PostgreSQL.**

## Projeto de proteção antes de ativar em produção
1. **Criptografia na aplicação**: criar `cpf_cifrado` por cliente com AES-256-GCM, IV aleatório por gravação, tag autenticada e versão da chave. Associar organização e identificador do cliente como *additional authenticated data* (AAD). Não usar cifragem determinística, Base64 puro ou hash reversível como substitutos.
2. **Índice cego para igualdade**: armazenar `cpf_indice` calculado com HMAC-SHA-256 e chave **distinta** da chave de cifragem, usando organização + CPF normalizado. Um índice único por organização preserva a proteção contra duplicidade sem armazenar o documento em claro. Não usar SHA-256 sem chave: CPF tem espaço pequeno e pode ser enumerado.
3. **Busca**: substituir a busca por parte do CPF (`LIKE`) por **CPF completo** via HMAC. Nome, e-mail e telefone permanecem pesquisáveis, conforme política de proteção própria. A busca por CPF parcial não é compatível com cifragem forte sem expor informações auxiliares.
4. **Chaves**: manter somente em cofre de segredos/KMS do backend, fora de banco, Git, logs e frontend; usar chaves separadas e identificador de versão para rotação. Proteger acesso, backups, restauração e exportação.
5. **Migração incremental**: adicionar colunas novas, disponibilizar leitura compatível (duas versões), migrar dados antigos em lotes com verificação, habilitar leitura/gravação cifrada, atualizar endpoints, testes e relatórios; só então remover `cpf` plaintext, índices antigos e cópias legadas. Testar rollback, consentimento/escopo e backup restaurado em banco exclusivamente de teste.
6. **API e telas**: retornar CPF minimizado por padrão (por exemplo, `***.***.***-25`), permitir exibição completa somente quando indispensável e autorizada; controlar auditoria, acesso por função e retenção de logs. Não registrar CPF em `registros_auditoria` ou erros.
7. **Escopo**: incluir também CPFs de profissionais (`profissionais.cpf`), e examinar eventuais cópias em exportações, eventos, logs, snapshots e backups; apenas cifrar a coluna `clientes` deixa outras vias expostas.

## Critério de aceite
Em um dump do banco (incluindo tabelas e índices), o CPF original não pode aparecer em claro. A API precisa manter o isolamento por organização, detectar duplicidade concorrente, permitir busca por CPF completo e ler registros migrados sem chave no frontend. Sem a chave privada do backend, dump isolado não permite recuperar o CPF em claro. **Nenhuma migration ou cifragem de CPF está ativada nesta etapa.**
