# Integração com Melhor Envio

O backend consulta o preço do frete e preserva os volumes retornados na cotação. Os valores `custom_price` e `custom_delivery_range` respeitam ajustes da conta no Melhor Envio. A aplicação soma o prazo de preparação da loja separadamente. Valores monetários ficam em centavos na loja e são convertidos para reais apenas na chamada ao provedor; dimensões usam centímetros e peso usa quilogramas.

O lojista confirmou uma caixa por pedido, de 300 g, 12 cm de altura, 32 cm de largura e 27 cm de comprimento. `SHIPPING_PACKING_MODE=per_order` representa essa configuração. `SHIPPING_PACKAGE_MAX_ITEMS` permite estabelecer uma capacidade posteriormente, se necessário. Pedidos que precisarem de outra embalagem devem ter a cotação revisada antes do envio. O modo alternativo `per_item` usa o empacotamento do Melhor Envio com dimensões por item.

## Pagamento do frete

O pagamento Pix do cliente e o pagamento da etiqueta são operações distintas. Após a confirmação do Pix e a validação do documento de envio, `prepareShipment` somente insere o envio no carrinho do Melhor Envio. O lojista paga o frete no painel do provedor. A integração não chama o endpoint de compra de etiquetas e não movimenta o saldo da carteira.

`generateAndPrintLabel` consulta o provedor e exige confirmação de pagamento da etiqueta antes da geração. O link de impressão é privado e exige login do lojista no Melhor Envio. Não exponha esse link nem os dados do remetente no endpoint de acompanhamento do cliente.

A criação no carrinho não tem garantia de idempotência documentada. O chamador deve bloquear concorrência por pedido, persistir o identificador retornado e marcar `shipment_creation_uncertain` quando uma resposta se perder. Essa situação exige conferir o carrinho do provedor antes de repetir; a integração nunca tenta criar novamente automaticamente. A tag `tia-cris:<id-do-pedido>` ajuda a localizar o envio.

## Documento do envio

O perfil autenticado fornece nome, CPF/CNPJ, email e telefone do remetente. O endereço de origem vem exclusivamente das variáveis de ambiente, seguindo o endereço fornecido pelo lojista. Todas essas informações permanecem no backend.

O envio exige uma classificação fiscal explícita. A opção `invoice` recebe uma chave de NFe de 44 dígitos e exige CNPJ e inscrição estadual do remetente. A opção `declaration` só pode ser usada quando o lojista tiver confirmado que a declaração de conteúdo é permitida para a operação; ela requer `authorized: true`. Uma chave DCe já emitida pode ser informada. Sem chave DCe, o Melhor Envio usa os produtos declarados para sua emissão, conforme a documentação. O adaptador não determina enquadramento tributário nem transforma uma venda sujeita a NFe em envio dispensado. Cadastros com inscrição estadual diferente de `ISENTO` devem revisar a documentação antes de usar declaração.

Serviços que exigem configuração adicional de agência ou XML fiscal, como Azul Cargo, Latam e Buslog, não são oferecidos nesta versão. Opções de múltiplos volumes incompatíveis com uma única etiqueta de Correios, JeT, Loggi e serviço 27 também são descartadas. Um erro de aceitação do documento deve aparecer no painel do pedido para correção, sem repetir a compra do cliente.

## Atualizações e configuração

`syncShipment` consulta o ciclo de vida da etiqueta. O cliente recebe status e, quando disponível, o código e link de rastreamento do Melhor Rastreio. A API não fornece localização por GPS. Algumas transportadoras só disponibilizam o código até um dia útil após a postagem.

Webhooks dependem de um aplicativo cadastrado, além do token de acesso. A assinatura `X-ME-Signature` usa HMAC-SHA256 do corpo original e o segredo do aplicativo, com resultado Base64. Não use o token de acesso como segredo de webhook. Notificações devem ser persistidas e processadas de maneira idempotente. Sem um aplicativo com webhook, mantenha sincronização autenticada pelo backend e pelo painel administrativo.

Variáveis exclusivamente de servidor:

- `MELHOR_ENVIO_TOKEN` ou o nome existente `token_melhorenvio`.
- `MELHOR_ENVIO_ENVIRONMENT`: `sandbox` para testes ou `production` para operação.
- `SHIPPING_CONTACT_EMAIL`: contato técnico real enviado no cabeçalho obrigatório `User-Agent`.
- `SHIPPING_ORIGIN_POSTAL_CODE`, `SHIPPING_ORIGIN_ADDRESS`, `SHIPPING_ORIGIN_NUMBER`, `SHIPPING_ORIGIN_COMPLEMENT`, `SHIPPING_ORIGIN_DISTRICT`, `SHIPPING_ORIGIN_CITY` e `SHIPPING_ORIGIN_STATE`.
- `SHIPPING_PACKING_MODE`, `SHIPPING_PACKAGE_WEIGHT_KG`, `SHIPPING_PACKAGE_HEIGHT_CM`, `SHIPPING_PACKAGE_WIDTH_CM`, `SHIPPING_PACKAGE_LENGTH_CM` e, opcionalmente, `SHIPPING_PACKAGE_MAX_ITEMS`.
- Overrides opcionais de remetente: `SHIPPING_SENDER_NAME`, `SHIPPING_SENDER_EMAIL`, `SHIPPING_SENDER_PHONE`, `SHIPPING_SENDER_DOCUMENT`, `SHIPPING_SENDER_COMPANY_DOCUMENT` e `SHIPPING_SENDER_STATE_REGISTER`.
- `MELHOR_ENVIO_SERVICES`, opcional, restringe os IDs de serviços consultados.
- `MELHOR_ENVIO_WEBHOOK_SECRET`, opcional, recebe o segredo do aplicativo para verificar a assinatura das notificações. O endpoint da aplicação é `/api/webhooks/melhor-envio`.
- `SHIPPING_DECLARATION_AUTHORIZED` permite preparar pedidos com declaração quando essa modalidade tiver sido confirmada pelo lojista como permitida para a operação. O exemplo inicia em `false`.

## Referências oficiais

- [Cotação e empacotamento](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos).
- [Inserção no carrinho, documentos e volumes](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho).
- [Geração após pagamento](https://docs.melhorenvio.com.br/reference/geracao-de-etiquetas).
- [Impressão privada](https://docs.melhorenvio.com.br/reference/impressao-de-etiquetas).
- [Consulta do status](https://docs.melhorenvio.com.br/reference/rastreio-de-envios).
- [Assinatura, tentativas e eventos de webhook](https://docs.melhorenvio.com.br/docs/webhooks).

Os testes mock em `tests/shipping.test.ts` verificam centavos, embalagem, confirmação de pagamento, classificação fiscal, respostas ambíguas e assinatura do webhook. Nenhum teste compra frete ou cobra um cliente.
