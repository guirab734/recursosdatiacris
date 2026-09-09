import { requireAdmin } from "@/lib/auth";
import type { AdminProduct } from "@/lib/types";
import { cleanupMedia } from "@/lib/media-cleanup";
import { assertProductMedia } from "@/lib/media-upload";
import { productSchema } from "@/lib/validation";
import {
  failure,
  json,
  readJson,
  sameOrigin,
  rateLimit,
  HttpError,
} from "@/lib/http";
export async function GET() {
  try {
    const { client } = await requireAdmin();
    await cleanupMedia();
    const { data, error } = await client
      .from("products")
      .select(
        "id,slug,name,description,skills,price_cents,category,badge,active,created_at,updated_at,media:product_media(id,type,url,position)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return json({
      products: (data as AdminProduct[]).map((p) => ({
        ...p,
        media: p.media.sort((a, b) => a.position - b.position),
      })),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { client, user } = await requireAdmin();
    await rateLimit(request, "admin-write", 60);
    const product = productSchema.parse(await readJson(request));
    const storagePrefix = `${process.env.SUPABASE_URL}/storage/v1/object/public/products-media/`;
    if (
      product.media.some(
        (m) => !m.url.startsWith(storagePrefix) || m.url.includes(".."),
      )
    )
      throw new HttpError(
        400,
        "Use somente arquivos enviados para a biblioteca da loja.",
      );
    await assertProductMedia(product.media, user.id);
    const { data, error } = await client.rpc("save_product", {
      // The original RPC still requires this unused legacy field.
      payload: { ...product, stock: 0 },
    });
    if (error) {
      if (error.code === "23505")
        throw new HttpError(
          409,
          "Já existe um produto com esse endereço. Altere o identificador.",
        );
      throw error;
    }
    return json({ id: data });
  } catch (error) {
    return failure(error);
  }
}
