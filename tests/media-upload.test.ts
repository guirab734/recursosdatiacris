import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MEDIA_BYTES,
  detectMediaType,
  signUploadReceipt,
  uploadRequestSchema,
  validateUploadedBytes,
  verifyUploadReceipt,
  type UploadReceipt,
} from "../lib/media-validation";

const key = "unit-test-key-never-used-by-the-application";
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const receipt: UploadReceipt = {
  stage: "upload",
  id,
  user,
  path: `${user}/${id}.webp`,
  mime: "image/webp",
  size: 24,
  expires: 10000,
};
const token = signUploadReceipt(receipt, key);

test("upload authorization rejects forged metadata, another owner, stage and expired tokens", () => {
  assert.deepEqual(
    verifyUploadReceipt(token, key, user, "upload", 9000),
    receipt,
  );
  const [payload, signature] = token.split(".");
  const tampered = Buffer.from(
    JSON.stringify({ ...receipt, size: 1024 }),
  ).toString("base64url");
  for (const value of [
    `${tampered}.${signature}`,
    `${payload}.a`,
    `${token}.extra`,
    "invalid",
  ])
    assert.throws(() => verifyUploadReceipt(value, key, user, "upload", 9000));
  assert.throws(() =>
    verifyUploadReceipt(token, "different-key", user, "upload", 9000),
  );
  assert.throws(() => verifyUploadReceipt(token, key, other, "upload", 9000));
  assert.throws(() => verifyUploadReceipt(token, key, user, "verified", 9000));
  assert.throws(() => verifyUploadReceipt(token, key, user, "upload", 10000));
  for (const path of [
    "../../image.webp",
    `https://example.org/${id}.webp`,
    `${other}/${id}.webp`,
  ])
    assert.throws(() =>
      verifyUploadReceipt(
        signUploadReceipt({ ...receipt, path }, key),
        key,
        user,
        "upload",
        9000,
      ),
    );
});

test("upload request limits size and excludes arbitrary paths, URLs and file types", () => {
  assert.equal(
    uploadRequestSchema.safeParse({
      action: "prepare",
      type: "video/mp4",
      size: MAX_MEDIA_BYTES,
    }).success,
    true,
  );
  for (const size of [0, -1, 1.5, MAX_MEDIA_BYTES + 1, "20"])
    assert.equal(
      uploadRequestSchema.safeParse({
        action: "prepare",
        type: "video/mp4",
        size,
      }).success,
      false,
    );
  for (const type of ["text/html", "image/svg+xml", "video/quicktime"])
    assert.equal(
      uploadRequestSchema.safeParse({ action: "prepare", type, size: 100 })
        .success,
      false,
    );
  assert.equal(
    uploadRequestSchema.safeParse({
      action: "prepare",
      type: "image/png",
      size: 20,
      path: "anything",
    }).success,
    false,
  );
  assert.equal(
    uploadRequestSchema.safeParse({
      action: "complete",
      receipt: token,
      url: "https://example.org",
    }).success,
    false,
  );
});

function bmff(brand: string) {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(24, 0);
  bytes.write("ftyp", 4);
  bytes.write(brand, 8);
  bytes.write("isom", 16);
  return bytes;
}
test("file inspection distinguishes MP4 from AVIF/HEIC and WebM from Matroska", () => {
  assert.equal(detectMediaType(bmff("isom")), "video/mp4");
  assert.equal(detectMediaType(bmff("mp42")), "video/mp4");
  assert.equal(detectMediaType(bmff("avif")), null);
  assert.equal(detectMediaType(bmff("heic")), null);
  const webm = Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
  ]);
  assert.equal(detectMediaType(webm), "video/webm");
  assert.equal(
    detectMediaType(
      Buffer.concat([webm.subarray(0, 5), Buffer.from("matroska")]),
    ),
    null,
  );
  assert.equal(
    detectMediaType(Buffer.from("<html>an invalid file</html>")),
    null,
  );
});

test("completion requires matching stored MIME, byte signature and exact authorized size", () => {
  const mp4 = bmff("mp42");
  assert.doesNotThrow(() =>
    validateUploadedBytes(mp4, { mime: "video/mp4", size: 24 }, "video/mp4"),
  );
  assert.throws(
    () =>
      validateUploadedBytes(mp4, { mime: "video/mp4", size: 23 }, "video/mp4"),
    /tamanho/,
  );
  assert.throws(
    () =>
      validateUploadedBytes(mp4, { mime: "video/mp4", size: 24 }, "image/png"),
    /Formato/,
  );
  assert.throws(
    () =>
      validateUploadedBytes(
        bmff("avif"),
        { mime: "video/mp4", size: 24 },
        "video/mp4",
      ),
    /Formato/,
  );
  assert.throws(
    () =>
      validateUploadedBytes(
        new Uint8Array(MAX_MEDIA_BYTES + 1),
        { mime: "video/mp4", size: MAX_MEDIA_BYTES + 1 },
        "video/mp4",
      ),
    /tamanho/,
  );
});
