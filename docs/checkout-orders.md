# Checkout e operação de pedidos

A loja recalcula os produtos, identifica o município pelo CEP e guarda uma cotação de 10 minutos no servidor, vinculada à sessão e ao conteúdo do carrinho. O navegador envia somente IDs, quantidades, endereço, modalidade escolhida e uma chave de repetição. Alterações de preço, endereço ou produtos exigem nova cotação.

Em Aracaju, o pedido é salvo e o cliente abre uma mensagem pronta no WhatsApp. O frete é combinado no atendimento e fica gratuito a partir de R$150 em produtos. Para outros municípios, a compra usa Pix na loja ou cartão pelo atendimento. A partir de R$300, o frete da opção econômica é subsidiado; outras modalidades cobram somente a diferença. As metas usam os preços promocionais vigentes. O prazo mostrado soma 2 a 3 dias úteis de preparação à estimativa da transportadora.

## Pix e envio

O pedido é persistido antes da cobrança e da chamada ao Melhor Envio. A VeloraPay recebe uma chave de idempotência estável por pedido. O backend confirma identificador, valor, descrição do pedido, tipo de transação e ambiente por consulta autenticada. Apenas essa confirmação muda o Pix para pago. Testes não liberam envios de produção.

O webhook `/api/webhooks/velora` valida assinatura e corpo original. Copie o segredo gerado no painel VeloraPay para `VELORA_WEBHOOK_SECRET`; configure a URL HTTPS pública e os eventos de pagamento. `VELORA_WEBHOOK_URL` pode definir o callback da transação. Sem webhook, o agendador continua consultando pagamentos pendentes, mas a confirmação pode demorar alguns minutos.

Com o Pix confirmado e documento de envio válido, a fila prepara o frete no carrinho do Melhor Envio. O lojista entra no Melhor Envio e paga. A integração consulta o status e gera a impressão apenas depois da confirmação desse pagamento. Nunca chama a compra de etiquetas. Uma resposta ambígua na criação interrompe novas tentativas para evitar duplicações e fica sinalizada no painel.

Depois de pagar o frete, volte a `/admin/pedidos`, abra o pedido e clique em **Atualizar status**. Quando o Melhor Envio confirmar o pagamento e liberar a etiqueta, use **Imprimir etiqueta**. O link é privado: mantenha o login da conta do Melhor Envio no navegador. Imprima, fixe a etiqueta na embalagem e leve o pacote ao ponto de postagem do serviço escolhido. Também é possível aguardar a atualização automática; o agendador consulta a fila a cada cinco minutos. A impressão e o status sempre dependem da confirmação do provedor. Se o pagamento já foi feito e a atualização ainda não apareceu, confira no Melhor Envio e atualize novamente depois, sem pagar outro frete.

Na gestão, confira pedidos a postar, postados, entregues, pendentes e que precisam de atenção. O cartão é confirmado manualmente depois de conferir o recebimento. A confirmação grava o pagamento e o trabalho de envio na mesma transação. Rastreios são consultados a cada 30 minutos enquanto estão em trânsito e podem ser atualizados no pedido. A transportadora pode disponibilizar o código somente depois da postagem. Não há rastreio por GPS. Cancelamento na loja não realiza estorno ou cancelamento de etiqueta.

## Agendamento

As migrações `003_commerce.sql` e `004_commerce_scheduler.sql` são obrigatórias. A segunda usa Supabase Cron, pg_net e Vault. Não precisa de um processo permanentemente aberto no computador do lojista.

1. Gere um `CRON_SECRET` aleatório de 64 caracteres hexadecimais. Guarde o mesmo valor na hospedagem e no ambiente local seguro.
2. Aplique as duas migrações e publique `/api/jobs/orders` na URL da loja.
3. Execute `npm run commerce:setup`. O comando guarda o segredo criptografado no Vault e agenda a consulta da fila a cada cinco minutos.
4. Confira os indicadores de integração em `/admin/pedidos`. O endpoint rejeita acessos sem o segredo.

A fila usa bloqueio temporário, tentativas com intervalo crescente e recuperação após falhas. Um pagamento e um envio não são duplicados por callbacks repetidos. Trabalhos de preparação e rastreio são criados por transações do banco. O projeto mantém a Vercel para executar Next.js e o Supabase para persistência e agendamento. O plano Pro da Vercel é recomendado para uso comercial; não é necessário migrar para outra hospedagem antes de medir uso e latência.

## Acesso e privacidade

O pedido pode ser feito sem conta. Um cookie aleatório HttpOnly concede acesso aos pedidos daquele navegador; apenas seu hash é guardado no banco. O cookie dura 180 dias. Contas com email confirmado podem consultar pedidos associados a esse email ou ao seu identificador. Nunca é suficiente informar um email ou adivinhar o número do pedido. RLS e permissões bloqueiam a leitura direta das tabelas por clientes anônimos ou autenticados; todas as operações passam pelo backend.

Nome, contato, endereço e CPF são registrados para pagamento, envio e atendimento. O CPF e as informações privadas da etiqueta ficam restritos à gestão. Nenhum dado pessoal do pedido fica no localStorage. O carrinho guarda IDs/quantidades e a chave de repetição usa um hash, sem copiar os dados pessoais. O link WhatsApp só é aberto por ação do cliente e não envia a mensagem automaticamente.

Cadastro por email depende de SMTP e confirmação de email no Supabase. Google e Apple dependem da configuração oficial de cada provedor. Leia [acesso dos clientes](customer-auth.md), [Pix](payments.md) e [Melhor Envio](melhor-envio.md).
