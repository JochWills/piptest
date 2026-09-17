/* ============================================================
   dailyPip.js — "The Daily Pip" challenge selection

   One historical chart, the same for every user, per UTC calendar
   day. Crypto only (Binance), which is unlimited, keyless and
   fetched client-direct, so a whole userbase opening the identical
   symbol+range the moment it's published costs us nothing.

   This was originally crypto-only because the alternative feed was
   a shared, quota-metered API key that a global daily challenge
   could have drained in minutes. That constraint is gone — the
   forex/index/gold feed is now served from our own mirror (see
   dukascopy.js), where a given symbol+range is fetched upstream at
   most once ever, no matter how many people ask for it. So opening
   this pool up to forex, gold or the indices is now a product
   decision rather than a rate-limit one.

   Holds its own symbol list here rather than importing from src/ —
   this server is a separate deployed service with its own
   node_modules, not a shared build with the frontend.

   Selection is deterministic (seeded from the date string, not
   random) so every user genuinely gets the same puzzle, computed
   once and cached in daily_pip_challenges rather than recomputed
   per request — recomputing on every request would still be
   deterministic and thus still consistent, but caching means the
   symbol/date pair for "today" never depends on exactly when in the
   day it happens to first get computed.
   ============================================================ */

import crypto from "node:crypto";
import { q, dateColToStr } from "./db.js";

export const BINANCE_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "LTCUSDT",
];

/* Fixed for v1 rather than another seeded dimension — a 3-minute
   countdown followed by an auto-play reveal wants a resolution fine
   enough to give the reveal some real motion without needing an
   enormous bar cap to reach a resolution. */
export const CHALLENGE_INTERVAL = "5m";

/* ~33h of 5m bars — ample runway for a reasonable stop/target to
   resolve; the reveal force-closes ("timeout"/"unfilled", see
   routes.js) if it doesn't. Tune after a few manual playthroughs. */
export const MAX_REVEAL_BARS = 400;

export const utcDateKey = (d = new Date()) => d.toISOString().slice(0, 10);

/* A stored daily_pip_streak is only still real if it covers yesterday
   or today — miss a whole UTC day with no attempt and it's broken,
   even though nothing writes that back to the row until the user's
   next attempt naturally lands on it (the CASE logic in routes.js
   already resets to 1 there, since daily_pip_last_date won't match
   "yesterday" any more). Nothing here ever runs on a schedule to
   catch a streak the moment it lapses — every place that reports a
   streak (publicUser() in auth.js, streakOf() in routes.js) computes
   this at read time instead, which is cheap, always correct no
   matter how long it's been, and needs no migration or cron job:
   a user who never plays again just keeps reading 0 forever, a user
   who comes back gets the real reset written for free by the
   existing attempt-submit logic. */
export function effectiveStreak(streak, lastDateStr, todayKey = utcDateKey()) {
  if (!streak || !lastDateStr) return 0;
  const last = Date.parse(lastDateStr + "T00:00:00Z");
  const today = Date.parse(todayKey + "T00:00:00Z");
  if (!Number.isFinite(last) || !Number.isFinite(today)) return 0;
  const daysSince = Math.round((today - last) / 86400000);
  return daysSince <= 1 ? streak : 0;
}

/* mulberry32 — small, fast, well-known 32-bit PRNG. Seeded from a
   sha256 of the date string (node:crypto, already a dependency used
   this way elsewhere in this server) rather than Math.random(), so
   the exact same sequence comes out for every request on the same
   UTC day, on any server instance. */
function mulberry32(seed) {
  return function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromDate(dateKey) {
  const hex = crypto.createHash("sha256").update(dateKey).digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

/* Same "30-700 days ago, truncated to the hour" shape as Dashboard's
   existing blind-session start-date logic (src/pages/Dashboard.jsx),
   just seeded instead of Math.random()-driven. */
function pickChallenge(dateKey) {
  const rnd = mulberry32(seedFromDate(dateKey));
  const symbol = BINANCE_SYMBOLS[Math.floor(rnd() * BINANCE_SYMBOLS.length)];
  let startMs = Date.now() - Math.floor(rnd() * 670 + 30) * 86400000;
  startMs -= startMs % 3600000;
  return { symbol, interval: CHALLENGE_INTERVAL, startMs };
}

const rowToChallenge = (r) => ({
  challengeDate: dateColToStr(r.challenge_date),
  symbol: r.symbol, interval: r.interval, startMs: Number(r.start_ms),
});

/* Resolve today's (or any given date's) challenge, creating it if
   this is the first request for that day. INSERT ... ON CONFLICT DO
   NOTHING with no RETURNING, followed by an unconditional SELECT —
   deliberately not `ON CONFLICT DO NOTHING RETURNING *`: verified
   against this repo's actual pg-mem dependency that RETURNING on a
   no-op conflict misbehaves there, and this shape is safe under two
   simultaneous first-requesters of the same day regardless (both
   insert the same deterministic values; whichever INSERT actually
   sticks, the follow-up SELECT sees it). */
export async function resolveChallenge(dateKey) {
  const picked = pickChallenge(dateKey);
  await q(
    `INSERT INTO daily_pip_challenges (challenge_date, symbol, interval, start_ms)
     VALUES ($1,$2,$3,$4) ON CONFLICT (challenge_date) DO NOTHING`,
    [dateKey, picked.symbol, picked.interval, picked.startMs]
  );
  const { rows } = await q("SELECT * FROM daily_pip_challenges WHERE challenge_date=$1", [dateKey]);
  return rows[0] ? rowToChallenge(rows[0]) : null;
}
