import assert from "node:assert/strict";
import {
  adminOrder,
  customerOrder,
  orderWhatsApp,
  type OrderRecord,
} from "../../lib/orders";

process.env.WHATSAPP_NUMBER = "5579999999999";
const order = {
  id: "c11e6821-aad4-4d2d-a343-10051235cad4",
  number: 4,
  address: {
    name: "Cliente de Teste",
    street: "Rua de teste",
    number: "10",
    neighborhood: "Centro",
    city: "Aracaju",
    state: "SE",
    postal_code: "49010000",
    phone: "79999999999",
    document: "52998224725",
  },
  items: [],
  subtotal_cents: 15000,
  total_cents: 15000,
  local: true,
  payment_method: "whatsapp",
  payment_status: "pending",
} as unknown as OrderRecord;

for (const format of [customerOrder, adminOrder]) {
  const result = format(order);
  assert.equal(result.reference, "CR-C11E6821AAD4");
  assert.equal(Object.hasOwn(result, "number"), false);
  assert.equal(result.id, order.id);
  assert.equal(
    result.address.number,
    "10",
    "the delivery address number must remain intact",
  );
}
const message = new URL(orderWhatsApp(order)).searchParams.get("text")!;
assert.ok(message.startsWith("Olá, Tia Cris! Meu pedido é CR-C11E6821AAD4."));
assert.equal(message.includes("#4"), false);
assert.equal(customerOrder(order).address.document, undefined);
const laterOrder = { ...order, number: 99999 };
assert.equal(
  customerOrder(laterOrder).reference,
  customerOrder(order).reference,
);
