import test from "node:test";
import { execFileSync } from "node:child_process";

test("customer auth rejects role injection and unsafe return URLs", () => {
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/customer-auth-check.ts",
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
});
