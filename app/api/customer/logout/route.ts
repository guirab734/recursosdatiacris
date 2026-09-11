import { authClient } from "@/lib/auth";
import { failure, HttpError, json, sameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const client = await authClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      throw new HttpError(503, "Não foi possível sair agora. Tente novamente.");
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
