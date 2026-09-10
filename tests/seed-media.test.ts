import test from "node:test";
import assert from "node:assert/strict";
import {
  seedSource,
  readSeedMedia,
  inspectSeedMedia,
} from "../scripts/seed-media.mjs";

test("catalog import accepts only local assets and the original public bucket", () => {
  assert.equal(seedSource("/assets/products/example.jpg").kind, "file");
  assert.equal(
    seedSource(
      "https://jauxifzeexblizbxpwyg.supabase.co/storage/v1/object/public/products-media/catalog/example.webp",
    ).kind,
    "remote",
  );
  for (const url of [
    "/assets/../../.env.local",
    "/assets/%2e%2e/.env.local",
    "/assets/..\\secret",
    "http://127.0.0.1/secret",
    "https://example.com/photo.jpg",
    "file:///secret",
    "https://jauxifzeexblizbxpwyg.supabase.co/storage/v1/object/private/secret.jpg",
    "https://user:password@jauxifzeexblizbxpwyg.supabase.co/storage/v1/object/public/products-media/photo.jpg",
  ])
    assert.throws(() => seedSource(url));
});

test("catalog import keeps JPEG bytes typed as JPEG and rejects mismatched media", async () => {
  const result = await readSeedMedia({
    type: "image",
    url: "/assets/products/import-20260910/ovos-das-vogais.jpg",
  });
  assert.equal(result.mime, "image/jpeg");
  assert.equal(result.extension, "jpg");
  assert.throws(() => inspectSeedMedia(result.bytes, "video"));
  assert.throws(() =>
    inspectSeedMedia(Buffer.from("<html>error page</html>"), "image"),
  );
});
