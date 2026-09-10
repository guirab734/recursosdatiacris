import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { seedSource, readSeedMedia } from "./seed-media.mjs";

const products = JSON.parse(
  await readFile(new URL("../lib/catalog-seed.json", import.meta.url), "utf8"),
);
if (process.argv.includes("--dry-run")) {
  let local = 0,
    remote = 0;
  for (const product of products) {
    if (!product.media.length || product.media.length > 20)
      throw new Error(`Galeria inválida: ${product.name}`);
    for (const media of product.media) {
      if (seedSource(media.url).kind === "file") {
        await readSeedMedia(media);
        local++;
      } else remote++;
    }
  }
  console.log(
    `${products.length} produtos: ${local} arquivos locais validados e ${remote} referências públicas permitidas. Nenhuma escrita.`,
  );
  process.exit(0);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Configure .env.local antes de importar.");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const storage = client.storage.from("products-media");
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
  if (!product.media.length || product.media.length > 20)
    throw new Error(`Galeria inválida: ${product.name}`);
  const media = [];
  for (const [position, item] of [...product.media]
    .sort((a, b) => a.position - b.position)
    .entries()) {
    const { bytes, mime, extension } = await readSeedMedia(item);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `seed/${product.id}/${item.id}-${hash}.${extension}`;
    const { error: uploadError } = await storage.upload(objectPath, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploadError) {
      const { data, error } = await storage.download(objectPath);
      if (
        error ||
        createHash("sha256")
          .update(Buffer.from(await data.arrayBuffer()))
          .digest("hex") !== hash
      )
        throw new Error("Não foi possível importar a mídia de " + product.name);
    }
    media.push({
      id: item.id,
      product_id: product.id,
      type: item.type,
      url: storage.getPublicUrl(objectPath).data.publicUrl,
      position,
    });
  }
  const { media: unused, ...record } = product;
  const { data: inserted, error } = await client
    .from("products")
    .insert({ ...record, active: false, stock: 0 })
    .select("updated_at")
    .single();
  if (error) throw error;
  const { error: mediaError } = await client
    .from("product_media")
    .insert(media);
  if (mediaError) {
    // Roll back only this new, unpublished row if nobody has edited it meanwhile.
    const { error: rollbackError } = await client
      .from("products")
      .delete()
      .eq("id", product.id)
      .eq("active", false)
      .eq("updated_at", inserted.updated_at);
    if (rollbackError)
      throw new Error(
        `Importação incompleta de ${product.name}. Revise o cadastro inativo.`,
      );
    throw mediaError;
  }
  console.log("Importado, inativo: " + product.name);
}
console.log(
  "Catálogo importado. Revise os preços no painel antes de ativar os produtos.",
);
