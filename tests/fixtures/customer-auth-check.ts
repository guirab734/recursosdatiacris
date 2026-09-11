import assert from "node:assert/strict";
import {
  customerAuthFeatures,
  customerAuthUrl,
  customerLoginSchema,
  customerOAuthSchema,
  customerSignupSchema,
  reservedCustomerEmail,
  safeCustomerNext,
} from "../../lib/customer-auth-config";

const validSignup = {
  name: "Cliente de teste",
  email: " CLIENTE@example.com ",
  password: "test-password-example",
};
assert.equal(
  customerSignupSchema.parse(validSignup).email,
  "cliente@example.com",
);
assert.equal(
  customerSignupSchema.safeParse({ ...validSignup, password: "123" }).success,
  false,
);
for (const injection of [
  { role: "admin" },
  { data: { role: "admin" } },
  { options: { data: { role: "admin" } } },
  { email_confirmed_at: new Date().toISOString() },
  { user_id: "00000000-0000-4000-8000-000000000011" },
]) {
  assert.equal(
    customerSignupSchema.safeParse({ ...validSignup, ...injection }).success,
    false,
  );
  assert.equal(
    customerLoginSchema.safeParse({
      email: validSignup.email,
      password: validSignup.password,
      ...injection,
    }).success,
    false,
  );
}

for (const unsafe of [
  "https://untrusted.example",
  "//untrusted.example",
  "/\\untrusted.example",
  "javascript:alert(1)",
  "/pedidos?next=https://untrusted.example",
  "/pedidos/../../admin",
  "/admin",
  "/admin/login",
  "/%2f%2funtrusted.example",
  ["/conta"],
  null,
])
  assert.equal(safeCustomerNext(unsafe), "/pedidos");
for (const safe of [
  "/conta",
  "/carrinho",
  "/pedidos",
  "/pedidos/00000000-0000-4000-8000-000000000011",
])
  assert.equal(safeCustomerNext(safe), safe);

process.env.APP_ORIGIN = "https://www.recursosdatiacris.com.br";
assert.equal(
  customerAuthUrl("/auth/callback?next=/pedidos"),
  "https://www.recursosdatiacris.com.br/auth/callback?next=/pedidos",
);
process.env.ADMIN_AUTH_EMAIL = "reserved@example.invalid";
assert.equal(reservedCustomerEmail("RESERVED@example.invalid"), true);
assert.equal(reservedCustomerEmail("cliente@example.com"), false);

delete process.env.CUSTOMER_AUTH_ENABLED;
delete process.env.CUSTOMER_GOOGLE_AUTH_ENABLED;
delete process.env.CUSTOMER_APPLE_AUTH_ENABLED;
assert.deepEqual(customerAuthFeatures(), {
  emailSignup: false,
  google: false,
  apple: false,
});
process.env.CUSTOMER_GOOGLE_AUTH_ENABLED = "true";
assert.deepEqual(customerAuthFeatures(), {
  emailSignup: false,
  google: true,
  apple: false,
});
assert.equal(
  customerOAuthSchema.safeParse({ provider: "github" }).success,
  false,
);
assert.equal(
  customerOAuthSchema.safeParse({
    provider: "apple",
    redirectTo: "https://untrusted.example",
  }).success,
  false,
);
