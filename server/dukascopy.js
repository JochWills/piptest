/* ============================================================
   dukascopy.js — forex & index candles from Dukascopy's public
   tick archive

   datafeed.dukascopy.com serves one LZMA-compressed file of raw
   ticks per instrument per hour, free and keyless — the same
   source virtually every open-source forex backtesting tool
   (duka, dukascopy-node, MT4/5 plugins) is built on. There is no
   candle endpoint here: every candle this module returns is built
   by downloading that hour's ticks and bucketing them ourselves.

   Two things this integration has to respect, both learned by
   testing against the live service rather than assumed:

   · It rate-limits hard — a handful of requests in a short window
     from one IP was enough to get a 503 that lasted minutes. A
     single request queue below enforces one in flight at a time
     with a minimum gap, and backs off hard on failure, rather than
     firing everything a candle request needs at once.
   · Historical data never changes once published, so a huge cache
     win is available: once any hour's ticks are fetched, they are
     cached forever and never fetched again — a burst of demand for
     the same range (many users, or one user scrubbing back and
     forth) costs the queue above nothing after the first pass.

   This cache is in-process memory only — it's lost on a redeploy
   or when Render's free tier recycles the instance after 15 min
   idle, so the slow first-load can recur after a restart. Worth
   moving to Postgres if that turns out to matter in practice; not
   done up front since it's a real design choice (raw ticks vs.
   pre-aggregated candles) better made once there's real usage to
   look at rather than guessed at now.

   CORS note: datafeed.dukascopy.com only allows requests from
   Dukascopy's own site (verified directly against the live
   response header), so this cannot be called from the browser —
   it only works fetched server-side, which is what this module,
   called from routes.js, does.
   ============================================================ */

import { decompress } from "lzma";

const HOST = "https://datafeed.dukascopy.com/datafeed";
const HOUR_MS = 3600000;
const TICK_BYTES = 20;

/* point = raw integer units per 1.0 of real price (raw / point = price).
   Verified against the live feed, not assumed: fetched a real hour for
   each of these and checked the decoded price against known real-world
   history for that date (e.g. EUR/USD ≈ 1.10 and Dow ≈ 37,600 on
   2024-01-02). Add a new symbol the same way — don't guess the point
   value, it's not consistent across instrument types (forex majors are
   1e5, JPY-quoted pairs and these four indices are all 1e3). */
export const DUKASCOPY_SYMBOLS = {
  EURUSD:        { label: "EUR/USD",             cls: "Forex", point: 100000 },
  GBPUSD:        { label: "GBP/USD",             cls: "Forex", point: 100000 },
  USDJPY:        { label: "USD/JPY",             cls: "Forex", point: 1000 },
  USDCHF:        { label: "USD/CHF",             cls: "Forex", point: 100000 },
  USDCAD:        { label: "USD/CAD",             cls: "Forex", point: 100000 },
  AUDUSD:        { label: "AUD/USD",             cls: "Forex", point: 100000 },
  NZDUSD:        { label: "NZD/USD",             cls: "Forex", point: 100000 },
  USA30IDXUSD:   { label: "US 30 (Dow)",         cls: "Index", point: 1000 },
  USA500IDXUSD:  { label: "US 500 (S&P)",        cls: "Index", point: 1000 },
  USATECHIDXUSD: { label: "US Tech (Nasdaq)",    cls: "Index", point: 1000 },
  DEUIDXEUR:     { label: "Germany 40 (DAX)",    cls: "Index", point: 1000 },
};

const INTERVAL_MS = {
  "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000,
  "1h": 3600000, "4h": 14400000, "1d": 86400000,
};

/* ---------- single-flight request queue ----------
   One request in flight at a time, a minimum gap between them, and
   exponential backoff after a failure. This is deliberately far more
   conservative than the free tier of most APIs needs, because this
   isn't a documented, rate-disclosed API — it's a public archive that
   pushed back hard during testing at a request rate that would be
   unremarkable for almost anything else — a plain, unhurried burst
   of a dozen or so requests spread across several minutes was enough
   to draw a 429 on the very next request afterwards, cold. */
const MIN_GAP_MS = 1500;
let queueTail = Promise.resolve();
let backoffMs = 0;

function enqueue(fn) {
  const run = queueTail.then(async () => {
    if (backoffMs > 0) {
      await new Promise((r) => setTimeout(r, backoffMs));
    }
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    try {
      const result = await fn();
      backoffMs = 0;
      return result;
    } catch (e) {
      backoffMs = backoffMs ? Math.min(backoffMs * 2, 120000) : 5000;
      throw e;
    }
  });
  /* keep the chain alive even if this particular call rejects */
  queueTail = run.catch(() => {});
  return run;
}

/* ---------- per-hour tick cache ----------
   Historical ticks are immutable, so a hit never needs revalidating.
   Capped so a wide symbol/date sweep can't grow this unboundedly in a
   long-running process; eviction is oldest-inserted-first, which is
   good enough here since re-fetching an evicted hour is cheap relative
   to how rarely any one hour gets requested twice in the same process
   lifetime. */
const MAX_CACHE_ENTRIES = 20000;
const tickCache = new Map(); // key -> ticks[] (resolved) — only successful fetches are cached

function cacheKey(symbol, y, m0, d, h) {
  return `${symbol}|${y}-${m0}-${d}-${h}`;
}

async function fetchHourTicks(symbol, meta, y, m0, d, h) {
  const key = cacheKey(symbol, y, m0, d, h);
  const cached = tickCache.get(key);
  if (cached) return cached;

  const ticks = await enqueue(async () => {
    const url = `${HOST}/${symbol}/${y}/${String(m0).padStart(2, "0")}/${String(d).padStart(2, "0")}/${String(h).padStart(2, "0")}h_ticks.bi5`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`dukascopy ${symbol} ${y}-${m0}-${d}-${h}h: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return []; // no ticks this hour — market closed, a real and cacheable outcome

    const out = await new Promise((resolve, reject) => {
      decompress(Array.from(buf), (result, error) => {
        if (error || !result) { reject(error || new Error("empty lzma result")); return; }
        resolve(typeof result === "string" ? Buffer.from(result, "binary") : Buffer.from(result));
      });
    });

    const hourStart = Date.UTC(y, m0, d, h);
    const list = [];
    for (let o = 0; o + TICK_BYTES <= out.length; o += TICK_BYTES) {
      list.push({
        t: hourStart + out.readUInt32BE(o),
        bid: out.readUInt32BE(o + 8) / meta.point,
      });
    }
    return list;
  });

  if (tickCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = tickCache.keys().next().value;
    tickCache.delete(oldest);
  }
  tickCache.set(key, ticks);
  return ticks;
}

/* ---------- candles ----------
   Built from bid-price ticks (the standard charting convention for
   forex) bucketed into the requested interval. maxHours bounds how
   much one call will walk — at ~0.4s/hour minimum through the queue
   above, 400 hours is already a multi-minute cold load, which is the
   accepted tradeoff for a free, keyless historical feed. */
export async function loadDukascopyCandles(symbol, interval, fromMs, toMs, maxHours = 400) {
  const meta = DUKASCOPY_SYMBOLS[symbol];
  if (!meta) return null;
  const ivMs = INTERVAL_MS[interval] || 60000;

  let cursor = Math.floor(fromMs / HOUR_MS) * HOUR_MS;
  const end = Math.min(toMs, cursor + maxHours * HOUR_MS);
  const buckets = new Map();

  while (cursor < end) {
    const d = new Date(cursor);
    let ticks;
    try {
      ticks = await fetchHourTicks(symbol, meta, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
    } catch (e) {
      /* one bad hour (a transient block, a genuine gap) shouldn't sink
         the whole range — the caller sees a shorter series instead of
         an error, same as market.js's own "shortFrom" honesty pattern.
         Still worth a log line: a run of these means Dukascopy is
         throttling or down, not that the range is actually empty. */
      console.error("dukascopy hour fetch failed:", e.message);
      ticks = [];
    }
    for (const t of ticks) {
      const bt = Math.floor(t.t / ivMs) * ivMs;
      let c = buckets.get(bt);
      if (!c) { c = { t: bt, o: t.bid, h: t.bid, l: t.bid, c: t.bid, v: 0 }; buckets.set(bt, c); }
      if (t.bid > c.h) c.h = t.bid;
      if (t.bid < c.l) c.l = t.bid;
      c.c = t.bid;
      c.v++;
    }
    cursor += HOUR_MS;
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t);
}
