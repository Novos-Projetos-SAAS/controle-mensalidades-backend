# Baileys — primeira etapa (diagnóstico local)

O código atual do worker WhatsApp bloqueia envio real. Não alterar esse bloqueio antes de integrar consentimento, escopo por organização, estado criptografado e histórico real. Este diagnóstico não acessa Neon, não usa clientes e não altera rotinas financeiras.

## Teste no Windows

Com Node compatível (22+) e Git, na raiz do backend, branch codex/whatsapp-baileys:

```powershell
npm ci
npm install --no-save --package-lock=false @whiskeysockets/baileys@7.0.0-rc14 qrcode-terminal@0.12.0 pino@9
$env:BAILEYS_TEST_NUMBER = "55DDDNUMERO"
node scripts/baileys-smoke.mjs
Remove-Item Env:BAILEYS_TEST_NUMBER
```

Substituir pelo próprio número destinatário, confirmar SIM e escanear QR com um número remetente exclusivo de teste. Não compartilhar QR. A versão escolhida é release candidate; a compatibilidade deve ser confirmada no teste. O script faz apenas um envio, não repete envio de resultado incerto e exclui a sessão temporária ao sair normalmente. Desvincular o aparelho no celular, inclusive se o script for interrompido. A sessão de diagnóstico NÃO é a persistência de produção.

Teste unitário de janela: `node --import tsx --test tests/modules/whatsapp/whatsapp.janela.test.ts`.

## Próximas etapas (não habilitadas)

- Sessões e chaves Baileys criptografadas no Neon, isoladas por organização e área, com exclusão e bloqueio de concorrência.
- QR Code autenticado na interface, seleção de provedor e envio manual auditável. Preservar Meta.
- Janela automática 09:00–19:00 America/Sao_Paulo, sem limitar webhooks ou pagamento manual. Validar novamente antes de cada mensagem.
- Agendador externo autenticado: 07h geração financeira; 09h, 12h, 15h e 18h despacho/reprocessamento. Sem keep-alive. Proteger rota e usar idempotência, lotes limitados e recuperação de falhas; não reenviar resultado incerto.
- Conferir rotina existente de geração financeira e pagamentos antes de alterações. Não duplicar processamento.
- Baileys não é integração oficial; consentimento, opt-out e número exclusivo de teste são necessários, sem garantia contra bloqueio.
