import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  createMelhorEnvioClient,
  normalizeShippingQuote,
  ShippingError,
  ShippingOperationUncertainError,
  verifyMelhorEnvioWebhook,
  type MelhorEnvioConfig,
  type PrepareShippingOrder,
} from "../lib/shipping/melhor-envio-core";

const orderId = "00000000-0000-4000-8000-000000000010";
const shipmentId = "00000000-0000-4000-8000-000000000020";
const recipient = {
  name: "Pessoa Exemplo",
  email: "cliente@example.com",
  phone: "11987654321",
  document: "12345678909",
  address: "Rua Exemplo",
  number: "10",
  district: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001000",
};
const items = [
  { id: "produto-1", name: "Recurso", quantity: 2, unitPriceCents: 2550 },
];
const rawQuote = {
  id: 1,
  name: "PAC",
  company: { name: "Correios" },
  currency: "R$",
  price: "29.99",
  custom_price: "25.55",
  delivery_range: { min: 5, max: 7 },
  custom_delivery_range: { min: 6, max: 8 },
  packages: [
    { dimensions: { height: 12, width: 32, length: 27 }, weight: "0.30" },
  ],
};
const profile = {
  name: "Remetente Exemplo",
  email: "loja@example.com",
  document_type: "cpf",
  document: "12345678909",
  phone: { phone: "11987654321" },
};
function config(fetch: typeof globalThis.fetch): MelhorEnvioConfig {
  return {
    token: "test-token",
    contactEmail: "tecnico@example.com",
    sandbox: true,
    fetch,
    sender: {
      address: "Rua de Origem",
      number: "150",
      district: "Centro",
      city: "Aracaju",
      state: "SE",
      postalCode: "49039241",
    },
    parcel: { weight: 0.3, height: 12, width: 32, length: 27 },
    packing: { mode: "per_order", maxItems: 2 },
  };
}
function order(): PrepareShippingOrder {
  return {
    orderId,
    paymentStatus: "paid",
    recipient,
    items,
    option: normalizeShippingQuote([rawQuote])[0],
    fiscalDocument: { type: "declaration", authorized: true },
  };
}

test("shipping quotes use the provider custom amounts, keep cent precision and discard unsupported options", () => {
  const options = normalizeShippingQuote([
    rawQuote,
    { ...rawQuote, id: 2, error: "unavailable" },
    { ...rawQuote, id: 3, custom_price: "nan" },
    { ...rawQuote, id: 4, currency: "USD" },
    { ...rawQuote, id: 5, company: { name: "Azul Cargo" } },
    {
      ...rawQuote,
      id: 6,
      packages: [...rawQuote.packages, ...rawQuote.packages],
    },
  ]);
  assert.equal(options.length, 1);
  assert.equal(options[0].priceCents, 2555);
  assert.equal(options[0].minDays, 6);
  assert.equal(options[0].maxDays, 8);
});

test("shipping packing preserves weight units and insurance subtotal and enforces verified parcel capacity", async () => {
  let calls = 0;
  const client = createMelhorEnvioClient(
    config(async (url, init) => {
      calls++;
      assert.equal(
        String(url),
        "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate",
      );
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.volumes, [
        { weight: 0.3, height: 12, width: 32, length: 27, insurance: 51 },
      ]);
      assert.equal(init?.redirect, "error");
      return Response.json([rawQuote]);
    }),
  );
  await client.quoteShipping({ destinationPostalCode: "01001000", items });
  await assert.rejects(
    client.quoteShipping({
      destinationPostalCode: "01001000",
      items: [{ ...items[0], quantity: 3 }],
    }),
    (error: unknown) =>
      error instanceof ShippingError &&
      error.code === "shipping_package_capacity",
  );
  assert.equal(calls, 1);
});

test("per item packing supplies dimensions and quantity to the provider instead of assuming a single 300g package", async () => {
  const client = createMelhorEnvioClient({
    ...config(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.products[0].quantity, 2);
      assert.equal(body.products[0].weight, 0.3);
      assert.equal(body.products[0].insurance_value, 25.5);
      assert.equal(body.volumes, undefined);
      return Response.json([rawQuote]);
    }),
    packing: { mode: "per_item" },
  });
  await client.quoteShipping({ destinationPostalCode: "01001000", items });
});

test("shipment creation requires verified paid order and explicit fiscal classification before provider mutation", async () => {
  let calls = 0;
  const client = createMelhorEnvioClient(
    config(async () => {
      calls++;
      return Response.json(profile);
    }),
  );
  await assert.rejects(
    client.prepareShipment({
      ...order(),
      paymentStatus: "pending",
    } as unknown as PrepareShippingOrder),
    (error: unknown) =>
      error instanceof ShippingError && error.code === "order_not_paid",
  );
  await assert.rejects(
    client.prepareShipment({
      ...order(),
      fiscalDocument: undefined,
    } as unknown as PrepareShippingOrder),
    (error: unknown) =>
      error instanceof ShippingError &&
      error.code === "shipping_fiscal_document_required",
  );
  await assert.rejects(
    client.prepareShipment({ ...order(), previousAttemptUncertain: true }),
    ShippingOperationUncertainError,
  );
  assert.equal(calls, 0);
});

test("paid order only enters Melhor Envio cart with quoted volumes and never purchases freight", async () => {
  const paths: string[] = [];
  const client = createMelhorEnvioClient(
    config(async (url, init) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path === "/api/v2/me") return Response.json(profile);
      assert.equal(path, "/api/v2/me/cart");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.from.address, "Rua de Origem");
      assert.equal(body.to.postal_code, recipient.postalCode);
      assert.equal(body.options.insurance_value, 51);
      assert.equal(body.options.non_commercial, true);
      assert.equal(body.options.tags[0].tag, `tia-cris:${orderId}`);
      assert.equal(body.products[0].unitary_value, 25.5);
      assert.deepEqual(body.volumes, order().option.packages);
      return Response.json({
        id: shipmentId,
        status: "pending",
        paid_at: null,
      });
    }),
  );
  const created = await client.prepareShipment(order());
  assert.equal(created.id, shipmentId);
  assert.equal(created.status, "pending");
  assert.deepEqual(paths, ["/api/v2/me", "/api/v2/me/cart"]);
});

test("ambiguous creation is never retried, and provider secrets are absent from errors", async () => {
  let creations = 0;
  const client = createMelhorEnvioClient(
    config(async (url) => {
      if (String(url).endsWith("/me")) return Response.json(profile);
      creations++;
      throw new Error("request had Authorization: test-token");
    }),
  );
  await assert.rejects(client.prepareShipment(order()), (error: unknown) => {
    assert.ok(error instanceof ShippingOperationUncertainError);
    assert.ok(!error.message.includes("test-token"));
    return true;
  });
  assert.equal(creations, 1);
});

test("unpaid labels cannot be generated or printed", async () => {
  const paths: string[] = [];
  const client = createMelhorEnvioClient(
    config(async (url) => {
      paths.push(String(url));
      return Response.json({
        [shipmentId]: { id: shipmentId, status: "pending", paid_at: null },
      });
    }),
  );
  await assert.rejects(
    client.generateAndPrintLabel(shipmentId),
    (error: unknown) =>
      error instanceof ShippingError &&
      error.code === "shipping_payment_required",
  );
  assert.equal(paths.length, 1);
  assert.ok(paths[0].endsWith("/shipment/tracking"));
});

test("printing requires provider-confirmed freight payment and uses private links", async () => {
  const paths: string[] = [];
  let trackingReads = 0;
  const client = createMelhorEnvioClient(
    config(async (url, init) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.endsWith("/tracking")) {
        trackingReads++;
        return Response.json({
          [shipmentId]: {
            id: shipmentId,
            status: trackingReads === 1 ? "released" : "generated",
            paid_at: "2026-09-11T12:00:00Z",
            generated_at: trackingReads === 1 ? null : "2026-09-11T12:00:03Z",
          },
        });
      }
      if (path.endsWith("/generate"))
        return Response.json({ [shipmentId]: { status: true } });
      assert.equal(path, "/api/v2/me/shipment/print");
      assert.equal(JSON.parse(String(init?.body)).mode, "private");
      return Response.json({
        url: "https://sandbox.melhorenvio.com.br/imprimir/fixture",
      });
    }),
  );
  const result = await client.generateAndPrintLabel(shipmentId);
  assert.ok(result.url.includes("/imprimir/"));
  assert.deepEqual(paths, [
    "/api/v2/me/shipment/tracking",
    "/api/v2/me/shipment/generate",
    "/api/v2/me/shipment/print",
    "/api/v2/me/shipment/tracking",
  ]);
  assert.equal(result.shipment.status, "generated");
  assert.equal(result.shipment.generatedAt, "2026-09-11T12:00:03Z");
  assert.ok(paths.every((path) => !path.includes("checkout")));
});

test("label status keeps the provider response when its generation update is still pending", async () => {
  const client = createMelhorEnvioClient(
    config(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/tracking"))
        return Response.json({
          [shipmentId]: {
            id: shipmentId,
            status: "released",
            paid_at: "2026-09-11T12:00:00Z",
            generated_at: null,
          },
        });
      if (path.endsWith("/generate"))
        return Response.json({ [shipmentId]: { status: true } });
      assert.equal(path, "/api/v2/me/shipment/print");
      return Response.json({
        url: "https://sandbox.melhorenvio.com.br/imprimir/fixture",
      });
    }),
  );
  const result = await client.generateAndPrintLabel(shipmentId);
  assert.equal(result.shipment.status, "released");
  assert.equal(result.shipment.generatedAt, null);
});

test("label status refreshes an existing label without generating it again", async () => {
  let trackingReads = 0;
  const client = createMelhorEnvioClient(
    config(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/tracking")) {
        trackingReads++;
        return Response.json({
          [shipmentId]: {
            id: shipmentId,
            status: trackingReads === 1 ? "generated" : "posted",
            paid_at: "2026-09-11T12:00:00Z",
            generated_at: "2026-09-11T12:00:03Z",
            posted_at: trackingReads === 1 ? null : "2026-09-11T13:00:00Z",
          },
        });
      }
      assert.equal(path, "/api/v2/me/shipment/print");
      return Response.json({
        url: "https://sandbox.melhorenvio.com.br/imprimir/fixture",
      });
    }),
  );
  const result = await client.generateAndPrintLabel(shipmentId);
  assert.equal(trackingReads, 2);
  assert.equal(result.shipment.status, "posted");
  assert.equal(result.shipment.postedAt, "2026-09-11T13:00:00Z");
});

test("Melhor Envio webhook authentication checks the exact raw bytes using the application secret", () => {
  const body = JSON.stringify({
    event: "order.posted",
    data: { id: shipmentId },
  });
  const signature = createHmac("sha256", "webhook-fixture")
    .update(body)
    .digest("base64");
  assert.equal(
    verifyMelhorEnvioWebhook(body, signature, "webhook-fixture"),
    true,
  );
  assert.equal(
    verifyMelhorEnvioWebhook(body + " ", signature, "webhook-fixture"),
    false,
  );
  assert.equal(
    verifyMelhorEnvioWebhook(body, signature, "wrong-secret"),
    false,
  );
  assert.equal(verifyMelhorEnvioWebhook(body, null, "webhook-fixture"), false);
});
