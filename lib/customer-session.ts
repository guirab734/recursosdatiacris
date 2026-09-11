import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authClient } from "./auth";
const cookieName = "cris_order_session";
export async function customerSession(create = false) {
  const jar = await cookies();
  let token = jar.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) token = undefined;
    else {
      token = randomBytes(32).toString("hex");
      jar.set(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      });
    }
  }
  const client = await authClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return {
    guestHash: token ? createHash("sha256").update(token).digest("hex") : null,
    userId: user?.email_confirmed_at ? user.id : null,
    email: user?.email_confirmed_at
      ? (user.email?.toLowerCase() ?? null)
      : null,
  };
}
