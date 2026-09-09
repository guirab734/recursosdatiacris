import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const anon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  options,
);
const { data: products, error } = await server
  .from("products")
  .select("id,active,stock");
assert.ifError(error);
assert.equal(products.length, 36);
assert.ok(products.every((p) => p.stock === 0 && !p.active));
const { data: media, error: mediaError } = await server
  .from("product_media")
  .select("id,url");
assert.ifError(mediaError);
assert.equal(media.length, 36);
const cover = await fetch(media[0].url, { method: "HEAD" });
assert.equal(cover.status, 200);
const publicRead = await anon.from("products").select("id,name,price_cents");
assert.ifError(publicRead.error);
assert.equal(publicRead.data.length, 0);
for (const table of [
  "admins",
  "analytics_events",
  "rate_limits",
  "media_cleanup",
]) {
  const result = await anon.from(table).select("*");
  assert.equal(result.error?.code, "42501");
}
const inventory = await anon.from("products").select("stock");
assert.equal(inventory.error?.code, "42501");
const publicMetrics = await anon.rpc("admin_metrics");
assert.equal(publicMetrics.error?.code, "42501");
const { data: settings, error: settingsError } = await anon.auth.getSession();
assert.ifError(settingsError);
assert.equal(settings.session, null);
const settingsResponse = await fetch(
  process.env.SUPABASE_URL + "/auth/v1/settings",
  { headers: { apikey: process.env.SUPABASE_ANON_KEY } },
);
assert.equal(settingsResponse.status, 200);
const authSettings = await settingsResponse.json();
assert.equal(authSettings.disable_signup, true);
console.log(
  "Supabase real: 36 produtos inativos, 36 fotos no Storage, estoque privado, tabelas administrativas protegidas, cadastro público desativado.",
);
