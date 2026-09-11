# Recursos da Tia Cris

Loja em Next.js 16, React, Supabase Auth, Postgres e Storage. Catálogo, galeria, ofertas, carrinho, Pix VeloraPay, frete Melhor Envio e acompanhamento de pedidos. Entregas em Aracaju e pagamento por cartão seguem pelo WhatsApp. Gestão em `/admin/login`, sem links no site público.

O login administrativo solicita **somente a senha**. A conta dedicada está autorizada em `admins`. Seu identificador interno fica em `ADMIN_AUTH_EMAIL`, exclusivo do servidor. A senha é validada pelo Supabase, sem cópia no código ou no `.env.local`. Não existe cadastro público de administradores. O acesso dos clientes é separado e opcional; veja [a configuração de autenticação](docs/customer-auth.md).

## Executar localmente

```powershell
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Ao clonar o repositório, copie `.env.example` para `.env.local` e preencha as variáveis antes de usar o painel. Se `.env.local` já existir, preserve sua configuração. Abra http://127.0.0.1:3000. O `.env.local` é ignorado pelo Git. As chaves do Supabase não são enviadas ao navegador. Use sempre a mesma origem configurada em `APP_ORIGIN`.

`DEMO_MODE=true` seleciona explicitamente a prévia em desenvolvimento, mesmo com o Supabase configurado. O catálogo local tem 51 produtos e seis ofertas, preparado a partir dos cadastros existentes e das 19 fotos fornecidas em setembro de 2026. Os 13 produtos novos e as seis atualizações preservam as galerias anteriores. A prévia não altera o banco de produção. Recursos ativos ficam sempre disponíveis para pedidos, sem controle de quantidade em estoque. Não existe login administrativo alternativo, senha padrão ou bypass de autenticação. Métricas demonstrativas não são armazenadas nem apresentadas como reais.

## Conectar o Supabase

1. Preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em `.env.local`. Não use prefixo `NEXT_PUBLIC_`. Confirme `WHATSAPP_NUMBER`, herdado do site original como `557999226515`.
2. Execute as migrações ainda não aplicadas, na ordem: `001_store.sql`, `002_product_discounts.sql`, `003_commerce.sql` e `004_commerce_scheduler.sql`, em `supabase/migrations`. Elas criam catálogo/RLS, descontos, pedidos privados e agendador. Aplique antes do deploy. Projetos com tabelas homônimas precisam de migração adaptada.
3. Crie a conta administrativa manualmente e defina seu email interno em `ADMIN_AUTH_EMAIL`. Autorize seu UUID no SQL Editor. O cadastro de clientes, se habilitado, nunca cria registros em `admins`:

```sql
insert into public.admins(user_id) values ('UUID-DA-CONTA-CRIADA');
```

4. Opcionalmente, execute `npm run seed` para enviar as fotos e vídeos ao Storage e importar o catálogo. Todos os produtos são importados **inativos**, para que você revise os preços antes de publicá-los. O importador preserva registros já cadastrados, mantém todas as mídias dos novos cadastros e detecta o formato real de cada arquivo. `npm run seed:check` confere arquivos locais e origens das referências remotas sem escrever no banco. A importação inicial já foi executada neste projeto.
5. Acesse `/admin/login`, entre somente com sua senha, revise os recursos e ative os produtos. Defina `DEMO_MODE=false` ao concluir a configuração. Se necessário, reinicie `npm run dev` depois de alterar as variáveis.

Para revogar a gestão, remova o UUID de `public.admins`. A autorização é conferida novamente em cada requisição, mesmo que a sessão Auth ainda seja válida. Não é suficiente saber o endereço do painel.

## Frete, etiquetas e acompanhamento

Configure as variáveis de Melhor Envio e remetente em `.env.local` e na hospedagem. O arquivo `.env.example` contém os nomes necessários e mantém endereço, documentos e credenciais em branco. `MELHOR_ENVIO_TOKEN` e o alias existente `token_melhorenvio` são aceitos. Use `MELHOR_ENVIO_ENVIRONMENT=production` somente com as credenciais da conta de produção. Os dados particulares do remetente ficam exclusivamente no backend.

O checkout consulta os serviços disponíveis para o destino e registra a cotação escolhida junto ao pedido. A embalagem configurada é uma caixa por pedido. O cálculo usa o valor dos produtos para o seguro e respeita o peso em quilogramas e dimensões em centímetros. A loja faz a postagem em até 24 horas úteis. A estimativa mantém o prazo mínimo da transportadora e acrescenta até 1 dia útil ao prazo máximo.

Com o pagamento do cliente confirmado e o documento de envio válido, o pedido pode ser preparado no carrinho do Melhor Envio. **O lojista paga a etiqueta no próprio Melhor Envio.** A integração não compra o frete automaticamente. Depois do pagamento do frete, o painel pode liberar a impressão privada e acompanhar os status fornecidos pela transportadora.

Em `/admin/pedidos`, a gestão reúne busca, filtros, paginação, valores, endereço e contato do cliente, documento fiscal, anotações e histórico. Confirmações de pagamentos manuais, entrega local e novas tentativas de preparação exigem a conferência do administrador. Cancelar um pedido não faz estorno. Se houver resposta ambígua ao criar o envio, confira o carrinho do Melhor Envio antes de repetir ou vincule o identificador da etiqueta existente.

Leia [a documentação da integração](docs/melhor-envio.md) para configurar o remetente, declaração de conteúdo ou nota fiscal, webhook e serviços atendidos. O acompanhamento mostra as informações disponíveis da transportadora e a última atualização; não representa localização por GPS.

## Preços e descontos

No formulário de produto, **Valor original** é obrigatório e **Valor com desconto** é opcional. Informe os valores em reais, com até duas casas decimais. O preço promocional precisa ser maior que zero e menor que o original. Deixar o campo promocional vazio remove a oferta. Quando há desconto, catálogo, página do produto e painel mostram o original riscado e o preço promocional em destaque, com percentual de economia.

O filtro **Em oferta** combina com categoria e busca por nome. As opções de menor e maior preço usam o valor que será cobrado; **Maior desconto** ordena pela redução percentual. Por exemplo, um produto de R$ 30,00 com preço promocional de R$ 25,00 entra nas ofertas e custa R$ 25,00 por unidade no carrinho e na mensagem do WhatsApp. O preço original deve corresponder ao preço regular real do produto.

No banco, `price_cents` continua sendo o preço original, em centavos inteiros, e `sale_price_cents` guarda o preço promocional ou `null`. A API valida os dois campos e o PostgreSQL impede descontos inválidos mesmo em escritas diretas. RLS continua permitindo escrita somente para administradores. O carrinho envia apenas IDs e quantidades; o backend relê os preços atuais e usa `sale_price_cents ?? price_cents` ao conferir o pedido. A migração não cria promoções automaticamente nem modifica os preços originais cadastrados.

## Segurança e comportamento

Todas as leituras e escritas de dados da aplicação passam pelo backend. O envio de arquivos usa uma autorização temporária emitida pelo servidor, com validação antes de salvar o produto. O cliente guarda somente IDs e quantidades do pedido no localStorage. Os preços públicos de venda são enviados para exibição; são públicos por definição. O preço usado para checkout e o status ativo do produto são consultados novamente no servidor. Os valores monetários usam centavos inteiros. IDs duplicados são somados antes de conferir o limite de 99 unidades por recurso em cada pedido.

Sessões Auth usam cookies HttpOnly, SameSite e Secure em produção. A API valida a origem exata, formato, tamanho e conteúdo dos formulários. A sessão é verificada com `getUser()` e o papel é consultado na tabela `admins`. O banco reforça as permissões por RLS, com leitura anônima apenas de produtos ativos e sem acesso à coluna de estoque. O service role é usado exclusivamente pelo servidor para catálogo, métricas recebidas, limites e limpeza; operações administrativas de produto usam também a sessão do admin e RLS.

Os limites de requisição são persistidos no Postgres quando conectado. Por padrão, ignoram cabeçalhos de IP enviados pelo solicitante e usam um limite compartilhado. Configure `TRUST_PROXY_HEADERS=true` somente se um proxy confiável substituir `x-forwarded-for` antes de encaminhar as requisições. Sem essa garantia, mantenha `false`. Ajuste limites e proxy conforme o volume real da loja.

As fotos e vídeos de produtos são públicos no bucket `products-media`. Não envie dados pessoais ou documentos particulares para ele. O painel tem botões separados para anexar fotos (JPG, PNG, WebP) e vídeos (MP4, WebM), com progresso e limite de 20 arquivos por produto e 20 MB por arquivo. A galeria permite navegar por setas, teclado e deslize sobre fotos, além de miniaturas na página do produto. Vídeos têm controles e não começam automaticamente.

O backend exige admin e emite uma URL temporária para um único arquivo, sem permissão de sobrescrita. O navegador transfere o arquivo diretamente ao Storage para respeitar o limite de requisição da hospedagem. A conclusão retorna ao backend, que confere usuário, caminho, tamanho real, MIME e assinatura do arquivo antes de emitir uma prova de validação. O salvamento de novas mídias exige essa prova. Nenhuma chave do Supabase é enviada ao frontend. O cadastro e a ordem das mídias são gravados na mesma transação. A exclusão de referências enfileira a limpeza; uploads abandonados ficam elegíveis após 24 horas e falhas permanecem para nova tentativa.

O checkout valida preços e status ativo. Não há controle, reserva ou baixa de estoque: todos os recursos ativos aceitam pedidos. A coluna `stock` permanece por compatibilidade, sem limitar compras. Pedidos guardam nome, contato, CPF, endereço, itens e valores no banco privado. O CPF é restrito à gestão. Nenhum desses dados fica no localStorage. WhatsApp recebe as informações da mensagem quando o cliente abre o link, sem envio automático. Veja [o fluxo completo de checkout, pagamentos, agendamento e acesso](docs/checkout-orders.md).

As métricas de interação contam visualizações, adições ao carrinho e saídas para WhatsApp. Esses cliques são estimativas. O painel de pedidos acrescenta pedidos persistidos, valores com pagamento confirmado e situações de envio. Pix confirmado pela provedora e recebimentos manuais conferidos pelo administrador são identificados separadamente.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
```

Os testes exercitam adulteração de preços, quantidades inválidas, soma de itens duplicados, produtos inativos, localização obrigatória e cálculo em centavos, incluindo desconto vigente, alteração e remoção de promoções. As duas migrações são executadas em PostgreSQL local via PGlite para validar RLS, autorização, restrições de preços, transação, limpeza, métricas e limites. O Supabase real foi validado para Storage, políticas e login por senha, incluindo acesso ao painel, bloqueio de senha incorreta e logout. O script `scripts/check-admin-login.mjs` recebe a senha apenas pela variável temporária `ADMIN_BOOTSTRAP_PASSWORD` do processo de teste, sem gravá-la ou exibi-la.

O site anterior permanece em `index.html`, `assets/` e `build/` como referência histórica, sem ser servido pelo Next.js. Os ativos usados na loja estão em `public/assets/`. Em produção, use `npm run build` e `npm start` ou uma plataforma com suporte a Next.js, configure a origem HTTPS e as variáveis no servidor.
