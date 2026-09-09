import assert from "node:assert/strict";

const origin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
assert.ok(
  password,
  "Informe a senha somente no ambiente do processo de teste.",
);
const post = (body) =>
  fetch(origin + "/api/admin/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const page = await fetch(origin + "/admin/login");
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(html.includes('name="password"'));
assert.ok(!html.includes('name="email"'));
assert.ok(!html.includes(password));
assert.ok(!html.includes(process.env.ADMIN_AUTH_EMAIL));
const unauthorized = await fetch(origin + "/api/admin/products");
assert.equal(unauthorized.status, 401);
const login = await post({ password });
assert.equal(login.status, 200, "Login com a senha configurada");
const sessionCookies = login.headers.getSetCookie();
assert.ok(sessionCookies.some((cookie) => cookie.includes("HttpOnly")));
assert.ok(sessionCookies.some((cookie) => /SameSite=lax/i.test(cookie)));
const cookieHeader = sessionCookies
  .map((cookie) => cookie.split(";")[0])
  .join("; ");
assert.ok(cookieHeader);
const admin = await fetch(origin + "/admin", {
  headers: { Cookie: cookieHeader },
  redirect: "manual",
});
assert.equal(admin.status, 200);
assert.ok((await admin.text()).includes("Seu ateliê, em um olhar."));
const metrics = await fetch(origin + "/api/admin/metrics", {
  headers: { Cookie: cookieHeader },
});
assert.equal(metrics.status, 200);
assert.equal(typeof (await metrics.json()).total_products, "number");
const invalid = await post({ password: "invalid-test-password" });
assert.equal(invalid.status, 401);
assert.equal((await invalid.json()).error, "Senha inválida.");
const injection = await post({ password, email: "untrusted@example.invalid" });
assert.equal(
  injection.status,
  400,
  "O cliente não pode trocar a identidade da conta.",
);
const logout = await fetch(origin + "/api/admin/logout", {
  method: "POST",
  headers: { Origin: origin, Cookie: cookieHeader },
});
assert.equal(logout.status, 200);
assert.ok(
  logout.headers.getSetCookie().some((cookie) => cookie.includes("Max-Age=0")),
);
assert.equal((await fetch(origin + "/api/admin/metrics")).status, 401);
console.log(
  "Login somente com senha validado: acesso real ao painel e métricas, senha incorreta bloqueada, identidade protegida e logout concluído. Nenhuma credencial exibida.",
);
