# Acesso dos clientes

A compra não exige cadastro. A página `/conta` oferece email e senha para clientes já cadastrados. Cadastro e acesso por link aparecem quando `CUSTOMER_AUTH_ENABLED=true`. Os pedidos deste navegador continuam acessíveis pela sessão de visitante, administrada pelo módulo de pedidos.

As rotas de cliente usam Supabase Auth exclusivamente no backend. Os cookies são HttpOnly, SameSite=Lax e Secure em produção. Sessões só dão acesso aos pedidos depois de confirmar o email. O cliente não recebe tokens do Supabase em respostas JSON. Nenhuma dessas rotas escreve na tabela `admins` ou aceita papel, ID de usuário ou confirmação de email enviados pelo navegador.

## Configuração necessária para email

No Supabase Auth, habilite o provedor Email, o cadastro de novos usuários e a confirmação de email. Habilitar cadastro cria apenas usuários comuns. Administradores continuam dependendo do cadastro manual na tabela `admins`.

Configure um SMTP de produção antes de ativar `CUSTOMER_AUTH_ENABLED`. O envio padrão do Supabase não é apropriado para clientes de uma loja. O login por senha de contas existentes continua funcionando com a flag desligada.

Defina Site URL como `https://www.recursosdatiacris.com.br` e permita o redirecionamento para `https://www.recursosdatiacris.com.br/auth/callback`. Para testes locais, adicione `http://127.0.0.1:3000/auth/callback`. O fluxo PKCE com o modelo padrão de email retorna a esse callback. O cliente deve abrir o link no mesmo navegador em que iniciou o acesso.

Para permitir confirmar o email em outro navegador, ajuste os modelos de confirmação e Magic Link para o seguinte destino com token hash. O endpoint verifica o token no backend e remove o segredo da URL ao redirecionar:

```html
<a
  href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/pedidos"
  >Confirmar meu acesso</a
>
```

O botão “Esqueci minha senha” envia um link de acesso para uma conta existente. Ele não cria contas nem muda a senha. O retorno da API é igual para emails existentes e desconhecidos. A senha pode continuar sendo usada nas próximas entradas.

## Google e Apple

Os botões só aparecem com `CUSTOMER_GOOGLE_AUTH_ENABLED=true` ou `CUSTOMER_APPLE_AUTH_ENABLED=true`, respectivamente. Ative a flag apenas depois de configurar e testar o respectivo provedor no Supabase.

Google exige um cliente OAuth Web configurado no Google Cloud, com Client ID, Client Secret, tela de consentimento e o callback fornecido pelo Supabase (`https://<projeto>.supabase.co/auth/v1/callback`). Essas credenciais ficam no Supabase, não no frontend da loja.

Apple exige a configuração Sign in with Apple no Apple Developer: identificador apropriado para web, domínio e URL de retorno, Team ID, Key ID e segredo do cliente. O segredo precisa ser renovado conforme a validade exigida pela Apple. Emails privados da Apple precisam ser considerados ao associar pedidos de visitante a uma conta; nunca vincule um pedido apenas porque alguém digitou o mesmo email.

## Operação e testes

Login, cadastro, envio de link e início de OAuth são POSTs com verificação de origem e limitação de tentativas. O retorno pós-login é restrito a páginas de conta, carrinho e pedidos. Callbacks não aceitam redirecionamentos externos ou para a administração. O controle de acesso da administração existente permanece independente das permissões de cliente.

Os testes automatizados de autenticação usam dados fictícios e não enviam emails. Valide cadastro, confirmação, entrada, saída e OAuth com contas de teste antes de habilitar cada opção em produção.

Fontes oficiais: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Email e senha](https://supabase.com/docs/guides/auth/passwords), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple).
