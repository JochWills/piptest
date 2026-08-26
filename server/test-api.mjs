/* End-to-end API test. Runs the real route handlers against an
   in-memory Postgres, so SQL, auth and ownership are all covered. */
import { newDb } from "pg-mem";
import crypto from "node:crypto";

const mem = newDb({ autoCreateForeignKeyIndices: true });
mem.public.registerFunction({ name: "gen_random_uuid", returns: "uuid",
  implementation: () => crypto.randomUUID(), impure: true });
mem.public.registerFunction({ name: "now", returns: "timestamptz",
  implementation: () => new Date(), impure: true });

const { Pool } = mem.adapters.createPg();
globalThis.__PIPTEST_TEST_POOL__ = new Pool();

process.env.JWT_SECRET = "a-test-secret-long-enough-for-hs256-signing!!";
process.env.ADMIN_EMAILS = "boss@piptest.com";
process.env.NODE_ENV = "development";
process.env.DATABASE_URL = "postgres://localhost/test";

const { migrate } = await import("./db.js");
const { router } = await import("./routes.js");
const express = (await import("express")).default;
const cookieParser = (await import("cookie-parser")).default;

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());
app.use("/api", router);
const server = app.listen(0);
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fail++; };

let cookies = {};
async function call(path, { method = "GET", body, token, jar = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jar && Object.keys(cookies).length)
    headers.Cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(BASE + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const sc = res.headers.getSetCookie?.() || [];
  for (const c of sc) { const [kv] = c.split(";"); const [k, v] = kv.split("="); cookies[k] = v; }
  const txt = await res.text();
  return { status: res.status, body: txt ? JSON.parse(txt) : {} };
}

try {
  await migrate();
  console.log("=== schema ===");
  ok(true, "migrations applied");

  console.log("\n=== registration ===");
  let r = await call("/api/auth/register", { method: "POST",
    body: { email: "josh@piptest.com", password: "correct-horse-8", name: "Josh", handle: "josh_pe" } });
  ok(r.status === 201 && r.body.accessToken, "user registered and given an access token");
  ok(r.body.user.role === "user", "ordinary email gets the user role");
  ok(!("password_hash" in r.body.user) && !("password" in r.body.user), "no password material in the response");
  const userToken = r.body.accessToken, userId = r.body.user.id;

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "JOSH@piptest.com", password: "another-pass-8", name: "Imposter", handle: "other" } });
  ok(r.status === 409, "duplicate email rejected regardless of case");

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "x@y.com", password: "short", name: "X", handle: "xx" } });
  ok(r.status === 400, "weak password and short handle rejected");

  console.log("\n=== login ===");
  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "wrong" } });
  ok(r.status === 401, "wrong password rejected");
  r = await call("/api/auth/login", { method: "POST", body: { email: "nobody@nowhere.com", password: "whatever1" } });
  ok(r.status === 401 && r.body.error === "bad_credentials",
     "unknown email returns the same error as a wrong password (no account enumeration)");
  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "correct-horse-8" } });
  ok(r.status === 200 && r.body.accessToken, "correct password signs in");

  console.log("\n=== authorisation ===");
  r = await call("/api/me");
  ok(r.status === 401, "no token is refused");
  r = await call("/api/me", { token: "not.a.real.token" });
  ok(r.status === 401, "forged token is refused");
  r = await call("/api/me", { token: userToken });
  ok(r.status === 200 && r.body.user.handle === "josh_pe", "valid token returns the profile");

  console.log("\n=== admin gating ===");
  r = await call("/api/admin/users", { token: userToken });
  ok(r.status === 403, "ordinary user is refused admin routes");

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "boss@piptest.com", password: "boss-password-8", name: "Boss", handle: "boss" } });
  ok(r.body.user?.role === "admin", "email in ADMIN_EMAILS is promoted to admin on signup");
  const adminToken = r.body.accessToken;
  r = await call("/api/admin/users", { token: adminToken });
  ok(r.status === 200 && r.body.users.length >= 2, "admin can list users");

  console.log("\n=== data ownership ===");
  await call("/api/sessions/s1", { method: "PUT", token: userToken,
    body: { name: "Mine", symbol: "BTCUSDT", interval: "30m", startMs: 1741852800000, stats: {} } });
  r = await call("/api/sessions", { token: userToken });
  ok(r.status === 200 && r.body.sessions.length === 1, "owner sees their session");
  r = await call("/api/sessions", { token: adminToken });
  ok(r.body.sessions.length === 0, "another user does not see it");
  r = await call("/api/sessions/s1/state", { method: "PUT", token: adminToken, body: { state: { hacked: true } } });
  ok(r.status === 404, "another user cannot write to it");

  await call("/api/trades", { method: "POST", token: userToken, body: { trades: [
    { id: "t1", symbol: "BTCUSDT", interval: "30m", dir: "long", qty: 0.5, entry: 100, exit: 110,
      stop: 95, target: 115, riskAmt: 100, riskPct: 1, r: 2, pnl: 200, reason: "target",
      tags: ["A"], note: "", openedTs: 1, closedTs: 2 } ] } });
  r = await call("/api/trades", { token: userToken });
  ok(r.body.trades.length === 1 && r.body.trades[0].r === 2, "trade saved and returned with its R");
  r = await call("/api/trades", { token: adminToken });
  ok(r.body.trades.length === 0, "trades are private to their owner");

  console.log("\n=== rooms ===");
  r = await call("/api/kv/room:ABC123", { method: "PUT", token: userToken, body: { value: { code: "ABC123" } } });
  ok(r.status === 200, "room key accepted");
  r = await call("/api/kv/users", { method: "PUT", token: userToken, body: { value: { evil: true } } });
  ok(r.status === 400, "non-room keys refused, so kv can't be used as scratch storage");

  console.log("\n=== disabling a user ===");
  r = await call("/api/admin/users/" + userId, { method: "PATCH", token: adminToken, body: { status: "disabled" } });
  ok(r.status === 200 && r.body.user.status === "disabled", "admin can disable an account");
  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "correct-horse-8" } });
  ok(r.status === 403, "disabled account cannot sign in");
} catch (e) {
  console.log("\nERROR:", e.message);
  fail++;
} finally {
  server.close();
  console.log(fail ? `\n${fail} FAILURE(S)` : "\nALL API CHECKS PASSED");
  process.exit(fail ? 1 : 0);
}
