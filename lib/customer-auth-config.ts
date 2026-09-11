import "server-only";
import { z } from "zod";

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const customerLoginSchema = z
  .object({
    email,
    password: z.string().min(1).max(200),
    next: z.string().max(200).optional(),
  })
  .strict();
export const customerSignupSchema = z
  .object({
    name: z.string().trim().min(3, "Informe seu nome completo.").max(120),
    email,
    password: z
      .string()
      .min(10, "Use uma senha com pelo menos 10 caracteres.")
      .max(200),
  })
  .strict();
export const customerEmailSchema = z.object({ email }).strict();
export const customerOAuthSchema = z
  .object({
    provider: z.enum(["google", "apple"]),
    next: z.string().max(200).optional(),
  })
  .strict();

export function customerAuthFeatures() {
  return {
    emailSignup: process.env.CUSTOMER_AUTH_ENABLED === "true",
    google: process.env.CUSTOMER_GOOGLE_AUTH_ENABLED === "true",
    apple: process.env.CUSTOMER_APPLE_AUTH_ENABLED === "true",
  };
}

export function safeCustomerNext(value: unknown) {
  if (value === "/conta" || value === "/carrinho" || value === "/pedidos")
    return value;
  if (
    typeof value === "string" &&
    /^\/pedidos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value;
  return "/pedidos";
}

export function customerAuthUrl(path: string) {
  const origin = new URL(process.env.APP_ORIGIN || "http://127.0.0.1:3000");
  if (
    origin.username ||
    origin.password ||
    !["http:", "https:"].includes(origin.protocol) ||
    (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
  )
    throw new Error("A URL de acesso da loja precisa ser configurada.");
  return new URL(path, origin.origin).toString();
}

export function reservedCustomerEmail(value: string) {
  return (
    value.toLowerCase() === process.env.ADMIN_AUTH_EMAIL?.trim().toLowerCase()
  );
}

export const AUTH_EMAIL_MESSAGE =
  "Se o endereço estiver apto a receber o acesso, enviaremos um email com os próximos passos. Confira também a caixa de spam.";
