import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const email = process.argv[2];
if (!email || !/^\S+@\S+\.\S+$/.test(email))
  throw new Error("Informe o e-mail escolhido para a administradora.");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const password = randomBytes(24).toString("base64url") + "!9aA";
const { data, error } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: "Administração Tia Cris" },
});
if (error) throw error;
const { error: roleError } = await client
  .from("admins")
  .insert({ user_id: data.user.id });
if (roleError) throw roleError;
await mkdir(new URL("../.local/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.local/acesso-admin.txt", import.meta.url),
  `ACESSO ADMINISTRATIVO DA LOJA\n\nEndereço: http://127.0.0.1:3000/admin/login\nE-mail: ${email}\nSenha: ${password}\n\nSenha gerada somente para sua conta. Guarde em um gerenciador de senhas e remova este arquivo depois. O arquivo está ignorado pelo Git e não é servido pelo site.\n`,
  { flag: "wx", mode: 0o600 },
);
console.log(
  "Conta administrativa criada. Credenciais salvas somente em .local/acesso-admin.txt. Nenhum e-mail enviado.",
);
