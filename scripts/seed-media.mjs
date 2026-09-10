import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectMediaType,
  MAX_MEDIA_BYTES,
  mediaTypes,
} from "../lib/media-validation.ts";

const publicRoot = path.resolve(
  fileURLToPath(new URL("../public/", import.meta.url)),
);
const sourceOrigin = "https://jauxifzeexblizbxpwyg.supabase.co";
const sourcePrefix = "/storage/v1/object/public/products-media/";

// Sources come from the versioned catalog, never from a browser request.
export function seedSource(value) {
  if (typeof value !== "string") throw new Error("Fonte de mídia inválida.");
  const decoded = decodeURIComponent(value);
  if (decoded.includes("..") || decoded.includes("\\"))
    throw new Error("Caminho de mídia inválido.");
  if (decoded.startsWith("/assets/") && !/[?#]/.test(decoded)) {
    const filename = path.resolve(publicRoot, "." + decoded);
    if (!filename.startsWith(publicRoot + path.sep))
      throw new Error("Arquivo fora da pasta pública.");
    return { kind: "file", filename };
  }
  const url = new URL(value);
  if (
    url.origin !== sourceOrigin ||
    !url.pathname.startsWith(sourcePrefix) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use somente imagens locais ou o bucket público do catálogo original.",
    );
  return { kind: "remote", url: url.href };
}

export function inspectSeedMedia(bytes, type) {
  const mime = detectMediaType(bytes);
  if (
    !bytes.length ||
    bytes.length > MAX_MEDIA_BYTES ||
    !mime ||
    !["image", "video"].includes(type) ||
    !mime.startsWith(type + "/")
  )
    throw new Error("Mídia inválida ou maior que 20 MB.");
  return { mime, extension: mediaTypes[mime] };
}

export async function readSeedMedia(media) {
  const source = seedSource(media.url);
  let bytes;
  if (source.kind === "file") bytes = await readFile(source.filename);
  else {
    const response = await fetch(source.url, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok || !response.body)
      throw new Error("Não foi possível ler a mídia original.");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_MEDIA_BYTES) throw new Error("Mídia maior que 20 MB.");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  return { bytes, ...inspectSeedMedia(bytes, media.type) };
}
