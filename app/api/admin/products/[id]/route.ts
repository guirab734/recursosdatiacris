import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { failure, json, readJson, sameOrigin, HttpError } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const { active } = z
      .object({ active: z.boolean() })
      .strict()
      .parse(await readJson(request));
    if (active) {
      const { data } = await client
        .from("product_media")
        .select("id")
        .eq("product_id", id)
        .eq("type", "image");
      if (!data?.length)
        throw new HttpError(400, "Adicione uma foto antes de ativar.");
    }
    const { data, error } = await client
      .from("products")
      .update({ active })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Produto não encontrado.");
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const { data, error } = await client
      .from("products")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Produto não encontrado.");
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
