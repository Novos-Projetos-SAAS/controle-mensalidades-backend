# Onboarding da WhatsApp Business Platform

## Fora da etapa 01

Nenhuma conta Meta foi conectada. O cadastro da API armazena somente IDs e dados exibidos e mantém `ativo=false`, `PENDENTE_AUTORIZACAO`, autorização `PENDENTE` e templates `NAO_VALIDADO`. A implantação futura deverá fazer validação real antes de habilitar envios. Não usar QR Code, WhatsApp Web automatizado ou sessão não oficial.

## Preparação necessária

Para homologar a Cloud API, a organização responsável deverá providenciar:

1. Meta Business Portfolio e acesso administrativo; concluir as verificações empresariais que a conta exigir.
2. App Meta com o produto WhatsApp e permissões aprovadas para o caso de uso.
3. WhatsApp Business Account (WABA), `Phone Number ID`, número apto e nome de exibição aprovado.
4. Token de acesso adequado, guardado em cofre de segredos. O banco deve manter apenas uma referência ao segredo, nunca o token.
5. Templates de mensagem aprovados, com nome e idioma exatamente iguais aos publicados na WABA. As propostas internas não são aprovação Meta.
6. Domínio público HTTPS para callback de webhook, token de verificação de handshake e App Secret para validar `X-Hub-Signature-256` sobre o corpo bruto.
7. Plano de rotação/revogação de credencial, limitação de volume, monitoramento e tratamento de falhas.

A Cloud API envia mensagens pelo endpoint de mensagens associado ao Phone Number ID e usa token de acesso Bearer; consulte a [documentação oficial da WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview). Webhooks devem validar a assinatura `X-Hub-Signature-256` conforme [Meta Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).

## Fluxo de ativação futuro

1. Conectar a conta pelo Embedded Signup oficial, apenas se app, negócio e permissões forem elegíveis.
2. Persistir credenciais no cofre e IDs/estados no backend, isolados por organização/área.
3. Validar acesso ao WABA e ao número; sincronizar templates e status.
4. Só então transicionar autorização/conexão para ativa, com auditoria e validação operacional.
5. Configurar webhook e deduplicar eventos; executar homologação consentida antes de liberar tráfego.

A elegibilidade para coexistência entre WhatsApp Business App e Cloud API depende da disponibilidade e regras da Meta para a conta e região. Confirmar no onboarding oficial antes de prometer esse modo; esta etapa não simula nem implementa pareamento.
