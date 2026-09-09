# Recursos da Tia Cris

Loja em Next.js 16, React, Supabase Auth, Postgres e Storage. Catálogo, detalhe com galeria, busca, filtros, carrinho e checkout por WhatsApp. Gestão em `/admin/login`, sem links no site público.

O login administrativo solicita **somente a senha**. A conta dedicada já está criada no Supabase e autorizada em `admins`. Seu identificador interno fica em `ADMIN_AUTH_EMAIL`, exclusivo do servidor. A senha é validada pelo Supabase, sem cópia no código, no `.env.local` ou no navegador. O cadastro público continua desativado.

## Executar localmente

```powershell
npm install
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Ao clonar o repositório, copie `.env.example` para `.env.local` e preencha as variáveis antes de usar o painel. Se `.env.local` já existir, preserve sua configuração. Abra http://127.0.0.1:3000. O `.env.local` é ignorado pelo Git. As chaves do Supabase não são enviadas ao navegador. Use sempre a mesma origem configurada em `APP_ORIGIN`.

`DEMO_MODE=true` seleciona explicitamente a prévia em desenvolvimento, mesmo com o Supabase configurado. Os 36 produtos com fotos reais vieram do catálogo existente. Os cinco produtos que só tinham imagens ilustrativas foram excluídos da importação. Os preços são históricos. Recursos ativos ficam sempre disponíveis para pedidos, sem controle de quantidade em estoque. Não existe login administrativo alternativo, senha padrão ou bypass de autenticação. Métricas demonstrativas não são armazenadas nem apresentadas como reais.

## Conectar o Supabase

1. Preencha `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em `.env.local`. Não use prefixo `NEXT_PUBLIC_`. Confirme `WHATSAPP_NUMBER`, herdado do site original como `557999226515`.
2. Execute o conteúdo de `supabase/migrations/001_store.sql` no SQL Editor do seu projeto Supabase. A migração cria tabelas, índices, funções, políticas RLS e bucket. Execute uma única vez em um projeto novo. Projetos com tabelas homônimas precisam de migração adaptada antes da execução.
3. Para uma nova instalação, desative o cadastro público de usuários em Authentication, crie a conta administrativa manualmente e defina seu e-mail interno em `ADMIN_AUTH_EMAIL` no servidor. Depois autorize o UUID dessa conta no SQL Editor. Nesta instalação, a conta e a restrição já estão configuradas:

```sql
insert into public.admins(user_id) values ('UUID-DA-CONTA-CRIADA');
```

4. Opcionalmente, execute `npm run seed` para enviar as fotos existentes ao Storage e importar o catálogo. Todos os produtos são importados **inativos**, para que você revise os preços antes de publicá-los. O importador preserva registros já cadastrados. A importação inicial já foi executada neste projeto.
5. Acesse `/admin/login`, entre somente com sua senha, revise os recursos e ative os produtos. Defina `DEMO_MODE=false` ao concluir a configuração. Se necessário, reinicie `npm run dev` depois de alterar as variáveis.

Para revogar a gestão, remova o UUID de `public.admins`. A autorização é conferida novamente em cada requisição, mesmo que a sessão Auth ainda seja válida. Não é suficiente saber o endereço do painel.

## Segurança e comportamento

Todas as leituras e escritas de dados da aplicação passam pelo backend. O envio de arquivos usa uma autorização temporária emitida pelo servidor, com validação antes de salvar o produto. O cliente guarda somente IDs e quantidades do pedido no localStorage. Os preços públicos de venda são enviados para exibição; são públicos por definição. O preço usado para checkout e o status ativo do produto são consultados novamente no servidor. Os valores monetários usam centavos inteiros. IDs duplicados são somados antes de conferir o limite de 99 unidades por recurso em cada pedido.

Sessões Auth usam cookies HttpOnly, SameSite e Secure em produção. A API valida a origem exata, formato, tamanho e conteúdo dos formulários. A sessão é verificada com `getUser()` e o papel é consultado na tabela `admins`. O banco reforça as permissões por RLS, com leitura anônima apenas de produtos ativos e sem acesso à coluna de estoque. O service role é usado exclusivamente pelo servidor para catálogo, métricas recebidas, limites e limpeza; operações administrativas de produto usam também a sessão do admin e RLS.

Os limites de requisição são persistidos no Postgres quando conectado. Por padrão, ignoram cabeçalhos de IP enviados pelo solicitante e usam um limite compartilhado. Configure `TRUST_PROXY_HEADERS=true` somente se um proxy confiável substituir `x-forwarded-for` antes de encaminhar as requisições. Sem essa garantia, mantenha `false`. Ajuste limites e proxy conforme o volume real da loja.

As fotos e vídeos de produtos são públicos no bucket `products-media`. Não envie dados pessoais ou documentos particulares para ele. O painel tem botões separados para anexar fotos (JPG, PNG, WebP) e vídeos (MP4, WebM), com progresso e limite de 20 arquivos por produto e 20 MB por arquivo. A galeria permite navegar por setas, teclado e deslize sobre fotos, além de miniaturas na página do produto. Vídeos têm controles e não começam automaticamente.

O backend exige admin e emite uma URL temporária para um único arquivo, sem permissão de sobrescrita. O navegador transfere o arquivo diretamente ao Storage para respeitar o limite de requisição da hospedagem. A conclusão retorna ao backend, que confere usuário, caminho, tamanho real, MIME e assinatura do arquivo antes de emitir uma prova de validação. O salvamento de novas mídias exige essa prova. Nenhuma chave do Supabase é enviada ao frontend. O cadastro e a ordem das mídias são gravados na mesma transação. A exclusão de referências enfileira a limpeza; uploads abandonados ficam elegíveis após 24 horas e falhas permanecem para nova tentativa.

O checkout valida os preços e o status ativo no momento da preparação. Não há controle, reserva ou baixa de estoque: todos os recursos ativos aceitam pedidos. A coluna `stock` permanece no banco por compatibilidade com a migração original, mas não é exibida nem limita compras; o backend envia zero ao salvar pela RPC legada. Endereço e coordenadas não são persistidos em banco ou localStorage: são usados na mensagem, onde passam a ser compartilhados com WhatsApp/Meta quando o cliente abre o link. Não há envio automático de mensagem.

As métricas contam visualizações, adições ao carrinho e cliques de saída para o WhatsApp. O gráfico mostra 14 dias; os indicadores de interação mostram 30 dias. Um clique não comprova mensagem enviada ou venda concluída. Há rate limit, deduplicação por evento e redução de visualizações repetidas na mesma aba, mas métricas de navegador são estimativas e não auditoria financeira.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
```

Os testes exercitam adulteração de preços, quantidades inválidas, soma de itens duplicados, produtos inativos, localização obrigatória e cálculo em centavos. A migração é executada em PostgreSQL local via PGlite para validar RLS, autorização, transação, limpeza, métricas e limites. O Supabase real foi validado para Storage, políticas e login por senha, incluindo acesso ao painel, bloqueio de senha incorreta e logout. O script `scripts/check-admin-login.mjs` recebe a senha apenas pela variável temporária `ADMIN_BOOTSTRAP_PASSWORD` do processo de teste, sem gravá-la ou exibi-la.

O site anterior permanece em `index.html`, `assets/` e `build/` como referência histórica, sem ser servido pelo Next.js. Os ativos usados na loja estão em `public/assets/`. Em produção, use `npm run build` e `npm start` ou uma plataforma com suporte a Next.js, configure a origem HTTPS e as variáveis no servidor.
