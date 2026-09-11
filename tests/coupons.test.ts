import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  couponAmounts,
  couponAvailable,
  couponCodeSchema,
  couponSchema,
} from "../lib/coupon-validation";
import type { AppliedCoupon, Coupon } from "../lib/coupon-types";

test("coupon validation rejects injected state and preserves integer-cent discount boundaries", () => {
  const input = {
    code: " promoção ",
    kind: "percentage",
    amount: 10,
    active: true,
  };
  assert.equal(couponSchema.safeParse(input).success, false);
  assert.equal(couponCodeSchema.parse(" desconto-10 "), "DESCONTO-10");
  for (const code of [
    "A",
    "<script>",
    "ABC,active.eq.true",
    "A".repeat(33),
    "_TESTE",
    "TESTE%",
  ])
    assert.equal(couponCodeSchema.safeParse(code).success, false);
  const valid = { ...input, code: "DESCONTO10" };
  for (const injected of [
    { uses_count: 0 },
    { id: randomUUID() },
    { role: "admin" },
    { discount_cents: 10000 },
  ])
    assert.equal(
      couponSchema.safeParse({ ...valid, ...injected }).success,
      false,
    );
  for (const amount of [0, 100, 1.5, "10"])
    assert.equal(couponSchema.safeParse({ ...valid, amount }).success, false);
  for (const kind of ["fixed", "final_total"])
    assert.equal(
      couponSchema.safeParse({ ...valid, kind, amount: 24 }).success,
      false,
    );
  assert.equal(
    couponSchema.safeParse({
      ...valid,
      starts_at: "2026-09-12T00:00:00Z",
      expires_at: "2026-09-11T00:00:00Z",
    }).success,
    false,
  );

  assert.deepEqual(
    couponAmounts(10000, 2316, {
      code: "25TESTE",
      kind: "final_total",
      amount: 25,
    }),
    {
      discount_cents: 12291,
      total_cents: 25,
      discounted_subtotal_cents: 25,
    },
  );
  assert.deepEqual(
    couponAmounts(101, 10, {
      code: "PERCENTUAL",
      kind: "percentage",
      amount: 33,
    }),
    {
      discount_cents: 33,
      total_cents: 78,
      discounted_subtotal_cents: 68,
    },
  );
  assert.deepEqual(
    couponAmounts(500, 200, { code: "FIXO", kind: "fixed", amount: 1000 }),
    {
      discount_cents: 475,
      total_cents: 225,
      discounted_subtotal_cents: 25,
    },
  );
  assert.equal(
    couponAmounts(25, 0, { code: "PERCENTUAL", kind: "percentage", amount: 99 })
      .total_cents,
    25,
  );
  assert.equal(couponAmounts(10000, 2316, null).total_cents, 12316);

  const now = Date.parse("2026-09-11T12:00:00Z");
  const coupon: Coupon = {
    ...couponSchema.parse(valid),
    id: randomUUID(),
    uses_count: 0,
    created_at: new Date(now).toISOString(),
    min_subtotal_cents: 10000,
    max_uses: 1,
    starts_at: "2026-09-11T12:00:00Z",
    expires_at: "2026-09-12T12:00:00Z",
  };
  assert.equal(couponAvailable(coupon, 10000, now), true);
  assert.equal(couponAvailable(coupon, 9999, now), false);
  assert.equal(
    couponAvailable({ ...coupon, active: false }, 10000, now),
    false,
  );
  assert.equal(
    couponAvailable({ ...coupon, uses_count: 1 }, 10000, now),
    false,
  );
  assert.equal(couponAvailable(coupon, 10000, now - 1), false);
  assert.equal(
    couponAvailable(coupon, 10000, Date.parse(coupon.expires_at!)),
    false,
  );
});

test("coupon migration protects writes, recomputes amounts and consumes uses atomically with the order", async () => {
  const pg = new PGlite();
  const migration = await readFile(
    new URL("../supabase/migrations/005_coupons.sql", import.meta.url),
    "utf8",
  );
  type InsertOptions = {
    id?: string;
    idempotency?: string;
    subtotal?: number;
    shipping?: number;
    total?: number;
    discount?: number;
    snapshot?: unknown;
    couponId?: string | null;
    method?: "pix" | "whatsapp";
    providerId?: string | null;
  };
  const publicCoupon = (coupon: Coupon): AppliedCoupon => ({
    code: coupon.code,
    kind: coupon.kind,
    amount: coupon.amount,
  });
  async function addCoupon(code: string, options: Partial<Coupon> = {}) {
    const result = await pg.query<Coupon>(
      `insert into public.coupons(code,kind,amount,active,min_subtotal_cents,max_uses,starts_at,expires_at)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        code,
        options.kind ?? "percentage",
        options.amount ?? 10,
        options.active ?? true,
        options.min_subtotal_cents ?? 0,
        options.max_uses ?? null,
        options.starts_at ?? null,
        options.expires_at ?? null,
      ],
    );
    return result.rows[0];
  }
  async function insertOrder(
    coupon: Coupon | null,
    options: InsertOptions = {},
  ) {
    const subtotal = options.subtotal ?? 10000;
    const shipping = options.shipping ?? 2316;
    const amounts = couponAmounts(
      subtotal,
      shipping,
      coupon ? publicCoupon(coupon) : null,
    );
    const id = options.id ?? randomUUID();
    await pg.query(
      `insert into public.orders(id,guest_hash,customer_email,idempotency_key,request_hash,address,items,
        subtotal_cents,shipping_cents,total_cents,local,payment_method,payment_provider_id,coupon_id,coupon,discount_cents)
       values($1,'guest','test@example.com',$2,'request','{}','[]',$3,$4,$5,false,$6,$7,$8,$9::jsonb,$10)`,
      [
        id,
        options.idempotency ?? randomUUID(),
        subtotal,
        shipping,
        options.total ?? amounts.total_cents,
        options.method ?? "whatsapp",
        options.providerId ?? null,
        options.couponId !== undefined
          ? options.couponId
          : (coupon?.id ?? null),
        options.snapshot !== undefined
          ? JSON.stringify(options.snapshot)
          : coupon
            ? JSON.stringify(publicCoupon(coupon))
            : null,
        options.discount ?? amounts.discount_cents,
      ],
    );
    return id;
  }
  async function uses(id: string) {
    return (
      await pg.query<{ uses_count: number }>(
        "select uses_count from public.coupons where id=$1",
        [id],
      )
    ).rows[0].uses_count;
  }
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
    const historical = randomUUID();
    await pg.query(
      `insert into public.orders(id,guest_hash,customer_email,idempotency_key,request_hash,address,items,subtotal_cents,shipping_cents,total_cents,local,payment_method)
       values($1,'old','old@example.com',$2,'old','{}','[]',1,0,1,false,'whatsapp')`,
      [historical, randomUUID()],
    );
    await pg.exec(migration);
    assert.equal(
      (
        await pg.query<{ total_cents: number }>(
          "select total_cents from orders where id=$1",
          [historical],
        )
      ).rows[0].total_cents,
      1,
    );
    assert.equal(
      (
        await pg.query<{ relrowsecurity: boolean }>(
          "select relrowsecurity from pg_class where oid='public.coupons'::regclass",
        )
      ).rows[0].relrowsecurity,
      true,
    );
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      for (const sql of [
        "select * from public.coupons",
        "insert into public.coupons(code,kind,amount) values('HACK','fixed',25)",
        "update public.coupons set active=true",
        "delete from public.coupons",
        "select public.commerce_apply_coupon()",
      ])
        await assert.rejects(pg.query(sql), /permission denied/);
      await pg.exec("reset role");
    }
    await pg.exec("set role service_role");
    const seeded = (
      await pg.query<Coupon>(
        "select * from public.coupons where code='25TESTE'",
      )
    ).rows[0];
    assert.equal(seeded.kind, "final_total");
    assert.equal(seeded.amount, 25);
    assert.equal(seeded.max_uses, 1);
    assert.equal(seeded.active, true);

    const paidId = await insertOrder(seeded, {
      method: "pix",
      providerId: "vel_coupon_test",
    });
    const paidOrder = (
      await pg.query<{ total_cents: number; discount_cents: number }>(
        "select total_cents,discount_cents from orders where id=$1",
        [paidId],
      )
    ).rows[0];
    assert.deepEqual(paidOrder, { total_cents: 25, discount_cents: 12291 });
    assert.equal(await uses(seeded.id), 1);
    await assert.rejects(insertOrder(seeded), /coupon_unavailable/);
    await assert.rejects(
      pg.query("select public.confirm_order_payment($1,'vel_coupon_test',1)", [
        paidId,
      ]),
      /payment_mismatch/,
    );
    assert.equal(
      (
        await pg.query<{ paid: boolean }>(
          "select public.confirm_order_payment($1,'vel_coupon_test',25) as paid",
          [paidId],
        )
      ).rows[0].paid,
      true,
    );
    assert.equal(
      (
        await pg.query<{ paid: boolean }>(
          "select public.confirm_order_payment($1,'vel_coupon_test',25) as paid",
          [paidId],
        )
      ).rows[0].paid,
      false,
    );
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "select count(*)::integer as count from order_jobs where order_id=$1 and kind='shipping_prepare'",
          [paidId],
        )
      ).rows[0].count,
      1,
    );
    await pg.query(
      "update public.orders set fulfillment_status='cancelled' where id=$1",
      [paidId],
    );
    assert.equal(
      await uses(seeded.id),
      1,
      "cancellation does not restore a consumed use",
    );

    for (const invalid of [
      { code: "DESATIVADO", active: false },
      { code: "EXPIRADO", expires_at: "2000-01-01T00:00:00Z" },
      { code: "FUTURO", starts_at: "2999-01-01T00:00:00Z" },
      { code: "MINIMO", min_subtotal_cents: 20000 },
      { code: "FINALMAIOR", kind: "final_total" as const, amount: 11000 },
    ]) {
      const coupon = await addCoupon(invalid.code, invalid);
      await assert.rejects(insertOrder(coupon), /coupon_unavailable/);
      assert.equal(await uses(coupon.id), 0);
    }

    const regularCases: {
      code: string;
      kind: Coupon["kind"];
      amount: number;
      subtotal: number;
      shipping: number;
    }[] = [
      {
        code: "PERCENTUAL",
        kind: "percentage",
        amount: 33,
        subtotal: 101,
        shipping: 10,
      },
      {
        code: "FIXOMAXIMO",
        kind: "fixed",
        amount: 1000,
        subtotal: 500,
        shipping: 200,
      },
      {
        code: "FINALMIL",
        kind: "final_total",
        amount: 1000,
        subtotal: 5000,
        shipping: 200,
      },
      {
        code: "PERCENTMAXIMO",
        kind: "percentage",
        amount: 99,
        subtotal: 1000000000,
        shipping: 1234,
      },
      {
        code: "PISOMINIMO",
        kind: "percentage",
        amount: 99,
        subtotal: 25,
        shipping: 0,
      },
    ];
    for (const example of regularCases) {
      const coupon = await addCoupon(example.code, example);
      const id = await insertOrder(coupon, example);
      const result = (
        await pg.query<{ total_cents: number; discount_cents: number }>(
          "select total_cents,discount_cents from orders where id=$1",
          [id],
        )
      ).rows[0];
      const expected = couponAmounts(
        example.subtotal,
        example.shipping,
        publicCoupon(coupon),
      );
      assert.deepEqual(result, {
        total_cents: expected.total_cents,
        discount_cents: expected.discount_cents,
      });
    }

    const safeCoupon = await addCoupon("VALIDACAO", { max_uses: 10 });
    for (const options of [
      { snapshot: { ...publicCoupon(safeCoupon), amount: 99 } },
      { snapshot: { ...publicCoupon(safeCoupon), code: "OUTRO" } },
      { snapshot: { ...publicCoupon(safeCoupon), kind: "fixed" } },
      { snapshot: { ...publicCoupon(safeCoupon), role: "admin" } },
      { snapshot: null },
      { total: 25 },
      { discount: 999999 },
      { subtotal: 20, shipping: 0 },
    ]) {
      await assert.rejects(
        insertOrder(safeCoupon, options),
        /coupon_(snapshot|amount)_mismatch/,
      );
      assert.equal(await uses(safeCoupon.id), 0);
    }
    await assert.rejects(
      insertOrder(null, { snapshot: publicCoupon(safeCoupon) }),
      /coupon_snapshot_mismatch/,
    );
    await assert.rejects(
      insertOrder(null, { discount: 100, total: 12216 }),
      /coupon_snapshot_mismatch/,
    );
    await assert.rejects(
      insertOrder(null, { total: 12216 }),
      /check constraint/,
    );
    await assert.rejects(
      insertOrder(null, { couponId: randomUUID() }),
      /coupon_unavailable/,
    );

    const idem = randomUUID();
    await insertOrder(safeCoupon, { idempotency: idem });
    await assert.rejects(
      insertOrder(safeCoupon, { idempotency: idem }),
      /unique constraint/,
    );
    assert.equal(
      await uses(safeCoupon.id),
      1,
      "failed duplicate rolls back the trigger counter increment",
    );

    const limited = await addCoupon("ULTIMOUSO", { max_uses: 1 });
    const competing = await Promise.allSettled([
      insertOrder(limited),
      insertOrder(limited),
    ]);
    assert.equal(
      competing.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      competing.filter((result) => result.status === "rejected").length,
      1,
    );
    assert.equal(await uses(limited.id), 1);

    for (const sql of [
      "insert into coupons(code,kind,amount) values('minusculo','fixed',25)",
      "insert into coupons(code,kind,amount) values('PERCENT100','percentage',100)",
      "insert into coupons(code,kind,amount) values('FIXOBAIXO','fixed',24)",
      "insert into coupons(code,kind,amount,max_uses) values('USOZERO','fixed',25,0)",
      "insert into coupons(code,kind,amount,starts_at,expires_at) values('DATAINVALIDA','fixed',25,'2026-09-12','2026-09-11')",
    ])
      await assert.rejects(pg.query(sql), /check constraint/);

    await pg.query("update coupons set active=false where id=$1", [seeded.id]);
    await pg.exec("reset role");
    await pg.exec(migration);
    const preserved = (
      await pg.query<{ active: boolean; uses_count: number }>(
        "select active,uses_count from coupons where id=$1",
        [seeded.id],
      )
    ).rows[0];
    assert.deepEqual(preserved, { active: false, uses_count: 1 });
  } finally {
    await pg.close();
  }
});
