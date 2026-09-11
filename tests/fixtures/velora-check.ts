import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createPix,
  getPayment,
  getPaymentLimits,
  parseWebhook,
  verifyWebhook,
  VeloraError,
} from "../../lib/payments/velora";

async function run() {
  // Isolated process, fake keys, mocked transport. Never load .env.local here.
  process.env.VELORA_PUBLIC_KEY = "fake-public-test-key";
  process.env.VELORA_SECRET_KEY = "fake-secret-test-key";
  process.env.VELORA_WEBHOOK_SECRET = "test-only-signing-secret";
  delete process.env.VELORA_WEBHOOK_URL;
  delete process.env.VELORA_MODE;

  const orderId = "00000000-0000-4000-8000-000000000011";
  const providerId = "vel_test123";
  const input = {
    orderId,
    amountCents: 14990,
    name: "Cliente de teste",
    document: "52998224725",
  };
  let calls = 0;
  const replies: unknown[] = [];
  let requestBody: Record<string, unknown> = {};
  let requestInit: RequestInit = {};
  let requestUrl = "";
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).origin, "https://api.velorapay.com.br");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    requestInit = init || {};
    requestUrl = String(url);
    requestBody = init?.body ? JSON.parse(String(init.body)) : {};
    return Response.json(replies.shift());
  };

  replies.push({ data: { CASH_IN: { minAmount: 2, maxAmount: 1000 } } });
  assert.deepEqual(await getPaymentLimits(), {
    minCents: 200,
    maxCents: 100000,
  });
  assert.equal(requestUrl, "https://api.velorapay.com.br/payments/limits");
  assert.equal(requestInit.method, "GET");
  assert.equal(requestInit.body, undefined);
  replies.push({
    data: { CASH_IN: { minAmount: "0.25", maxAmount: "1000.00" } },
  });
  assert.deepEqual(await getPaymentLimits(), {
    minCents: 25,
    maxCents: 100000,
  });
  for (const data of [
    {},
    { CASH_IN: null },
    { CASH_IN: [] },
    { CASH_IN: { minAmount: 2 } },
    { CASH_IN: { maxAmount: 1000 } },
    { CASH_IN: { minAmount: 0, maxAmount: 1000 } },
    { CASH_IN: { minAmount: -2, maxAmount: 1000 } },
    { CASH_IN: { minAmount: "2,00", maxAmount: 1000 } },
    { CASH_IN: { minAmount: true, maxAmount: 1000 } },
    { CASH_IN: { minAmount: 2, maxAmount: 1 } },
    { CASH_IN: { minAmount: 2, maxAmount: null } },
    { CASH_IN: { minAmount: 2, maxAmount: "1000.001" } },
  ]) {
    replies.push({ data });
    await assert.rejects(
      getPaymentLimits(),
      (error: unknown) =>
        error instanceof VeloraError && error.code === "invalid_response",
    );
  }

  const created = {
    transactionId: providerId,
    amount: 149.9,
    status: "PENDING",
    copyPaste: "00020126580014BR.GOV.BCB.PIX-test",
    qrCodeBase64: "https://untrusted.example/qr.svg",
  };
  replies.push({ data: created });
  const pix = await createPix(input);
  assert.equal(
    requestBody.amount,
    149.9,
    "cents must become reais exactly once",
  );
  assert.equal(requestBody.paymentMethod, "PIX");
  assert.equal(
    new Headers(requestInit.headers).get("Idempotency-Key"),
    `payment-${orderId}`,
  );
  assert.equal(pix.providerId, providerId);
  assert.equal(pix.amountCents, 14990);
  assert.equal(pix.expiresAt, null, "do not invent a provider expiration");
  assert.equal(pix.qrCode, null, "do not expose arbitrary remote QR images");
  assert.equal(pix.isTest, false);

  const badMoney = [14990, 149.901, "149,90", true, null, -1, "1e2"];
  for (const amount of badMoney) {
    replies.push({ data: { ...created, amount } });
    await assert.rejects(createPix(input), VeloraError);
  }
  const beforeInvalid = calls;
  await assert.rejects(createPix({ ...input, amountCents: 149.9 }));
  assert.equal(calls, beforeInvalid, "invalid cents never reach the gateway");

  replies.push({ data: { ...created, isTest: true } });
  await assert.rejects(
    createPix(input),
    (error: unknown) =>
      error instanceof VeloraError && error.code === "test_payment",
  );
  process.env.VELORA_MODE = "test";
  replies.push({
    data: { ...created, isTest: true, copyPaste: "SANDBOX-PIX-1234" },
  });
  assert.equal((await createPix(input)).isTest, true);
  delete process.env.VELORA_MODE;

  const completed = {
    ...created,
    type: "CASH_IN",
    description: `Pedido Recursos da Tia Cris ${orderId}`,
    status: "COMPLETED",
  };
  replies.push({ data: completed });
  const paid = await getPayment(providerId);
  assert.equal(requestInit.method, "GET");
  assert.equal(paid.status, "paid");
  assert.equal(paid.orderId, orderId);
  assert.equal(paid.amountCents, 14990);
  assert.equal(paid.currency, "BRL");

  for (const invalid of [
    { ...completed, transactionId: "vel_other_order" },
    { ...completed, type: "CASH_OUT" },
    { ...completed, amount: "garbage" },
  ]) {
    replies.push({ data: invalid });
    await assert.rejects(getPayment(providerId), VeloraError);
  }
  replies.push({
    data: { ...completed, description: "Outro pedido", status: "REFUNDED" },
  });
  const unknown = await getPayment(providerId);
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.orderId, null);
  replies.push({ data: { ...completed, isTest: true } });
  assert.equal((await getPayment(providerId)).isTest, true);

  const now = Date.parse("2026-09-11T13:00:00.000Z");
  const body = JSON.stringify({
    event: "payment.confirmed",
    deliveryId: "wd_test",
    timestamp: new Date(now).toISOString(),
    data: { transactionId: providerId, status: "COMPLETED", amount: 1 },
  });
  const signature = createHmac("sha256", process.env.VELORA_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  for (const header of [
    "x-velorapay-signature",
    "x-velora-signature",
    "v-signature",
  ]) {
    const headers = new Headers({ [header]: `sha256=${signature}` });
    assert.equal(verifyWebhook(body, headers, now), true);
    assert.equal(verifyWebhook(`${body} `, headers, now), false);
    assert.equal(verifyWebhook(body, headers, now + 301_000), false);
    assert.equal(verifyWebhook(body, headers, now - 301_000), false);
  }
  assert.equal(verifyWebhook(body, new Headers(), now), false);
  assert.equal(
    verifyWebhook(body, new Headers({ "v-signature": "ab" }), now),
    false,
  );
  assert.equal(
    verifyWebhook(
      body,
      new Headers({
        "v-signature": signature,
        "x-velorapay-signature": "a".repeat(64),
      }),
      now,
    ),
    false,
  );
  const notification = parseWebhook(body);
  assert.equal(notification?.providerId, providerId);
  assert.equal(notification?.deliveryId, "wd_test");
  assert.equal(
    "amountCents" in (notification || {}),
    false,
    "signed payload never supplies payment truth",
  );
  assert.equal(
    parseWebhook(body.replace("payment.confirmed", "withdrawal.completed")),
    null,
  );
  assert.equal(parseWebhook("invalid JSON"), null);

  // An ambiguous timeout is surfaced; no implicit money request is retried.
  let timeoutCalls = 0;
  globalThis.fetch = async () => {
    timeoutCalls++;
    throw new Error("network timeout with possible secret provider details");
  };
  await assert.rejects(createPix(input), (error: unknown) => {
    assert.ok(error instanceof VeloraError);
    assert.equal(error.message.includes("secret provider"), false);
    return error.code === "unavailable";
  });
  assert.equal(timeoutCalls, 1);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
