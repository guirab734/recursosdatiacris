import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { customerAuthUrl, safeCustomerNext } from "@/lib/customer-auth-config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let destination = "/conta?error=link-expirado";
  if (
    tokenHash &&
    /^[a-fA-F0-9]{32,128}$/.test(tokenHash) &&
    (type === "email" || type === "signup" || type === "magiclink")
  ) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (!error && data.user?.email_confirmed_at) {
        destination = safeCustomerNext(url.searchParams.get("next"));
      } else if (data.session) {
        await client.auth.signOut({ scope: "local" });
      }
    } catch {
      // Confirmation errors are intentionally generic.
    }
  }
  const response = NextResponse.redirect(customerAuthUrl(destination), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
