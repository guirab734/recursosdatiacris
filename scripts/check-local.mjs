import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000";
const get = (path) => fetch(base + path, { redirect: "manual" });
const post = (path, data, origin = base) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(data),
  });
const results = [];
for (const path of ["/", "/carrinho", "/admin/login"]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  results.push(path + ": 200");
}
const catalogResponse = await get("/api/products");
assert.equal(catalogResponse.status, 200);
const catalog = await catalogResponse.json();
assert.ok(catalog.products.length > 0);
assert.ok(catalog.products.every((p) => !("stock" in p) && !("active" in p)));
results.push("Catálogo público sem estoque exato nem status interno");
const p = catalog.products[0];
assert.equal((await get("/produto/" + p.slug)).status, 200);
assert.equal((await get("/produto/recurso-inexistente")).status, 404);
for (const path of ["/api/admin/products", "/api/admin/metrics"])
  assert.equal((await get(path)).status, 401);
const admin = await get("/admin");
assert.ok([303, 307, 308].includes(admin.status));
assert.ok(admin.headers.get("location")?.endsWith("/admin/login"));
for (const path of ["/api/admin/products", "/api/admin/media"])
  assert.equal((await post(path, {})).status, 401);
assert.equal(
  (
    await post(
      "/api/cart",
      { items: [{ product_id: p.id, quantity: 1 }] },
      "https://untrusted.example",
    )
  ).status,
  403,
);
assert.equal(
  (
    await post("/api/cart", {
      items: [{ product_id: p.id, quantity: 1, price_cents: 1 }],
    })
  ).status,
  400,
);
assert.equal(
  (await post("/api/cart", { items: [{ product_id: p.id, quantity: -1 }] }))
    .status,
  400,
);
assert.equal(
  (await post("/api/checkout", { items: [{ product_id: p.id, quantity: 1 }] }))
    .status,
  400,
);
results.push(
  "Rotas admin, CSRF, preços adulterados e entrega obrigatória protegidos",
);
if (catalog.demo) {
  const quoteResponse = await post("/api/cart", {
    items: [{ product_id: p.id, quantity: 2 }],
  });
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  assert.equal(quote.total_cents, p.price_cents * 2);
  const invalidStock = await post("/api/cart", {
    items: [{ product_id: p.id, quantity: 99 }],
  });
  assert.equal(invalidStock.status, 409);
  const checkout = await post("/api/checkout", {
    items: [{ product_id: p.id, quantity: 2 }],
    delivery: {
      name: "Teste local",
      method: "address",
      address: "Rua de teste 123, Aracaju, SE, 49000-000",
      complement: "",
    },
  });
  assert.equal(checkout.status, 200);
  const result = await checkout.json();
  assert.equal(result.total_cents, quote.total_cents);
  assert.ok(result.whatsapp_url.startsWith("https://wa.me/"));
  assert.ok(result.message.includes("PRÉVIA LOCAL"));
  assert.ok(result.message.includes("Rua de teste 123"));
  results.push("Checkout demonstração validado. Nenhuma mensagem enviada.");
}
// Secret source files and historical HTML must not be publicly served.
for (const path of [
  "/.env.local",
  "/lib/catalog-seed.json",
  "/supabase/migrations/001_store.sql",
  "/index.html",
])
  assert.equal((await get(path)).status, 404, path);
results.push("Credenciais, seed e código do banco fora das rotas públicas");
console.log(results.join("\n"));
