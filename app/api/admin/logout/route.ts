import { authClient } from "@/lib/auth";
import { failure, json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const client = await authClient();
    await client.auth.signOut();
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
