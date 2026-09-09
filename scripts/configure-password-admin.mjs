import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

// Supply this variable to this process only. Never save the password in source or .env.
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
if (!password || password.length < 8)
  throw new Error(
    "Informe uma senha de pelo menos 8 caracteres via ADMIN_BOOTSTRAP_PASSWORD.",
  );
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Configure o Supabase antes de criar o acesso.");
const email = process.env.ADMIN_AUTH_EMAIL || "admin@recursosdatiacris.invalid";
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
let existing;
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error)
    throw new Error(
      `Não foi possível conferir a conta: ${error.code || error.status}`,
    );
  existing = data.users.find((user) => user.email === email);
  if (existing || data.users.length < 1000) break;
}
const result = existing
  ? await client.auth.admin.updateUserById(existing.id, { password })
  : await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Administração Tia Cris" },
    });
if (result.error || !result.data.user)
  throw new Error(
    `Não foi possível configurar a conta: ${result.error?.code || result.error?.status}`,
  );
const { error: roleError } = await client
  .from("admins")
  .upsert({ user_id: result.data.user.id });
if (roleError)
  throw new Error(`Não foi possível autorizar a conta: ${roleError.code}`);
const envPath = new URL("../.env.local", import.meta.url);
const contents = await readFile(envPath, "utf8");
const nextContents = /^ADMIN_AUTH_EMAIL=.*$/m.test(contents)
  ? contents.replace(/^ADMIN_AUTH_EMAIL=.*$/m, `ADMIN_AUTH_EMAIL=${email}`)
  : contents.trimEnd() + `\nADMIN_AUTH_EMAIL=${email}\n`;
await writeFile(envPath, nextContents);
console.log(
  "Acesso por senha configurado no Supabase. Identificador salvo somente no servidor. Senha não gravada em arquivos.",
);
