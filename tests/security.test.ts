import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  aggregateCart,
  calculateQuote,
  cartSchema,
  checkoutSchema,
  checkoutMessage,
  productSchema,
} from "../lib/validation";
import type { AdminProduct } from "../lib/types";
const id = "00000000-0000-4000-8000-000000000011";
const product: AdminProduct = {
  id,
  slug: "livro-das-vogais",
  name: "Livro das Vogais",
  description: "Um livro para aprender brincando.",
  skills: [],
  price_cents: 6500,
  category: "Alfabetização",
  stock: 3,
  active: true,
  badge: null,
  media: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
test("checkout rejects client prices and malformed quantities", () => {
  assert.equal(
    cartSchema.safeParse({
      items: [{ product_id: id, quantity: 1, price_cents: 1 }],
    }).success,
    false,
  );
  for (const quantity of [0, -1, 1.5, 100, "1", null])
    assert.equal(
      cartSchema.safeParse({ items: [{ product_id: id, quantity }] }).success,
      false,
    );
  assert.equal(cartSchema.safeParse({ items: [] }).success, false);
});
test("checkout aggregates duplicates before validating stock", () => {
  assert.throws(
    () =>
      calculateQuote(
        [
          { product_id: id, quantity: 2 },
          { product_id: id, quantity: 2 },
        ],
        [product],
      ),
    /indisponível/,
  );
  assert.throws(
    () =>
      aggregateCart([
        { product_id: id, quantity: 99 },
        { product_id: id, quantity: 1 },
      ]),
    /máxima/,
  );
  const q = calculateQuote(
    [
      { product_id: id, quantity: 1 },
      { product_id: id, quantity: 2 },
    ],
    [product],
  );
  assert.equal(q.total_cents, 19500);
  assert.equal(q.items.length, 1);
});
test("checkout only uses current active records and integer cents", () => {
  assert.throws(
    () =>
      calculateQuote(
        [{ product_id: id, quantity: 1 }],
        [{ ...product, active: false }],
      ),
    /disponível/,
  );
  assert.throws(
    () => calculateQuote([{ product_id: id, quantity: 1 }], []),
    /disponível/,
  );
  const quote = calculateQuote(
    [{ product_id: id, quantity: 3 }],
    [{ ...product, price_cents: 1099 }],
  );
  assert.equal(quote.total_cents, 3297);
});
test("delivery is mandatory, coordinates accept zero, text is sanitized", () => {
  const items = [{ product_id: id, quantity: 1 }];
  assert.equal(checkoutSchema.safeParse({ items }).success, false);
  assert.equal(
    checkoutSchema.safeParse({
      items,
      delivery: { name: "Ana", method: "address", address: "", complement: "" },
    }).success,
    false,
  );
  assert.equal(
    checkoutSchema.safeParse({
      items,
      delivery: {
        name: "Ana",
        method: "location",
        address: "",
        complement: "",
      },
    }).success,
    false,
  );
  const valid = checkoutSchema.parse({
    items,
    delivery: {
      name: "<Ana>\n",
      method: "location",
      latitude: 0,
      longitude: 0,
      address: "",
      complement: "",
    },
  });
  assert.equal(valid.delivery.name, "Ana");
  assert.match(
    checkoutMessage(calculateQuote(items, [product]), valid.delivery),
    /maps.google.com\/\?q=0,0/,
  );
});
test("admin input rejects unsafe slugs and active products without image", () => {
  const draft = { ...product, media: [] };
  const { created_at, updated_at, ...input } = draft;
  assert.equal(
    productSchema.safeParse({ ...input, slug: "<script>" }).success,
    false,
  );
  assert.equal(productSchema.safeParse(input).success, false);
  assert.equal(
    productSchema.safeParse({ ...input, active: false }).success,
    true,
  );
});
test("Postgres migration: RLS, roles, transactions, metrics and cleanup", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to authenticated;`,
    );
    // PGlite has built-in gen_random_uuid; pgcrypto provisioning itself belongs to Supabase.
    const sql = (
      await readFile(
        new URL("../supabase/migrations/001_store.sql", import.meta.url),
        "utf8",
      )
    ).replace("create extension if not exists pgcrypto;", "");
    await pg.exec(sql);
    const admin = "00000000-0000-4000-8000-000000000001",
      other = "00000000-0000-4000-8000-000000000002";
    await pg.exec(
      `insert into auth.users(id) values('${admin}'),('${other}');insert into public.admins(user_id) values('${admin}');`,
    );
    const payload = {
      id,
      slug: "livro-das-vogais",
      name: "Livro das Vogais",
      description: "Livro colorido para aprender vogais.",
      price_cents: 6500,
      category: "Alfabetização",
      stock: 3,
      active: true,
      badge: null,
      skills: ["Atenção"],
      media: [
        {
          id: "00000000-0000-4000-8000-000000000021",
          type: "image",
          url: "https://example.supabase.co/storage/v1/object/public/products-media/a.webp",
          position: 0,
        },
      ],
    };
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}';`,
    );
    await assert.rejects(
      pg.query("select public.save_product($1::jsonb)", [
        JSON.stringify(payload),
      ]),
      /Forbidden/,
    );
    await assert.rejects(
      pg.exec(`insert into public.admins(user_id) values('${other}')`),
      /permission denied/,
    );
    await pg.exec(`set request.jwt.claim.sub='${admin}';`);
    await pg.query("select public.save_product($1::jsonb)", [
      JSON.stringify(payload),
    ]);
    assert.equal(
      (await pg.query("select * from public.products")).rows.length,
      1,
    );
    await assert.rejects(
      pg.query("select public.save_product($1::jsonb)", [
        JSON.stringify({
          ...payload,
          name: "Should roll back",
          media: [{ ...payload.media[0], position: -1 }],
        }),
      ]),
      /check constraint/,
    );
    assert.equal(
      (await pg.query<{ name: string }>("select name from public.products"))
        .rows[0].name,
      "Livro das Vogais",
    );
    await pg.exec(`set role anon;set request.jwt.claim.sub='';`);
    assert.equal(
      (await pg.query("select id,name,price_cents from public.products")).rows
        .length,
      1,
    );
    assert.equal(
      (await pg.query("select id from public.product_media")).rows.length,
      1,
    );
    await assert.rejects(
      pg.query("select stock from public.products"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select * from public.analytics_events"),
      /permission denied/,
    );
    await assert.rejects(
      pg.exec("delete from public.products"),
      /permission denied/,
    );
    await assert.rejects(
      pg.query("select public.admin_metrics()"),
      /permission denied/,
    );
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${other}';`,
    );
    assert.equal(
      (await pg.query("select * from public.products")).rows.length,
      0,
    );
    await assert.rejects(
      pg.exec(
        `insert into storage.objects(bucket_id,name) values('products-media','rogue.webp')`,
      ),
      /row-level security/,
    );
    await pg.exec(
      `set request.jwt.claim.sub='${admin}';update public.products set active=false;`,
    );
    await pg.exec("set role anon;");
    assert.equal(
      (await pg.query("select id from public.products")).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("select id from public.product_media")).rows.length,
      0,
    );
    await pg.exec("set role service_role;");
    for (const expected of [true, true, false]) {
      const r = await pg.query<{ allowed: boolean }>(
        "select public.consume_rate_limit('test',2,60) as allowed",
      );
      assert.equal(r.rows[0].allowed, expected);
    }
    await pg.exec(
      `insert into public.analytics_events(kind,product_ids) values('view',array['${id}'::uuid]),('whatsapp',array['${id}'::uuid]);`,
    );
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${admin}';`,
    );
    const metrics = await pg.query<{
      data: {
        total_products: number;
        views: number;
        whatsapp_clicks: number;
        daily: unknown[];
      };
    }>("select public.admin_metrics() as data");
    assert.equal(metrics.rows[0].data.total_products, 1);
    assert.equal(metrics.rows[0].data.views, 1);
    assert.equal(metrics.rows[0].data.whatsapp_clicks, 1);
    assert.equal(metrics.rows[0].data.daily.length, 14);
    await pg.exec("delete from public.products;reset role;");
    assert.equal(
      (await pg.query("select * from public.media_cleanup")).rows.length,
      1,
    );
    await pg.exec("set role service_role;");
    assert.equal(
      (await pg.query("select * from public.claim_media_cleanup()")).rows
        .length,
      1,
    );
    await pg.exec(
      `set role authenticated;set request.jwt.claim.sub='${admin}';`,
    );
    await assert.rejects(
      pg.query("select public.save_product($1::jsonb)", [
        JSON.stringify(payload),
      ]),
      /Media expired/,
    );
    await pg.exec("reset role;");
    await pg.exec(
      `delete from public.admins where user_id='${admin}';set role authenticated;set request.jwt.claim.sub='${admin}';`,
    );
    await assert.rejects(
      pg.query("select public.save_product($1::jsonb)", [
        JSON.stringify(payload),
      ]),
      /Forbidden/,
    );
  } finally {
    await pg.close();
  }
});
