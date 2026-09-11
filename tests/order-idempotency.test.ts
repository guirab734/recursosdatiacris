import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { transformSync } from "esbuild";
import { calculateQuote } from "../lib/validation";
import * as commerceValidation from "../lib/commerce-validation";
import * as couponValidation from "../lib/coupon-validation";
import { money, type AdminProduct } from "../lib/types";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
type RecordData = Record<string, unknown>;

async function simultaneousCheckout(
  stage: "coupon" | "insert",
  conflicting = false,
) {
  const product: AdminProduct = {
    id: randomUUID(),
    slug: "recurso-de-teste",
    name: "Recurso de teste",
    description: "Recurso de teste.",
    price_cents: 1000,
    sale_price_cents: null,
    category: "Alfabetização",
    active: true,
    badge: null,
    skills: [],
    media: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const input = commerceValidation.orderRequestSchema.parse({
    items: [{ product_id: product.id, quantity: 1 }],
    address: {
      name: "Cliente de Teste",
      email: "teste@example.com",
      phone: "79999999999",
      document: "52998224725",
      postal_code: "49039241",
      street: "Rua de Teste",
      number: "10",
      complement: "",
      neighborhood: "Marivan",
      city: "Aracaju",
      state: "SE",
    },
    quote_id: randomUUID(),
    service_id: null,
    payment_method: "whatsapp",
    idempotency_key: randomUUID(),
    coupon_code: "ULTIMOUSO",
  });
  const applied = { code: "ULTIMOUSO", kind: "final_total", amount: 25 };
  const coupon = {
    ...applied,
    id: randomUUID(),
    active: true,
    max_uses: 1,
    uses_count: 0,
  };
  const guestHash = "session-of-requesting-customer";
  const quote = calculateQuote(input.items, [product]);
  const savedQuote = {
    id: input.quote_id,
    guest_hash: guestHash,
    fingerprint: hash({
      address: input.address,
      items: quote.items,
      coupon: applied,
    }),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    snapshot: { options: [], provider_options: [] },
  };
  // A separate customer's identical key must never be returned by recovery.
  const foreignOrder = {
    id: randomUUID(),
    guest_hash: "different-customer",
    idempotency_key: input.idempotency_key,
    request_hash: hash(input),
  };
  const records: RecordData[] = [foreignOrder];
  let insertAttempts = 0;
  let couponChecks = 0;
  let releaseCommit!: () => void;
  const firstCommitted = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });

  const database = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let row: RecordData | undefined;
      const builder = {
        select() {
          return builder;
        },
        eq(field: string, value: unknown) {
          filters.push([field, value]);
          return builder;
        },
        insert(value: RecordData) {
          row = value;
          return builder;
        },
        async maybeSingle() {
          const source =
            table === "orders"
              ? records
              : table === "shipping_quotes"
                ? [savedQuote]
                : [];
          const matches = source.filter((entry) =>
            filters.every(
              ([key, value]) => (entry as RecordData)[key] === value,
            ),
          );
          assert.ok(
            matches.length <= 1,
            "database lookup must be scoped to one customer's idempotency key",
          );
          return { data: matches[0] ?? null, error: null };
        },
        async single() {
          assert.equal(table, "orders");
          assert.ok(row);
          insertAttempts++;
          if (coupon.uses_count === 1) {
            return {
              data: null,
              error: { code: "P0001", message: "coupon_unavailable" },
            };
          }
          coupon.uses_count++;
          records.push(row);
          releaseCommit();
          return { data: row, error: null };
        },
      };
      return builder;
    },
  };
  const forbidden = () => {
    throw new Error(
      "Unexpected external operation in an isolated checkout regression",
    );
  };
  const modules: Record<string, unknown> = {
    "server-only": {},
    "node:crypto": { randomUUID },
    "./catalog": {
      db: () => database,
      demoMode: () => false,
      allProducts: async () => [product],
    },
    "./validation": { calculateQuote },
    "./commerce-validation": commerceValidation,
    "./customer-session": {
      customerSession: async () => ({ guestHash, email: null, userId: null }),
    },
    "./postal-address": {
      verifiedAddress: async (address: unknown) => ({ address, local: true }),
    },
    "./shipping/melhor-envio": {
      quoteShipping: forbidden,
      ShippingError: class extends Error {},
    },
    "./orders": { fingerprint: hash, getOrder: forbidden },
    "./http": { HttpError },
    "./types": { money },
    "./payments/velora": {
      getPaymentLimits: forbidden,
      createPix: forbidden,
      VeloraError: class extends Error {},
    },
    "./coupon-validation": couponValidation,
    "./coupons": {
      publicCoupon: () => applied,
      resolveCoupon: async () => {
        couponChecks++;
        if (couponChecks === 2 && stage === "coupon") {
          await firstCommitted;
          throw new HttpError(422, "Cupom indisponível para este pedido.");
        }
        return { ...coupon };
      },
    },
  };
  // Exercise the actual checkout source while replacing its network, cookie
  // and database boundaries. No app server, credentials or live gateway exist.
  const source = await readFile(
    new URL("../lib/commerce-checkout.ts", import.meta.url),
    "utf8",
  );
  const compiled = transformSync(source, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code;
  const loaded: {
    exports: { createOrder?: (data: unknown) => Promise<RecordData> };
  } = { exports: {} };
  const initialize = new Function("require", "module", "exports", compiled);
  initialize(
    (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`);
      return modules[name];
    },
    loaded,
    loaded.exports,
  );
  const createOrder = loaded.exports.createOrder!;
  const changed = conflicting
    ? { ...input, address: { ...input.address, name: "Outra Pessoa" } }
    : input;
  const outcomes = await Promise.allSettled([
    createOrder(input),
    createOrder(changed),
  ]);
  return { outcomes, records, coupon, insertAttempts, foreignOrder };
}

test(
  "identical concurrent checkout recovers the existing order when the coupon disappears before INSERT",
  { timeout: 5000 },
  async () => {
    const result = await simultaneousCheckout("coupon");
    assert.equal(result.outcomes[0].status, "fulfilled");
    assert.equal(result.outcomes[1].status, "fulfilled");
    if (
      result.outcomes[0].status !== "fulfilled" ||
      result.outcomes[1].status !== "fulfilled"
    )
      return;
    assert.equal(result.outcomes[0].value.id, result.outcomes[1].value.id);
    assert.notEqual(result.outcomes[0].value.id, result.foreignOrder.id);
    assert.equal(
      result.records.length,
      2,
      "one new order plus the separate customer's existing order",
    );
    assert.equal(result.insertAttempts, 1);
    assert.equal(result.coupon.uses_count, 1);
  },
);

test(
  "identical concurrent checkout recovers after the coupon trigger rejects the second INSERT",
  { timeout: 5000 },
  async () => {
    const result = await simultaneousCheckout("insert");
    assert.equal(result.outcomes[0].status, "fulfilled");
    assert.equal(result.outcomes[1].status, "fulfilled");
    if (
      result.outcomes[0].status !== "fulfilled" ||
      result.outcomes[1].status !== "fulfilled"
    )
      return;
    assert.equal(result.outcomes[0].value.id, result.outcomes[1].value.id);
    assert.notEqual(result.outcomes[0].value.id, result.foreignOrder.id);
    assert.equal(result.records.length, 2);
    assert.equal(result.insertAttempts, 2);
    assert.equal(result.coupon.uses_count, 1);
  },
);

test(
  "recovery never returns a committed order for a different request fingerprint",
  { timeout: 5000 },
  async () => {
    const result = await simultaneousCheckout("coupon", true);
    assert.equal(result.outcomes[0].status, "fulfilled");
    assert.equal(result.outcomes[1].status, "rejected");
    if (result.outcomes[1].status !== "rejected") return;
    assert.ok(result.outcomes[1].reason instanceof HttpError);
    assert.equal(result.outcomes[1].reason.status, 409);
    assert.match(result.outcomes[1].reason.message, /O pedido mudou/);
    assert.equal(result.records.length, 2);
    assert.equal(result.coupon.uses_count, 1);
  },
);
