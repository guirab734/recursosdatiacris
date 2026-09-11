import { authClient } from "@/lib/auth";
import {
  AUTH_EMAIL_MESSAGE,
  customerAuthFeatures,
  customerAuthUrl,
  customerSignupSchema,
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
    await rateLimit(request, "customer-signup", 5, 600);
    if (!customerAuthFeatures().emailSignup)
      throw new HttpError(
        503,
        "O cadastro está sendo preparado. Você pode comprar e acompanhar seu pedido sem criar conta.",
      );
    const input = customerSignupSchema.parse(await readJson(request));
    if (!reservedCustomerEmail(input.email)) {
      const client = await authClient();
      const { data } = await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: customerAuthUrl("/auth/callback?next=/pedidos"),
          data: { full_name: input.name },
        },
      });
      // Signup must not authenticate a browser before email confirmation.
      if (data.session) await client.auth.signOut({ scope: "local" });
    }
    // Identical response for existing, reserved and new email addresses.
    return json({ ok: true, message: AUTH_EMAIL_MESSAGE }, 202);
  } catch (error) {
    return failure(error);
  }
}
