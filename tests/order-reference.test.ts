import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { orderReference, orderReferenceRange } from "../lib/order-reference";

test("order references remain stable and UUID range search finds only the requested code", async () => {
  const id = "c11e6821-aad4-4d2d-a343-10051235cad4";
  assert.equal(orderReference(id), "CR-C11E6821AAD4");
  assert.equal(orderReference(id.toUpperCase()), "CR-C11E6821AAD4");
  assert.throws(() => orderReference("4"), /inválido/);
  const range = orderReferenceRange(" cr-c11e6821aad4 ");
  assert.deepEqual(range, {
    lower: "c11e6821-aad4-0000-0000-000000000000",
    upper: "c11e6821-aad4-ffff-ffff-ffffffffffff",
  });
  for (const invalid of [
    "4",
    "#4",
    "CR-C11E6821AAD",
    "CR-C11E6821AAD40",
    "CR-C11E6821AADG",
    "CR-%,id.gt.0",
    "Cliente da Silva",
  ])
    assert.equal(orderReferenceRange(invalid), null);

  const pg = new PGlite();
  try {
    await pg.exec("create table orders(id uuid primary key)");
    const samePrefix = "c11e6821-aad4-41e5-9410-adc09bbcf888";
    const previous = "c11e6821-aad3-4d2d-a343-10051235cad4";
    const next = "c11e6821-aad5-4d2d-a343-10051235cad4";
    for (const value of [id, samePrefix, previous, next])
      await pg.query("insert into orders(id) values($1)", [value]);
    const found = await pg.query<{ id: string }>(
      "select id from orders where id >= $1::uuid and id <= $2::uuid order by id",
      [range!.lower, range!.upper],
    );
    assert.deepEqual(
      found.rows.map((row) => row.id),
      [samePrefix, id],
    );
    assert.ok(
      found.rows.every((row) => orderReference(row.id) === "CR-C11E6821AAD4"),
    );
  } finally {
    await pg.close();
  }
});

test("public and admin order responses and WhatsApp never disclose the sequential order number", () => {
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "tests/fixtures/order-reference-check.ts",
    ],
    { cwd: process.cwd(), stdio: "pipe" },
  );
});
