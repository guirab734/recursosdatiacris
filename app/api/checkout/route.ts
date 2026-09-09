import { allProducts, db, demoMode } from "@/lib/catalog";
import {
  checkoutSchema,
  calculateQuote,
  checkoutMessage,
} from "@/lib/validation";
import {
  failure,
  json,
  readJson,
  sameOrigin,
  rateLimit,
  HttpError,
} from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "checkout", 10);
    const { items, delivery } = checkoutSchema.parse(await readJson(request));
    const phone = process.env.WHATSAPP_NUMBER;
    if (!phone || !/^\d{10,15}$/.test(phone))
      throw new HttpError(
        503,
        "O atendimento por WhatsApp ainda não foi configurado.",
      );
    let quote;
    try {
      quote = calculateQuote(items, await allProducts(), demoMode());
    } catch (e) {
      throw new HttpError(409, (e as Error).message);
    }
    const message = checkoutMessage(quote, delivery);
    return json({
      ...quote,
      message,
      whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    });
  } catch (error) {
    return failure(error);
  }
}
