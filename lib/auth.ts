import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configured } from "./catalog";
import { HttpError } from "./http";
export async function authClient() {
  if (!configured())
    throw new HttpError(
      503,
      "Conecte o Supabase no .env.local para acessar a gestão.",
    );
  const jar = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, {
                ...options,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
              }),
            );
          } catch {
            /* Page reads only. Proxy and API persist refreshed cookies. */
          }
        },
      },
    },
  );
}
export async function requireAdmin() {
  if (!configured())
    throw new HttpError(401, "Faça login com uma conta autorizada.");
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user)
    throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
  const { data: admin, error: roleError } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError || !admin)
    throw new HttpError(403, "Esta conta não tem acesso à gestão.");
  return { client, user };
}
