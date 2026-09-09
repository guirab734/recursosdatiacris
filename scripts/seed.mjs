import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Configure .env.local antes de importar.");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const products = JSON.parse(
  await readFile(new URL("../lib/catalog-seed.json", import.meta.url), "utf8"),
);
for (const product of products) {
  const { data: exists, error: checkError } = await client
    .from("products")
    .select("id")
    .eq("id", product.id)
    .maybeSingle();
  if (checkError) throw checkError;
  if (exists) {
    console.log("Já cadastrado: " + product.name);
    continue;
  }
  const image = await readFile(
    new URL("../public" + product.media[0].url, import.meta.url),
  );
  const path = `catalog/${product.id}.webp`;
  const { error: uploadError } = await client.storage
    .from("products-media")
    .upload(path, image, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;
  const {
    data: { publicUrl },
  } = client.storage.from("products-media").getPublicUrl(path);
  const { media, ...record } = product;
  // Keep the unused legacy column compatible. Review prices before publishing.
  const { error } = await client
    .from("products")
    .insert({ ...record, active: false, stock: 0 });
  if (error) throw error;
  const { error: mediaError } = await client
    .from("product_media")
    .insert({ ...media[0], product_id: product.id, url: publicUrl });
  if (mediaError) {
    await client.from("products").delete().eq("id", product.id);
    throw mediaError;
  }
  console.log("Importado, inativo: " + product.name);
}
console.log(
  "Catálogo importado. Revise os preços no painel antes de ativar os produtos.",
);
