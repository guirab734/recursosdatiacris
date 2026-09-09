import test from "node:test";
import { execFileSync } from "node:child_process";

test("cleanup retains signed-upload objects until tokens expire, including removed products", () => {
  // Import the actual server-only helper under React's server condition.
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import assert from 'node:assert/strict';
    import { mediaDeletionNotBefore } from './lib/media-cleanup.ts';
    const path = '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.mp4';
    const created = '2026-09-09T15:00:00Z';
    const deadline = mediaDeletionNotBefore(path, created);
    assert.equal(deadline, Date.parse('2026-09-09T17:05:00Z'));
    assert.ok(deadline > Date.parse('2026-09-09T16:59:59Z'));
    assert.ok(deadline <= Date.parse('2026-09-09T17:06:00Z'));
    assert.equal(mediaDeletionNotBefore('catalog/product.webp', created), null);
    assert.equal(mediaDeletionNotBefore('catalog/product.webp'), null);
    assert.throws(() => mediaDeletionNotBefore(path));
    assert.throws(() => mediaDeletionNotBefore(path, 'invalid'));
  `,
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
});
