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
  .select("id,active");
assert.ifError(error);
assert.ok(products.length > 0);
const { data: media, error: mediaError } = await server
  .from("product_media")
  .select("id,product_id,url,type");
assert.ifError(mediaError);
assert.ok(
  products
    .filter((p) => p.active)
    .every((p) =>
      media.some((m) => m.product_id === p.id && m.type === "image"),
    ),
);
const cover = await fetch(media[0].url, { method: "HEAD" });
assert.equal(cover.status, 200);
const publicRead = await anon
  .from("products")
  .select("id,name,price_cents,sale_price_cents");
assert.ifError(publicRead.error);
assert.ok(
  publicRead.data.every(
    (p) =>
      p.sale_price_cents === null ||
      (Number.isInteger(p.sale_price_cents) &&
        p.sale_price_cents > 0 &&
        p.sale_price_cents < p.price_cents),
  ),
);
assert.deepEqual(
  publicRead.data.map((p) => p.id).sort(),
  products
    .filter((p) => p.active)
    .map((p) => p.id)
    .sort(),
);
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
  `Supabase real: ${products.length} produtos, ${products.filter((p) => p.active).length} ativos, ${media.length} mídias no Storage, campos internos e tabelas administrativas protegidos, cadastro público desativado.`,
);
