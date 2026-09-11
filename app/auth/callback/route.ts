import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth";
import { customerAuthUrl, safeCustomerNext } from "@/lib/customer-auth-config";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let destination = "/conta?error=link-expirado";
  if (code && code.length <= 512) {
    try {
      const client = await authClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (!error && data.user?.email_confirmed_at) {
        destination = safeCustomerNext(url.searchParams.get("next"));
      } else if (data.session) {
        await client.auth.signOut({ scope: "local" });
      }
    } catch {
      // Never put provider errors, authorization codes or tokens in redirects.
    }
  }
  const response = NextResponse.redirect(customerAuthUrl(destination), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
