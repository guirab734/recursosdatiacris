import { createClient } from "@supabase/supabase-js";
if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  !/^[a-f0-9]{64}$/.test(process.env.CRON_SECRET || "")
)
  throw new Error(
    "Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e CRON_SECRET no ambiente seguro.",
  );
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { error } = await client.rpc("commerce_configure_cron", {
  cron_secret: process.env.CRON_SECRET,
});
if (error)
  throw new Error(
    `Não foi possível configurar o agendador (${error.code}). Aplique antes a migração 004.`,
  );
const status = await client.rpc("commerce_scheduler_status");
if (status.error || !status.data?.active)
  throw new Error("O agendador ainda não está ativo.");
console.log(
  "Acompanhamento dos pedidos ativado a cada 5 minutos. Segredo guardado no Supabase Vault.",
);
