import { authClient } from "@/lib/auth";
import {
  customerAuthFeatures,
  customerAuthUrl,
  customerOAuthSchema,
  safeCustomerNext,
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
    await rateLimit(request, "customer-oauth", 10, 300);
    const input = customerOAuthSchema.parse(await readJson(request));
    if (!customerAuthFeatures()[input.provider])
      throw new HttpError(
        503,
        "Essa forma de acesso ainda não está disponível.",
      );
    const client = await authClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: input.provider,
      options: {
        redirectTo: customerAuthUrl(
          `/auth/callback?next=${encodeURIComponent(safeCustomerNext(input.next))}`,
        ),
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url)
      throw new HttpError(
        503,
        "Não foi possível iniciar o acesso. Tente novamente.",
      );
    const destination = new URL(data.url);
    if (
      destination.origin !== new URL(process.env.SUPABASE_URL!).origin ||
      destination.pathname !== "/auth/v1/authorize"
    )
      throw new HttpError(
        503,
        "Não foi possível iniciar o acesso. Tente novamente.",
      );
    return json({ url: destination.toString() });
  } catch (error) {
    return failure(error);
  }
}
