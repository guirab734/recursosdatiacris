import "server-only";
import { createMelhorEnvioClient, ShippingError } from "./melhor-envio-core";
import type {
  MelhorEnvioConfig,
  PrepareShippingOrder,
  QuoteShippingInput,
} from "./melhor-envio-core";

export * from "./melhor-envio-core";

export function shippingConfigured() {
  return !!(process.env.MELHOR_ENVIO_TOKEN || process.env.token_melhorenvio);
}

function config(): MelhorEnvioConfig {
  const mode = process.env.SHIPPING_PACKING_MODE;
  if (mode !== "per_item" && mode !== "per_order")
    throw new ShippingError(
      "Defina a capacidade da embalagem para calcular o frete.",
      "shipping_packaging_not_configured",
      503,
    );
  const optional = (key: string) => process.env[key]?.trim() || undefined;
  return {
    token:
      process.env.MELHOR_ENVIO_TOKEN || process.env.token_melhorenvio || "",
    contactEmail: process.env.SHIPPING_CONTACT_EMAIL || "",
    sandbox: process.env.MELHOR_ENVIO_ENVIRONMENT === "sandbox",
    sender: {
      postalCode: process.env.SHIPPING_ORIGIN_POSTAL_CODE,
      address: process.env.SHIPPING_ORIGIN_ADDRESS,
      number: process.env.SHIPPING_ORIGIN_NUMBER,
      complement: optional("SHIPPING_ORIGIN_COMPLEMENT"),
      district: process.env.SHIPPING_ORIGIN_DISTRICT,
      city: process.env.SHIPPING_ORIGIN_CITY,
      state: process.env.SHIPPING_ORIGIN_STATE,
      ...(optional("SHIPPING_SENDER_NAME")
        ? { name: optional("SHIPPING_SENDER_NAME") }
        : {}),
      ...(optional("SHIPPING_SENDER_EMAIL")
        ? { email: optional("SHIPPING_SENDER_EMAIL") }
        : {}),
      ...(optional("SHIPPING_SENDER_PHONE")
        ? { phone: optional("SHIPPING_SENDER_PHONE") }
        : {}),
      ...(optional("SHIPPING_SENDER_DOCUMENT")
        ? { document: optional("SHIPPING_SENDER_DOCUMENT") }
        : {}),
      ...(optional("SHIPPING_SENDER_COMPANY_DOCUMENT")
        ? {
            companyDocument: optional("SHIPPING_SENDER_COMPANY_DOCUMENT"),
            document: undefined,
          }
        : {}),
      ...(optional("SHIPPING_SENDER_STATE_REGISTER")
        ? { stateRegister: optional("SHIPPING_SENDER_STATE_REGISTER") }
        : {}),
    },
    parcel: {
      weight: Number(process.env.SHIPPING_PACKAGE_WEIGHT_KG || "0.3"),
      height: Number(process.env.SHIPPING_PACKAGE_HEIGHT_CM || "12"),
      width: Number(process.env.SHIPPING_PACKAGE_WIDTH_CM || "32"),
      length: Number(process.env.SHIPPING_PACKAGE_LENGTH_CM || "27"),
    },
    packing:
      mode === "per_item"
        ? { mode }
        : {
            mode,
            ...(process.env.SHIPPING_PACKAGE_MAX_ITEMS
              ? { maxItems: Number(process.env.SHIPPING_PACKAGE_MAX_ITEMS) }
              : {}),
          },
    services: optional("MELHOR_ENVIO_SERVICES"),
  };
}

export const quoteShipping = (input: QuoteShippingInput) =>
  createMelhorEnvioClient(config()).quoteShipping(input);
export const prepareShipment = (order: PrepareShippingOrder) =>
  createMelhorEnvioClient(config()).prepareShipment(order);
export const syncShipment = (id: string) =>
  createMelhorEnvioClient(config()).syncShipment(id);
export const generateAndPrintLabel = (id: string) =>
  createMelhorEnvioClient(config()).generateAndPrintLabel(id);
