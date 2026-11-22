# Organizações e áreas (MVP)

- `POST /api/v1/organizacoes`: requer cookie autenticado; body `{ "nome": "Academia B", "areaInicial": { "nome": "Pilates" } }`. Cria transacionalmente organização, vínculo ADMINISTRADOR do usuário e primeira área. A resposta envelopada inclui `organizacao` (`id`, `nome`, `perfil`) e `area` (`id`, `nome`, `codigo`, `ativo`). Atualize `GET /api/v1/auth/me` depois do cadastro.
- `POST /api/v1/areas-negocio`: exige cookie, `x-organizacao-id` e perfil ADMINISTRADOR nessa organização; body `{ "nome": "Fisioterapia" }`; `codigo` alfanumérico com sublinhado é opcional, derivado do nome. Código repetido na mesma organização gera 409.
- `GET /api/v1/areas-negocio` lista apenas áreas ativas do escopo. Um usuário pode pertencer a várias organizações com perfis independentes. Operadores podem abrir uma nova empresa própria, mas não criar áreas na organização alheia onde são operadores.
- Apenas o módulo AGENDA é habilitado automaticamente quando existir ativo no catálogo e, para áreas adicionais, estiver habilitado na organização. Módulos clínicos e outros módulos não são concedidos. Sem AGENDA no catálogo, a organização ainda pode ser criada, porém a agenda permanecerá indisponível.
- Não há cadastro de novo usuário sem sessão, convite a email já existente, exclusão de empresas/áreas ou cobrança de assinatura SaaS nesta etapa.
- Executar testes exclusivamente no banco isolado `.env.test`. Nenhuma migration nova é necessária.
