# Pix com VeloraPay

O adaptador `lib/payments/velora.ts` segue a referência interativa oficial consultada em 11 de setembro de 2026. A página atual prevalece sobre `llms-full.txt`, cuja versão de maio diverge sobre idempotência e cabeçalhos de webhook.

`POST https://api.velorapay.com.br/payments/create` recebe valores em **reais decimais**. O sistema mantém os totais em centavos e converte uma única vez no backend. O pedido é identificado por uma descrição fixa e por `Idempotency-Key: payment-<uuid-do-pedido>`. A referência atual informa uma janela de 24 horas para deduplicação. Uma falha de rede não dispara novas cobranças automaticamente no adaptador.

`GET /payments/:transactionId` é a fonte autenticada para conciliar status. Antes de liberar um pedido, compare ID da transação persistida, identificador do pedido na descrição, valor exato em centavos, tipo `CASH_IN`, status `COMPLETED` e ausência de modo de teste. O corpo de um webhook nunca é prova suficiente de pagamento.

## Variáveis do servidor

- `VELORA_PUBLIC_KEY` e `VELORA_SECRET_KEY`, ou os aliases existentes `velora_publickey` e `velora_secretkey`.
- `VELORA_WEBHOOK_SECRET`, igual ao segredo configurado no painel da Velora.
- `VELORA_WEBHOOK_URL`, URL HTTPS pública do endpoint `/api/webhooks/velora`. O callback por cobrança substitui o webhook principal para aquela transação, usando o mesmo segredo.
- `VELORA_MODE=test`, apenas em ambiente de testes isolado. Um Pix sandbox é recusado na criação por padrão. Consultas preservam `isTest` para o módulo de pedidos impedir qualquer envio real.

## Webhooks

O backend também consulta `GET /payments/limits` antes de registrar novos pedidos Pix. Os limites CASH_IN da conta, retornados em reais, são convertidos para centavos e validados. Um cupom nunca autoriza aumentar silenciosamente a cobrança para alcançar o mínimo da gateway; um valor fora da faixa produz erro antes de reservar o uso do cupom.

A configuração pública atual da marca informa `webhookHeaderPrefix=VeloraPay`. O cabeçalho atual é `x-velorapay-signature: sha256=<hex>`. O adaptador aceita também o alias `x-velora-signature` usado nos exemplos da documentação e o legado `v-signature`, sempre exigindo HMAC-SHA256 válido dos bytes originais e comparação em tempo constante. Se múltiplos desses cabeçalhos existirem, todos precisam ser válidos.

O timestamp validado vem do corpo assinado, com tolerância de cinco minutos. O cabeçalho de timestamp sozinho não comprova a data. A documentação informa que reenvios renovam o timestamp. Eventos devem ser deduplicados no banco por delivery ID ou transação e evento, com conciliação idempotente do estado do pedido.

A resposta de criação documentada não garante prazo de expiração do Pix. O adaptador retorna `null` quando a provedora não informar um horário válido. Não exiba contagem regressiva fictícia nem considere o pagamento expirado por um prazo inventado localmente.

Os testes usam transporte simulado, chaves fictícias, valores adulterados, assinaturas inválidas, replay e pagamentos sandbox. Nenhuma cobrança real é criada pelos testes.

Fontes oficiais: [Pagamentos](https://velorapay.com.br/docs#payments), [Idempotência](https://velorapay.com.br/docs#idempotency), [Webhooks](https://velorapay.com.br/docs#webhooks-overview).
