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

  console.log("\n=== market data (Dukascopy mirror) ===");
  const { default: lzma } = await import("lzma");

  /* Build a real .bi5 body: LZMA-compressed 24-byte big-endian records
     laid out the way Dukascopy actually lays them out —
     (timeOffsetSeconds, open, CLOSE, low, high, volumeFloat). The close
     field really does come second, before low/high; see the header of
     server/dukascopy.js for how that was established. Record 3 below
     carries volume 0, which is how the archive pads a period the
     instrument wasn't trading in. */
  const DAY = Date.UTC(2024, 0, 2);
  const RECS = [
    { off: 0,   o: 110370, c: 110365, l: 110360, h: 110380, v: 12.5 },
    { off: 60,  o: 110365, c: 110390, l: 110365, h: 110395, v: 8.25 },
    { off: 120, o: 110390, c: 110390, l: 110390, h: 110390, v: 0 },
    { off: 180, o: 110390, c: 110400, l: 110385, h: 110405, v: 3.5 },
  ];
  const rawRecs = Buffer.alloc(RECS.length * 24);
  RECS.forEach((rec, i) => {
    const p = i * 24;
    rawRecs.writeInt32BE(rec.off, p);
    rawRecs.writeInt32BE(rec.o, p + 4);
    rawRecs.writeInt32BE(rec.c, p + 8);
    rawRecs.writeInt32BE(rec.l, p + 12);
    rawRecs.writeInt32BE(rec.h, p + 16);
    rawRecs.writeFloatBE(rec.v, p + 20);
  });
  const bi5 = Buffer.from(
    await new Promise((res, rej) => lzma.compress(rawRecs, 1, (out, err) => (err ? rej(err) : res(out))))
  );

  const origFetch = global.fetch;
  let dukaCalls = 0;
  global.fetch = async (url, opts) => {
    if (typeof url === "string" && url.includes("datafeed.dukascopy.com")) {
      dukaCalls++;
      const body = url.includes("/2024/00/02/") ? bi5 : Buffer.alloc(0);
      return { ok: true, status: 200, arrayBuffer: async () => body };
    }
    return origFetch(url, opts);
  };

  r = await call("/api/market/dukascopy/symbols", { token: adminToken });
  ok(r.status === 200 && r.body.symbols.EURUSD?.point === 100000, "symbol table lists EUR/USD with its price scale");
  ok(r.body.symbols.XAUUSD?.cls === "Metal", "gold is offered");
  ok(!!r.body.symbols.USA500IDXUSD, "the real S&P index is offered, not an ETF proxy");

  r = await call("/api/market/dukascopy/candles?symbol=EURUSD&interval=1m&from=1&to=2");
  ok(r.status === 401, "candles route requires auth");

  r = await call("/api/market/dukascopy/candles?symbol=FAKE&interval=1m&from=1&to=2", { token: adminToken });
  ok(r.status === 400 && r.body.error === "unknown_symbol", "unknown symbol rejected");

  r = await call("/api/market/dukascopy/candles?symbol=EURUSD&interval=1m&from=100&to=50", { token: adminToken });
  ok(r.status === 400 && r.body.error === "bad_range", "to <= from is rejected");

  const from = DAY, to = DAY + 3600000;
  r = await call(`/api/market/dukascopy/candles?symbol=EURUSD&interval=1m&from=${from}&to=${to}`, { token: adminToken });
  ok(r.status === 200 && r.body.candles.length === 3, "zero-volume padding bars are dropped (4 records in, 3 candles out)");
  ok(r.body.candles[0].o === 1.1037 && r.body.candles[0].c === 1.10365,
     "open/close decoded in Dukascopy's open-close-low-high field order and scaled by point");
  ok(r.body.candles[0].l === 1.1036 && r.body.candles[0].h === 1.1038, "low/high decoded from the right offsets");
  ok(r.body.candles[0].v === 12.5, "real traded volume is carried through");
  ok(r.body.candles[0].t === DAY && r.body.candles[1].t === DAY + 60000,
     "record time offsets are seconds from the start of the period");
  ok(r.body.candles[0].t < r.body.candles[1].t, "candles come back sorted ascending by time");

  const callsAfterFirst = dukaCalls;
  r = await call(`/api/market/dukascopy/candles?symbol=EURUSD&interval=1m&from=${from}&to=${to}`, { token: adminToken });
  ok(dukaCalls === callsAfterFirst, "a repeat request is served from the mirror, never re-fetched upstream");

  /* Same mirrored day, coarser interval: proves aggregation happens on
     our side, so a new timeframe costs no upstream request at all. */
  r = await call(`/api/market/dukascopy/candles?symbol=EURUSD&interval=5m&from=${from}&to=${to}`, { token: adminToken });
  ok(dukaCalls === callsAfterFirst, "a different interval over mirrored data costs no upstream request");
  ok(r.status === 200 && r.body.candles.length === 1, "the four 1m records aggregate into a single 5m candle");
  ok(r.body.candles[0].o === 1.1037 && r.body.candles[0].c === 1.104,
     "aggregated candle takes the first open and the last close");
  ok(r.body.candles[0].l === 1.1036 && r.body.candles[0].h === 1.10405, "aggregated candle spans the full low/high");
  ok(Math.abs(r.body.candles[0].v - 24.25) < 1e-6, "aggregated volume sums only the traded records");

  r = await call(`/api/market/dukascopy/candles?symbol=EURUSD&interval=1s&from=${from}&to=${to}`, { token: adminToken });
  ok(r.status === 200 && r.body.candles.length === 0, "an interval the archive has no file for (1s) comes back empty, not an error");

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
  const streakToken = r.body.accessToken, streakerId = r.body.user.id;
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

  /* The bug this covers: a streak only ever gets RESET by the CASE
     logic in the attempts route, which only runs when the user
     actually submits something. A user who just stops coming back
     was still being reported with their old, stale streak forever —
     nothing ever told them, or the UI, that it had lapsed — until
     effectiveStreak() (dailyPip.js) started computing this at read
     time instead. Deliberately never submits a SECOND attempt here:
     the whole point is that a streak must show broken from a plain
     GET, with no new attempt to trigger the old write-time reset. */
  r = await call("/api/auth/register", { method: "POST",
    body: { email: "ghosted@piptest.com", password: "ghosted-pass-9", name: "Ghosted", handle: "ghosted" } });
  const ghostToken = r.body.accessToken;
  /* Backdated on purpose, the same trick used for yesterday/twoDaysAgo
     above — real gameplay only ever submits for the real "today", so
     this specific response (streak.current already reads 0, since
     even fresh off this very submission "today" is two real days past
     twoDaysAgo) is itself just test setup, not the behavior under
     test — see the GET assertions right below for that. */
  await call("/api/daily-pip/attempts", { method: "POST", token: ghostToken, body: { challengeDate: twoDaysAgo, traded: false } });

  d = await call("/api/daily-pip/today", { token: ghostToken });
  ok(d.body.streak.current === 0, "days later, with no new attempt, GET /daily-pip/today reports the streak as broken");
  ok(d.body.streak.longest === 1, "longest is a lifetime record — a lapsed current streak doesn't erase it");

  r = await call("/api/me", { token: ghostToken });
  ok(r.body.user.dailyPipStreak === 0, "the account object (sidebar/nav icon) agrees — no stale streak number anywhere");
  ok(r.body.user.dailyPipLongestStreak === 1, "publicUser() leaves the longest-streak record alone too");

  console.log("\n=== admin: reset a user's Daily Pip ===");
  r = await call("/api/admin/users/" + streakerId + "/daily-pip/reset", { method: "POST", token: userToken });
  ok(r.status === 403, "a non-admin cannot reset another user's Daily Pip");

  r = await call("/api/admin/users/00000000-0000-0000-0000-000000000000/daily-pip/reset", { method: "POST", token: adminToken });
  ok(r.status === 404, "resetting a nonexistent user 404s");

  r = await call("/api/auth/register", { method: "POST",
    body: { email: "unplayed@piptest.com", password: "unplayed-pass-9", name: "Unplayed", handle: "unplayed" } });
  const unplayedId = r.body.user.id;
  r = await call("/api/admin/users/" + unplayedId + "/daily-pip/reset", { method: "POST", token: adminToken });
  ok(r.status === 200 && r.body.hadAttempt === false, "resetting a user who hasn't played today is a harmless no-op");

  r = await call("/api/admin/users/" + streakerId + "/daily-pip/reset", { method: "POST", token: adminToken });
  ok(r.status === 200 && r.body.hadAttempt === true, "resetting a played attempt reports it existed");
  ok(r.body.streak.current === 1, "the streak bump from today's (now-cleared) attempt is undone — back to 1 (from yesterday)");

  d = await call("/api/daily-pip/today", { token: streakToken });
  ok(d.body.attempt === null, "the reset user can see today's Pip as unplayed again");

  r = await call("/api/daily-pip/attempts", { method: "POST", token: streakToken,
    body: { challengeDate, traded: true, dir: "long", qty: 1, entry: 10, exitPrice: 12, stop: 9, target: 13, r: 2, pnl: 200, reason: "target" } });
  ok(r.status === 200 && r.body.attempt.r === 2, "the reset user can submit a fresh attempt for today");
  ok(r.body.streak.current === 2, "replaying restores the streak exactly as if the gap never happened");

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
