import { authClient } from "@/lib/auth";
import {
  AUTH_EMAIL_MESSAGE,
  customerAuthFeatures,
  customerAuthUrl,
  customerEmailSchema,
  reservedCustomerEmail,
} from "@/lib/customer-auth-config";
import {
  failure,
  HttpError,
  json,
  rateLimit,
  readJson,
  sameOrigin,
} from "@/lib/http";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await rateLimit(request, "customer-email-link", 5, 600);
    if (!customerAuthFeatures().emailSignup)
      throw new HttpError(
        503,
        "O acesso por email está sendo preparado. Entre com sua senha ou acompanhe seu pedido neste navegador.",
      );
    const input = customerEmailSchema.parse(await readJson(request));
    if (!reservedCustomerEmail(input.email)) {
      const client = await authClient();
      await client.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: customerAuthUrl("/auth/callback?next=/pedidos"),
        },
      });
    }
    return json({ ok: true, message: AUTH_EMAIL_MESSAGE }, 202);
  } catch (error) {
    return failure(error);
  }
}
