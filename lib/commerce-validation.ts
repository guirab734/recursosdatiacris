import { z } from "zod";
import { cartSchema } from "./validation";
import type { ShippingOption } from "./commerce-types";
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (s) => !/[\u0000-\u001f\u007f<>]/.test(s),
      "Confira o texto informado.",
    );
const digits = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[ .()+-]/g, ""))
    .pipe(z.string().regex(/^\d+$/).min(min).max(max));
export function validDocument(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  for (let size = 9; size <= 10; size++) {
    const sum = [...value.slice(0, size)].reduce(
      (total, digit, index) => total + Number(digit) * (size + 1 - index),
      0,
    );
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(value[size])) return false;
  }
  return true;
}
export const customerAddressSchema = z
  .object({
    name: text(3, 100).refine(
      (s) => s.split(/\s+/).length > 1,
      "Informe nome e sobrenome.",
    ),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    phone: digits(10, 13),
    document: digits(11, 11).refine(validDocument, "Confira o CPF informado."),
    postal_code: digits(8, 8),
    street: text(2, 150),
    number: text(1, 20),
    complement: text(0, 100).default(""),
    neighborhood: text(2, 100),
    city: text(2, 100),
    state: z.enum([
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ]),
  })
  .strict();
export const shippingRequestSchema = cartSchema.extend({
  address: customerAddressSchema,
});
export const orderRequestSchema = shippingRequestSchema
  .extend({
    quote_id: z.uuid(),
    service_id: z.string().max(40).nullable(),
    payment_method: z.enum(["pix", "card", "whatsapp"]),
    idempotency_key: z.uuid(),
  })
  .strict();
export function shippingBenefit(
  subtotal: number,
  local: boolean,
  prices: number[],
  allServicesFree = false,
) {
  const threshold = local ? 15000 : 30000;
  const subsidy =
    subtotal >= threshold && prices.length ? Math.min(...prices) : 0;
  return {
    threshold,
    charges: prices.map((price) => ({
      subsidy_cents: subtotal >= threshold && allServicesFree ? price : subsidy,
      charged_cents: Math.max(
        0,
        price - (subtotal >= threshold && allServicesFree ? price : subsidy),
      ),
    })),
  };
}
export function withShippingBenefit(
  options: Omit<ShippingOption, "charged_cents" | "subsidy_cents">[],
  subtotal: number,
  allServicesFree = false,
): ShippingOption[] {
  const benefit = shippingBenefit(
    subtotal,
    false,
    options.map((o) => o.price_cents),
    allServicesFree,
  );
  return options.map((option, i) => ({ ...option, ...benefit.charges[i] }));
}
