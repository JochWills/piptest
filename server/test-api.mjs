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

const { migrate, q } = await import("./db.js");
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

  console.log("\n=== avatars ===");
  r = await call("/api/me", { token: userToken });
  ok(r.body.user.avatar === null, "new account has no avatar set (falls back to one derived from the handle)");
  r = await call("/api/me", { method: "PATCH", token: userToken, body: { avatar: "fox:4" } });
  ok(r.status === 200 && r.body.user.avatar === "fox:4", "a valid avatar code saves");
  r = await call("/api/me", { method: "PATCH", token: userToken, body: { avatar: "<script>alert(1)</script>" } });
  ok(r.status === 400, "a malformed avatar code is refused");
  r = await call("/api/me", { method: "PATCH", token: userToken, body: { name: "Josh W" } });
  ok(r.body.user.avatar === "fox:4", "editing the name leaves the avatar alone");

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

  console.log("\n=== password reset ===");
  // capture the link the mailer would have sent
  const sentMail = [];
  const origLog = console.log;
  console.log = (...a) => { sentMail.push(a.join(" ")); origLog(...a); };

  r = await call("/api/auth/forgot", { method: "POST", body: { email: "josh@piptest.com" } });
  const genericMsg = r.body.message;
  ok(r.status === 200, "forgot accepts a known email");
  r = await call("/api/auth/forgot", { method: "POST", body: { email: "nobody@nowhere.com" } });
  ok(r.status === 200 && r.body.message === genericMsg,
     "unknown email returns the identical message (no account enumeration)");
  console.log = origLog;

  const link = sentMail.join("\n").match(/#\/reset\/([A-Za-z0-9_-]+)/);
  ok(!!link, "a reset link was generated");
  const token = link ? link[1] : "nope";

  r = await call(`/api/auth/reset/${token}`);
  ok(r.status === 200 && r.body.valid === true, "token validates before the form is shown");
  ok(/^jo.*@piptest\.com$/.test(r.body.email || ""), `email is masked in the check response (${r.body.email})`);

  r = await call("/api/auth/reset", { method: "POST", body: { token: "not-a-real-token", password: "brand-new-pass" } });
  ok(r.status === 400, "a bogus token is refused");

  r = await call("/api/auth/reset", { method: "POST", body: { token, password: "short" } });
  ok(r.status === 400, "a too-short new password is refused");

  r = await call("/api/auth/reset", { method: "POST", body: { token, password: "brand-new-pass-9" } });
  ok(r.status === 200, "valid token + strong password resets it");

  r = await call("/api/auth/reset", { method: "POST", body: { token, password: "another-pass-9" } });
  ok(r.status === 400, "the same token cannot be used twice");

  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "correct-horse-8" } });
  ok(r.status === 401, "the old password no longer works");
  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "brand-new-pass-9" } });
  ok(r.status === 200, "the new password works");

  console.log("\n=== market data (Twelve Data) ===");
  process.env.TWELVE_DATA_API_KEY = "test-key";
  const origFetch = global.fetch;
  let twelveDataCalls = 0;
  global.fetch = async (url, opts) => {
    if (typeof url === "string" && url.includes("api.twelvedata.com")) {
      twelveDataCalls++;
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          values: [
            { datetime: "2024-01-02 00:00:00", open: "1.1037", high: "1.1038", low: "1.1036", close: "1.10365" },
            { datetime: "2024-01-02 01:00:00", open: "1.10365", high: "1.1040", low: "1.1035", close: "1.1039" },
          ],
        }),
      };
    }
    return origFetch(url, opts);
  };

  r = await call("/api/market/twelvedata/symbols", { token: adminToken });
  ok(r.status === 200 && r.body.symbols.EURUSD?.apiSymbol === "EUR/USD", "symbol table lists EUR/USD correctly");

  r = await call("/api/market/twelvedata/candles?symbol=EURUSD&interval=1h&from=1&to=2");
  ok(r.status === 401, "candles route requires auth");

  r = await call("/api/market/twelvedata/candles?symbol=FAKE&interval=1h&from=1&to=2", { token: adminToken });
  ok(r.status === 400 && r.body.error === "unknown_symbol", "unknown symbol rejected");

  r = await call("/api/market/twelvedata/candles?symbol=EURUSD&interval=1h&from=100&to=50", { token: adminToken });
  ok(r.status === 400 && r.body.error === "bad_range", "to <= from is rejected");

  const from = Date.UTC(2024, 0, 2, 0), to = Date.UTC(2024, 0, 2, 2);
  r = await call(`/api/market/twelvedata/candles?symbol=EURUSD&interval=1h&from=${from}&to=${to}`, { token: adminToken });
  ok(r.status === 200 && r.body.candles.length === 2, "returns the mocked candles");
  ok(r.body.candles[0].o === 1.1037 && r.body.candles[0].c === 1.10365, "candle values parsed correctly");
  ok(r.body.candles[0].t < r.body.candles[1].t, "candles come back sorted ascending by time");

  const callsAfterFirst = twelveDataCalls;
  r = await call(`/api/market/twelvedata/candles?symbol=EURUSD&interval=1h&from=${from}&to=${to}`, { token: adminToken });
  ok(twelveDataCalls === callsAfterFirst, "an identical request is served from cache, not fetched again");

  r = await call(`/api/market/twelvedata/candles?symbol=EURUSD&interval=1s&from=${from}&to=${to}`, { token: adminToken });
  ok(r.status === 200 && r.body.candles.length === 0, "an interval Twelve Data doesn't offer (1s) comes back empty, not an error");

  global.fetch = origFetch;

  console.log("\n=== the daily pip ===");
  let d = await call("/api/daily-pip/today", { token: userToken });
  ok(d.status === 200 && !!d.body.challenge?.symbol, "today's challenge resolves");
  ok(d.body.attempt === null, "no attempt yet for a fresh user");
  ok(d.body.streak.current === 0, "streak starts at zero");
  const challengeDate = d.body.challenge.challengeDate;

  const d2 = await call("/api/daily-pip/today", { token: adminToken });
  ok(d2.body.challenge.challengeDate === challengeDate && d2.body.challenge.symbol === d.body.challenge.symbol,
     "every user gets the identical challenge for the same day");

  r = await call("/api/daily-pip/attempts", { method: "POST", token: userToken,
    body: { challengeDate, traded: true, dir: "long", qty: 1, entry: 100, exitPrice: 102, stop: 99, target: 103, r: 2, pnl: 200, reason: "target" } });
  ok(r.status === 200 && r.body.attempt.r === 2, "attempt recorded");
  ok(r.body.streak.current === 1, "first attempt starts a 1-day streak");

  r = await call("/api/daily-pip/attempts", { method: "POST", token: userToken,
    body: { challengeDate, traded: true, dir: "short", qty: 1, entry: 50, exitPrice: 49, stop: 51, target: 48, r: 1, pnl: 100, reason: "target" } });
  ok(r.status === 200 && r.body.attempt.r === 2, "resubmitting the same day is idempotent — original result kept, not overwritten");
  ok(r.body.streak.current === 1, "resubmit doesn't double-count the streak");

  r = await call("/api/daily-pip/attempts", { method: "POST", token: userToken, body: { challengeDate: "not-a-date", traded: false } });
  ok(r.status === 400, "malformed challengeDate rejected");

  r = await call("/api/daily-pip/attempts", { method: "POST", token: userToken, body: { challengeDate: "2099-01-01", traded: false } });
  ok(r.status === 404 && r.body.error === "unknown_challenge", "a date with no matching challenge row is rejected");

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "second@piptest.com", password: "another-pass-9", name: "Second", handle: "second_pe" } });
  const secondToken = r.body.accessToken;
  await call("/api/daily-pip/attempts", { method: "POST", token: secondToken,
    body: { challengeDate, traded: true, dir: "long", qty: 1, entry: 100, exitPrice: 99, stop: 99, target: 103, r: -1, pnl: -100, reason: "stop" } });
  r = await call("/api/daily-pip/attempts", { method: "POST", token: adminToken,
    body: { challengeDate, traded: false } });
  ok(r.body.attempt.traded === false && r.body.attempt.r === 0, "time-ran-out-with-nothing-armed still records an attempt");

  r = await call(`/api/daily-pip/leaderboard/${challengeDate}`, { token: userToken });
  ok(r.status === 200 && r.body.entries.length === 3, "leaderboard lists every attempt for the day");
  ok(r.body.entries[0].handle === "josh_pe" && r.body.entries[0].r === 2, "higher R ranks first");
  ok(r.body.entries.some((e) => e.traded === false), "an untraded (0R) attempt still appears on the board");
  ok(r.body.you.rank === 1, "the caller's own rank is reported correctly");

  /* Streak continuity across days, with no clock-mocking: the streak
     transition is computed entirely from the challengeDate supplied
     in the request, not from now(), so adjacent days can just be
     fabricated directly against daily_pip_challenges (real request
     flow only ever resolves "today", so a direct insert is the only
     way to get a row for a date other than today without waiting a
     real day). */
  const addDays = (dateStr, n) => {
    const dt = new Date(dateStr + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  };
  const yesterday = addDays(challengeDate, -1);
  const twoDaysAgo = addDays(challengeDate, -2);
  await q("INSERT INTO daily_pip_challenges (challenge_date, symbol, interval, start_ms) VALUES ($1,'BTCUSDT','5m',1) ON CONFLICT DO NOTHING", [yesterday]);
  await q("INSERT INTO daily_pip_challenges (challenge_date, symbol, interval, start_ms) VALUES ($1,'BTCUSDT','5m',1) ON CONFLICT DO NOTHING", [twoDaysAgo]);

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "streaker@piptest.com", password: "streak-pass-9", name: "Streaker", handle: "streaker" } });
  const streakToken = r.body.accessToken;
  await call("/api/daily-pip/attempts", { method: "POST", token: streakToken, body: { challengeDate: yesterday, traded: false } });
  r = await call("/api/daily-pip/attempts", { method: "POST", token: streakToken, body: { challengeDate, traded: false } });
  ok(r.body.streak.current === 2, "playing yesterday then today extends the streak to 2");
  ok(r.body.streak.longest === 2, "longest streak tracks the current one");

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "gapper@piptest.com", password: "gapper-pass-9", name: "Gapper", handle: "gapper" } });
  const gapToken = r.body.accessToken;
  await call("/api/daily-pip/attempts", { method: "POST", token: gapToken, body: { challengeDate: twoDaysAgo, traded: false } });
  r = await call("/api/daily-pip/attempts", { method: "POST", token: gapToken, body: { challengeDate, traded: false } });
  ok(r.body.streak.current === 1, "a gap (two-days-ago, then today, skipping yesterday) resets the streak to 1, not +1");

  console.log("\n=== disabling a user ===");
  r = await call("/api/admin/users/" + userId, { method: "PATCH", token: adminToken, body: { status: "disabled" } });
  ok(r.status === 200 && r.body.user.status === "disabled", "admin can disable an account");
  r = await call("/api/auth/login", { method: "POST", body: { email: "josh@piptest.com", password: "brand-new-pass-9" } });
  ok(r.status === 403, "disabled account cannot sign in");
} catch (e) {
  console.log("\nERROR:", e.message);
  fail++;
} finally {
  server.close();
  console.log(fail ? `\n${fail} FAILURE(S)` : "\nALL API CHECKS PASSED");
  process.exit(fail ? 1 : 0);
}
