import test from "node:test";
import { execFileSync } from "node:child_process";

test("Velora validates money, authenticated reconciliation, signatures and sandbox isolation", () => {
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/velora-check.ts",
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
});
