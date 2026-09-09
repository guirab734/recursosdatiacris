import { z } from "zod";
import { authClient, requireAdmin } from "@/lib/auth";
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
    await rateLimit(request, "login", 5, 300);
    const data = z
      .object({
        password: z.string().min(1).max(200),
      })
      .strict()
      .parse(await readJson(request));
    const email = z.email().safeParse(process.env.ADMIN_AUTH_EMAIL);
    if (!email.success)
      throw new HttpError(
        503,
        "O acesso administrativo ainda não foi configurado.",
      );
    const client = await authClient();
    const { error } = await client.auth.signInWithPassword({
      email: email.data,
      password: data.password,
    });
    if (error) throw new HttpError(401, "Senha inválida.");
    try {
      await requireAdmin();
    } catch {
      await client.auth.signOut();
      throw new HttpError(403, "Esta conta não tem acesso à gestão.");
    }
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
