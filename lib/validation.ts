import { z } from "zod";
import type { AdminProduct, CartItem, Quote } from "./types";
import { money, categories } from "./types";
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
const text = (min: number, max: number) =>
  z.string().transform(clean).pipe(z.string().min(min).max(max));
export const cartSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            product_id: z.uuid(),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const deliverySchema = z
  .object({
    name: text(2, 100),
    method: z.enum(["address", "location"]),
    address: text(0, 400),
    complement: text(0, 150),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.method === "address" && data.address.length < 10)
      ctx.addIssue({
        code: "custom",
        message: "Informe o endereço completo, com número, cidade e CEP.",
        path: ["address"],
      });
    if (
      data.method === "location" &&
      (data.latitude === undefined || data.longitude === undefined)
    )
      ctx.addIssue({
        code: "custom",
        message: "Compartilhe sua localização ou informe o endereço.",
        path: ["latitude"],
      });
  });
export const checkoutSchema = cartSchema.extend({ delivery: deliverySchema });
export const productSchema = z
  .object({
    id: z.uuid().optional(),
    slug: text(2, 120).pipe(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    name: text(2, 150),
    description: text(10, 5000),
    price_cents: z.number().int().min(1).max(10000000),
    category: z.enum(categories as [string, ...string[]]),
    active: z.boolean(),
    badge: z
      .enum(["Escolha da Tia Cris", "Novidade", "Mais vendido"])
      .nullable(),
    skills: z.array(text(1, 300)).max(15),
    media: z
      .array(
        z
          .object({
            id: z.uuid(),
            type: z.enum(["image", "video"]),
            url: z.url().max(1500),
            position: z.number().int().min(0).max(19),
            upload_receipt: z.string().max(3000).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .refine((p) => !p.active || p.media.some((m) => m.type === "image"), {
    message: "Adicione uma foto antes de ativar o produto.",
  });
export function aggregateCart(items: CartItem[]): CartItem[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const quantity = (map.get(item.product_id) || 0) + item.quantity;
    if (quantity > 99) throw new Error("A quantidade máxima por recurso é 99.");
    map.set(item.product_id, quantity);
  }
  return [...map].map(([product_id, quantity]) => ({ product_id, quantity }));
}
export function calculateQuote(
  items: CartItem[],
  products: AdminProduct[],
  demo = false,
): Quote {
  const rows = aggregateCart(items).map((item) => {
    const product = products.find((p) => p.id === item.product_id && p.active);
    if (!product)
      throw new Error(
        "Um recurso do seu carrinho não está mais disponível. Remova-o para continuar.",
      );
    return {
      product_id: product.id,
      name: product.name,
      quantity: item.quantity,
      unit_price_cents: product.price_cents,
      subtotal_cents: product.price_cents * item.quantity,
    };
  });
  return {
    items: rows,
    total_cents: rows.reduce((sum, x) => sum + x.subtotal_cents, 0),
    demo,
  };
}
export function checkoutMessage(
  quote: Quote,
  delivery: z.infer<typeof deliverySchema>,
) {
  const name = delivery.name.replace(/[*_~`]/g, "");
  return `${quote.demo ? "PRÉVIA LOCAL, SUJEITA A CONFIRMAÇÃO\n\n" : ""}Olá, Tia Cris! Quero fazer um pedido. 🌻\n\n${quote.items.map((x) => `• ${x.quantity} × ${x.name}: ${money(x.subtotal_cents)}`).join("\n")}\n\nTotal estimado dos produtos: ${money(quote.total_cents)}\nFrete a combinar.\n\nNome: ${name}\n${delivery.method === "address" ? `Endereço: ${delivery.address}` : `Localização: https://maps.google.com/?q=${delivery.latitude},${delivery.longitude}`}${delivery.complement ? `\nComplemento/referência: ${delivery.complement}` : ""}\n\nPode confirmar prazo, entrega e pagamento?`;
}
