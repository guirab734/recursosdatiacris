import { createHash } from "node:crypto";
import { authClient } from "@/lib/auth";
import {
  customerLoginSchema,
  reservedCustomerEmail,
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
    await rateLimit(request, "customer-login", 30, 300);
    const input = customerLoginSchema.parse(await readJson(request));
    const emailHash = createHash("sha256").update(input.email).digest("hex");
    await rateLimit(request, `customer-login-account:${emailHash}`, 5, 300);
    if (reservedCustomerEmail(input.email))
      throw new HttpError(
        401,
        "Confira seu email e senha. O email precisa estar confirmado.",
      );
    const client = await authClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user?.email_confirmed_at) {
      if (data.session) await client.auth.signOut({ scope: "local" });
      throw new HttpError(
        401,
        "Confira seu email e senha. O email precisa estar confirmado.",
      );
    }
    return json({ ok: true, redirectTo: safeCustomerNext(input.next) });
  } catch (error) {
    return failure(error);
  }
}
