import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  customerAddressSchema,
  orderRequestSchema,
  shippingBenefit,
  validDocument,
  withShippingBenefit,
} from "../lib/commerce-validation";

test("frete grátis respeita limite, desconto efetivo e diferença da modalidade premium", () => {
  assert.deepEqual(
    shippingBenefit(29999, false, [2316, 3500]).charges.map(
      (c) => c.charged_cents,
    ),
    [2316, 3500],
  );
  assert.deepEqual(
    shippingBenefit(30000, false, [3500, 2316]).charges.map(
      (c) => c.charged_cents,
    ),
    [1184, 0],
  );
  assert.equal(
    shippingBenefit(15000, true, [1000]).charges[0].charged_cents,
    0,
  );
  assert.equal(
    shippingBenefit(14999, true, [1000]).charges[0].charged_cents,
    1000,
  );
  const options = withShippingBenefit(
    [
      {
        id: "1",
        name: "PAC",
        company: "Correios",
        price_cents: 2316,
        min_days: 8,
        max_days: 12,
      },
    ],
    30000,
  );
  assert.equal(options[0].price_cents, 2316);
  assert.equal(options[0].subsidy_cents, 2316);
  assert.equal(options[0].charged_cents, 0);
});
test("checkout exige endereço, contato e CPF válido, rejeita totais e papéis enviados pelo cliente", () => {
  const address = {
    name: "Pessoa de Teste",
    email: "TESTE@example.com",
    phone: "(79) 99999-9999",
    document: "529.982.247-25",
    postal_code: "49039-241",
    street: "Rua de teste",
    number: "10",
    complement: "",
    neighborhood: "Centro",
    city: "Aracaju",
    state: "SE",
  };
  assert.equal(customerAddressSchema.parse(address).email, "teste@example.com");
  assert.equal(customerAddressSchema.parse(address).postal_code, "49039241");
  for (const value of ["11111111111", "52998224724", "", "01234567891"])
    assert.equal(validDocument(value), false);
  for (const field of [
    "name",
    "email",
    "phone",
    "document",
    "postal_code",
    "street",
    "number",
    "neighborhood",
    "city",
    "state",
  ])
    assert.equal(
      customerAddressSchema.safeParse({ ...address, [field]: "" }).success,
      false,
    );
  const request = {
    items: [
      { product_id: "11111111-1111-4111-8111-111111111111", quantity: 1 },
    ],
    address,
    quote_id: "22222222-2222-4222-8222-222222222222",
    service_id: null,
    payment_method: "whatsapp",
    idempotency_key: "33333333-3333-4333-8333-333333333333",
  };
  assert.equal(orderRequestSchema.safeParse(request).success, true);
  for (const field of [
    "total_cents",
    "shipping_cents",
    "payment_status",
    "owner_id",
    "role",
  ])
    assert.equal(
      orderRequestSchema.safeParse({ ...request, [field]: 1 }).success,
      false,
    );
});

test("banco protege dados pessoais, confirma Pix uma vez e não duplica trabalho concorrente", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    await pg.exec(
      await readFile(
        new URL("../supabase/migrations/003_commerce.sql", import.meta.url),
        "utf8",
      ),
    );
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      for (const table of [
        "orders",
        "shipping_quotes",
        "order_events",
        "order_jobs",
      ])
        await assert.rejects(
          pg.query(`select * from public.${table}`),
          /permission denied/,
        );
      await assert.rejects(
        pg.query("select public.claim_order_jobs()"),
        /permission denied/,
      );
      await assert.rejects(
        pg.query("select public.commerce_order_summary()"),
        /permission denied/,
      );
      await pg.exec("reset role");
    }
    await pg.exec("set role service_role");
    const id = "11111111-1111-4111-8111-111111111111";
    await pg.query(
      `insert into public.orders(id,guest_hash,customer_email,idempotency_key,request_hash,address,items,subtotal_cents,shipping_cents,total_cents,local,payment_method,payment_provider_id) values($1,'guest','test@example.com',$2,'request','{}','[]',30000,0,30000,false,'pix','payment-id')`,
      [id, "22222222-2222-4222-8222-222222222222"],
    );
    assert.equal(
      (
        await pg.query(
          "select * from public.order_jobs where kind='payment_sync'",
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      pg.query(
        "select public.confirm_order_payment($1,'other-payment',30000)",
        [id],
      ),
      /payment_mismatch/,
    );
    await assert.rejects(
      pg.query("select public.confirm_order_payment($1,'payment-id',1)", [id]),
      /payment_mismatch/,
    );
    for (const expected of [true, false, false])
      assert.equal(
        (
          await pg.query<{ confirmed: boolean }>(
            "select public.confirm_order_payment($1,'payment-id',30000) as confirmed",
            [id],
          )
        ).rows[0].confirmed,
        expected,
      );
    assert.equal(
      (await pg.query("select * from public.order_events where kind='payment'"))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await pg.query(
          "select * from public.order_jobs where kind='shipping_prepare'",
        )
      ).rows.length,
      1,
    );
    const first = await pg.query<{ id: string }>(
      "select * from public.claim_order_jobs(1)",
    );
    const second = await pg.query<{ id: string }>(
      "select * from public.claim_order_jobs(10)",
    );
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 1);
    assert.notEqual(first.rows[0].id, second.rows[0].id);
    assert.equal(
      (await pg.query("select * from public.claim_order_jobs(10)")).rows.length,
      0,
    );
    await pg.query(
      "update public.orders set payment_status='refunded' where id=$1",
      [id],
    );
    await assert.rejects(
      pg.query("select public.confirm_order_payment($1,'payment-id',30000)", [
        id,
      ]),
      /payment_already_refunded/,
    );
    await pg.query(
      "update public.orders set payment_status='pending', fulfillment_status='cancelled' where id=$1",
      [id],
    );
    await pg.query(
      "select public.confirm_order_payment($1,'payment-id',30000)",
      [id],
    );
    const cancelled = (
      await pg.query<{ fulfillment_status: string; needs_review: boolean }>(
        "select fulfillment_status,needs_review from public.orders",
      )
    ).rows[0];
    assert.equal(cancelled.fulfillment_status, "attention");
    assert.equal(cancelled.needs_review, true);
  } finally {
    await pg.close();
  }
});

test("resumo exclui cancelados das contagens, preserva pagamentos e restringe acesso", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public,auth to anon,authenticated,service_role;",
    );
    for (const migration of ["003_commerce.sql", "006_order_summary.sql"])
      await pg.exec(
        await readFile(
          new URL(`../supabase/migrations/${migration}`, import.meta.url),
          "utf8",
        ),
      );
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await assert.rejects(
        pg.query("select public.commerce_order_summary()"),
        /permission denied/,
      );
      await pg.exec("reset role");
    }
    await pg.exec("set role service_role");
    await pg.exec(`
      insert into public.orders(
        id, guest_hash, customer_email, idempotency_key, request_hash,
        address, items, subtotal_cents, shipping_cents, total_cents,
        local, payment_method, payment_status, fulfillment_status, needs_review
      )
      select gen_random_uuid(), 'guest', 'test@example.com', gen_random_uuid(),
        'request', '{}', '[]', amount, 0, amount, true, 'whatsapp',
        payment_status, fulfillment_status, needs_review
      from (values
        ('pending', 'awaiting_payment', 100, false),
        ('creating', 'awaiting_payment', 100, false),
        ('paid', 'freight_pending', 1000, false),
        ('paid', 'posted', 2000, false),
        ('paid', 'delivered', 3000, false),
        ('failed', 'attention', 400, true),
        ('pending', 'cancelled', 500, true),
        ('creating', 'cancelled', 600, true),
        ('paid', 'cancelled', 7000, true),
        ('refunded', 'cancelled', 8000, true)
      ) as fixtures(payment_status, fulfillment_status, amount, needs_review);
    `);
    const { rows } = await pg.query<{ summary: Record<string, number> }>(
      "select public.commerce_order_summary() as summary",
    );
    assert.deepEqual(rows[0].summary, {
      total: 6,
      paid_cents: 13000,
      pending: 2,
      to_post: 1,
      posted: 1,
      delivered: 1,
      attention: 1,
    });
  } finally {
    await pg.close();
  }
});
