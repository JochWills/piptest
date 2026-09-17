/* ============================================================
   dukascopy.js — forex, index and metal candles, mirrored locally

   Dukascopy Bank publishes its historical archive free and keyless
   at datafeed.dukascopy.com. This module mirrors the slices of that
   archive we actually use into our own Postgres, then serves every
   chart request out of that mirror. Dukascopy itself is only ever
   contacted for a period we have never fetched before.

   ---- why this is not the earlier Dukascopy attempt ----

   An earlier version of this file existed and was abandoned for
   rate limiting. It was built on a wrong premise, stated in its own
   header: "There is no candle endpoint here: every candle this
   module returns is built by downloading that hour's ticks." There
   is a candle endpoint, and using it is the whole difference:

     · BID_candles_min_1.bi5  — ONE file per instrument per UTC day,
       1440 one-minute candles.
     · BID_candles_hour_1.bi5 — ONE file per instrument per UTC
       month, 744 hourly candles (a 31-day month), ~6.6 KB.

   The old code fetched one tick file per HOUR and bucketed the
   ticks by hand, so a single 1-minute chart cost ~25 requests and
   its own cap allowed 400. That is what tripped the limiter. The
   same chart costs 2-3 requests here, and costs zero once mirrored.

   ---- binary format (verified against the live feed, not assumed) ----

   Each .bi5 is LZMA-alone compressed (0x5d header; the size field
   of a 1-day min_1 file reads 34560 = 1440 x 24). Records are 24
   bytes big-endian, and the field order is the unusual one:

       int32 timeOffset   seconds from the START OF THE PERIOD
                          (the day for min_1, the month for hour_1)
       int32 open
       int32 close        <- close comes SECOND, before low/high
       int32 low
       int32 high
       float32 volume

   That ordering was confirmed by testing the OHLC invariant across
   a full day: read as (open, close, low, high) all 1440 records
   satisfy low <= min(o,c) and high >= max(o,c); read as the
   conventional (open, high, low, close) only 112 of 1440 do. Read
   it the conventional way and you get plausible-looking, silently
   wrong candles — so don't "fix" this to OHLC.

   Prices are integers scaled by the instrument's `point` (raw /
   point = real price). It is NOT uniform: forex majors are 1e5,
   while JPY-quoted pairs, gold and the index CFDs are all 1e3.
   Each value in the table below was checked by decoding a real day
   and confirming the result is a sane real-world price. Add a new
   instrument the same way rather than guessing.

   ---- closed sessions are padded, and must be dropped ----

   Instruments that don't trade around the clock still get a full
   1440-record day; the closed minutes are padded with flat
   synthetic bars. On a sample day USA500 had 105 zero-volume
   records and exactly those same 105 were fully flat (o==h==l==c),
   clustered in the 21:00-22:59 UTC CFD break. EUR/USD, which
   trades through, had none. So `volume > 0` is an exact marker for
   "this period really traded", and filtering on it is what stops
   the indices and gold from drawing long dead-flat plateaus.
   Filtering on flatness instead would be wrong: EUR/USD had 2
   genuinely flat but non-zero-volume minutes that are real bars.

   ---- rate limiting ----

   The archive throttles: ~14 quick requests from one IP returned
   503s that took roughly two minutes to clear (measured directly
   while building this). There is no published number to design
   against, so the queue below is adaptive — it widens its own gap
   whenever it's pushed back on and narrows it again after a clean
   run. Because the mirror makes every fetch a once-ever event, the
   steady state is that this queue is almost always idle.

   CORS is `https://freeserv.dukascopy.com` only (checked on the
   live response headers), so unlike the Binance feed in
   src/lib/market.js this cannot be called from the browser — it
   only works server-side.
   ============================================================ */

import { brotliCompressSync, brotliDecompressSync, constants as zc } from "node:zlib";
import lzma from "lzma";
import { q } from "./db.js";

const HOST = "https://datafeed.dukascopy.com/datafeed";
const REC_BYTES = 24;
const DAY_MS = 86400000;

/* `point`: raw integer units per 1.0 of real price. See header — not
   uniform across instrument types, and each of these was confirmed by
   decoding a real day and sanity-checking the price that came out. */
export const DUKASCOPY_SYMBOLS = {
  EURUSD:        { label: "EUR/USD",           cls: "Forex", point: 100000 },
  GBPUSD:        { label: "GBP/USD",           cls: "Forex", point: 100000 },
  USDJPY:        { label: "USD/JPY",           cls: "Forex", point: 1000 },
  USDCHF:        { label: "USD/CHF",           cls: "Forex", point: 100000 },
  USDCAD:        { label: "USD/CAD",           cls: "Forex", point: 100000 },
  AUDUSD:        { label: "AUD/USD",           cls: "Forex", point: 100000 },
  NZDUSD:        { label: "NZD/USD",           cls: "Forex", point: 100000 },
  XAUUSD:        { label: "Gold (XAU/USD)",    cls: "Metal", point: 1000 },
  USA500IDXUSD:  { label: "US 500 (S&P)",      cls: "Index", point: 1000 },
  USA30IDXUSD:   { label: "US 30 (Dow)",       cls: "Index", point: 1000 },
  USATECHIDXUSD: { label: "US Tech (Nasdaq)",  cls: "Index", point: 1000 },
};

/* Which mirrored file tier serves which chart interval. Anything
   below an hour has to come from the per-day 1-minute files; an hour
   and above is built from the per-month hourly files instead, which
   is drastically cheaper — a 1200-bar daily chart is ~40 month files
   rather than ~1200 day files. "1s" has no Dukascopy candle file at
   any tier and is simply not offered for these instruments. */
const TIER = {
  "1m": "min1", "5m": "min1", "15m": "min1", "30m": "min1",
  "1h": "hour1", "4h": "hour1", "1d": "hour1",
};
const IV_MS = {
  "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000,
  "1h": 3600000, "4h": 14400000, "1d": DAY_MS,
};

/* A period is only immutable once it has fully elapsed. Dukascopy
   finalises a day file shortly after the day closes — the 2026-03-03
   file carried last-modified 2026-03-04 00:27 UTC, ~27 minutes after
   the fact — so a 2h grace comfortably clears it. Until then the file
   is still being appended to and must not be mirrored as complete,
   or the chart silently stops at whenever we happened to fetch. */
const PUBLISH_LAG_MS = 2 * 3600000;
const PROVISIONAL_TTL_MS = 10 * 60000;

/* How much a single chart request will spend filling gaps before
   answering with whatever it has. The client already copes with
   getting less history than it asked for (loadWindow's `shortFrom`),
   so a cold wide range returns promptly and keeps filling in behind
   it rather than blocking.

   Both bounds matter. The count alone isn't enough: the queue's gap
   widens to 30s when the archive is pushing back, so ten fetches
   could otherwise hold a request open for minutes. The wall-clock
   budget is what actually guarantees the response comes back, and it
   is checked between fetches rather than racing them — a fetch
   already in flight is worth waiting for, since abandoning it would
   waste the one thing the throttle is rationing. */
const MAX_SYNC_FETCH = 10;
const SYNC_BUDGET_MS = 8000;

/* ---------- adaptive request queue ----------
   Single flight, self-tuning gap. Dukascopy publishes no rate limit,
   so rather than hard-coding a guess this widens on push-back and
   relaxes after a clean run, converging on whatever the archive is
   actually willing to serve right now. */
const GAP_MIN = 900, GAP_START = 1500, GAP_MAX = 30000;
let gapMs = GAP_START;
let okStreak = 0;
let queueTail = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enqueue(fn) {
  const run = queueTail.then(async () => {
    await sleep(gapMs);
    return fn();
  });
  queueTail = run.then(() => {}, () => {});
  return run;
}

function throttled() {
  okStreak = 0;
  gapMs = Math.min(Math.round(gapMs * 2), GAP_MAX);
}
function succeeded() {
  if (++okStreak >= 15 && gapMs > GAP_MIN) {
    gapMs = Math.max(Math.round(gapMs * 0.8), GAP_MIN);
    okStreak = 0;
  }
}

/* ---------- wire ---------- */

const pad2 = (n) => String(n).padStart(2, "0");

/* Month is ZERO-BASED in these paths (January is /00/), which is the
   single easiest thing to get wrong here — day and year are not. */
function urlFor(symbol, kind, periodStart) {
  const d = new Date(periodStart);
  const base = `${HOST}/${symbol}/${d.getUTCFullYear()}/${pad2(d.getUTCMonth())}`;
  return kind === "min1"
    ? `${base}/${pad2(d.getUTCDate())}/BID_candles_min_1.bi5`
    : `${base}/BID_candles_hour_1.bi5`;
}

const unlzma = (buf) =>
  new Promise((res, rej) =>
    lzma.decompress(Array.from(buf), (r, e) => (e || !r ? rej(e || new Error("empty lzma result")) : res(Buffer.from(r))))
  );

/* Returns the decoded record bytes, or null if the archive pushed
   back (caller leaves the period unmirrored and retries another
   time). An empty body is a real, final answer — a period the
   instrument did not trade at all, e.g. a forex Sunday. */
async function fetchPeriod(symbol, kind, periodStart, tries = 4) {
  const url = urlFor(symbol, kind, periodStart);
  for (let attempt = 1; attempt <= tries; attempt++) {
    const outcome = await enqueue(async () => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (r.status === 404) return { done: true, buf: Buffer.alloc(0) };
        if (r.status === 503 || r.status === 429) { throttled(); return { done: false }; }
        if (!r.ok) return { done: true, buf: null, hard: r.status };
        const buf = Buffer.from(await r.arrayBuffer());
        succeeded();
        return { done: true, buf: buf.length ? await unlzma(buf) : Buffer.alloc(0) };
      } catch {
        /* timeouts and connection resets are how the throttle usually
           shows up in practice, not a clean 503 */
        throttled();
        return { done: false };
      }
    });
    if (outcome.done) {
      if (outcome.hard) console.error(`dukascopy ${symbol} ${kind} HTTP ${outcome.hard}`);
      return outcome.buf;
    }
  }
  return null;
}

/* ---------- mirror ---------- */

const periodEnd = (kind, start) =>
  kind === "min1" ? start + DAY_MS : Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);

const isFinal = (kind, start) => periodEnd(kind, start) + PUBLISH_LAG_MS <= Date.now();

/* Every period start covering [fromMs, toMs], oldest first. */
function periodsFor(kind, fromMs, toMs) {
  const out = [];
  if (kind === "min1") {
    let t = Math.floor(fromMs / DAY_MS) * DAY_MS;
    for (; t <= toMs; t += DAY_MS) out.push(t);
  } else {
    const d = new Date(fromMs);
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    for (let t = Date.UTC(y, m, 1); t <= toMs; t = Date.UTC(y, ++m, 1)) out.push(t);
  }
  return out;
}

async function readMirror(symbol, kind, starts) {
  if (!starts.length) return new Map();
  const r = await q(
    `SELECT period_start, bars, is_final, fetched_at FROM duka_bars
      WHERE symbol = $1 AND kind = $2 AND period_start = ANY($3::bigint[])`,
    [symbol, kind, starts]
  );
  const out = new Map();
  for (const row of r.rows) {
    const stale = !row.is_final && Date.now() - new Date(row.fetched_at).getTime() > PROVISIONAL_TTL_MS;
    if (!stale) out.set(Number(row.period_start), brotliDecompressSync(Buffer.from(row.bars, "base64")));
  }
  return out;
}

async function writeMirror(symbol, kind, periodStart, records) {
  /* Brotli rather than storing the .bi5 verbatim: decoding LZMA in
     pure JS costs ~25ms a file, which a wide chart would pay dozens
     of times over on every read, while brotli decompress is ~0.1ms
     and native. base64 because the column is text, not bytea — see
     db.js for why that's deliberate.

     Max quality on purpose. It's ~27ms a period instead of ~3ms, but
     that's paid once ever, at ingest, behind a network fetch that is
     already pacing itself in seconds — while it shrinks a stored
     period by ~18% (16.5KB -> 13.5KB on a measured EUR/USD day),
     which more than pays back base64's overhead. Decompression speed
     is unaffected by the level, so reads get the smaller payload for
     free. Postgres will NOT compress this further: pg_column_size
     comes back identical to octet_length, because pglz gives up on
     data this dense. This is the only compression it gets. */
  const bars = brotliCompressSync(records, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).toString("base64");
  await q(
    `INSERT INTO duka_bars (symbol, kind, period_start, bars, n, is_final, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6, now())
     ON CONFLICT (symbol, kind, period_start)
     DO UPDATE SET bars = EXCLUDED.bars, n = EXCLUDED.n,
                   is_final = EXCLUDED.is_final, fetched_at = now()`,
    [symbol, kind, periodStart, bars, Math.floor(records.length / REC_BYTES), isFinal(kind, periodStart)]
  );
}

/* Fetch one period and mirror it. Exported so the backfill script can
   drive the same path a live request would. */
export async function mirrorPeriod(symbol, kind, periodStart) {
  const records = await fetchPeriod(symbol, kind, periodStart);
  if (records == null) return null;
  await writeMirror(symbol, kind, periodStart, records);
  return records;
}

/* ---------- decode + aggregate ---------- */

function recordsToBars(records, periodStart, point) {
  const bars = [];
  for (let o = 0; o + REC_BYTES <= records.length; o += REC_BYTES) {
    const v = records.readFloatBE(o + 20);
    if (!(v > 0)) continue; // closed-session padding — see header
    bars.push({
      t: periodStart + records.readInt32BE(o) * 1000,
      o: records.readInt32BE(o + 4) / point,
      c: records.readInt32BE(o + 8) / point,
      l: records.readInt32BE(o + 12) / point,
      h: records.readInt32BE(o + 16) / point,
      v,
    });
  }
  return bars;
}

function aggregate(bars, ivMs) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const bt = Math.floor(b.t / ivMs) * ivMs;
    if (!cur || cur.t !== bt) {
      if (cur) out.push(cur);
      cur = { t: bt, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
    } else {
      if (b.h > cur.h) cur.h = b.h;
      if (b.l < cur.l) cur.l = b.l;
      cur.c = b.c;
      cur.v += b.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* ---------- public ---------- */

export async function loadDukascopyCandles(symbol, interval, fromMs, toMs) {
  const meta = DUKASCOPY_SYMBOLS[symbol];
  if (!meta) return null;
  const kind = TIER[interval];
  if (!kind) return []; // "1s" — no candle file exists at any tier

  const starts = periodsFor(kind, fromMs, toMs);
  const have = await readMirror(symbol, kind, starts);
  const missing = starts.filter((s) => !have.has(s));

  /* Newest first: if we can't fetch everything now, the user is far
     better served by contiguous history ending at their target than
     by the oldest slice of the range with a hole after it. */
  missing.sort((a, b) => b - a);

  const deadline = Date.now() + SYNC_BUDGET_MS;
  const deferred = [];
  for (let i = 0; i < missing.length; i++) {
    const s = missing[i];
    if (i >= MAX_SYNC_FETCH || Date.now() >= deadline) { deferred.push(s); continue; }
    const rec = await mirrorPeriod(symbol, kind, s);
    if (rec) have.set(s, rec);
    else deferred.push(s); // throttled — leave it for the background pass
  }

  /* Anything we didn't get to is filled in behind the response so the
     next load of this range is served entirely from the mirror.
     Deliberately not awaited. */
  if (deferred.length) {
    (async () => {
      for (const s of deferred) {
        try {
          /* null means the archive is still pushing back; pressing on
             through the rest would just queue up more of the same */
          if (!(await mirrorPeriod(symbol, kind, s))) break;
        } catch (e) {
          console.error("dukascopy backfill:", symbol, kind, s, e.message);
          break;
        }
      }
    })();
  }

  const bars = [];
  for (const s of starts) {
    const rec = have.get(s);
    if (rec?.length) bars.push(...recordsToBars(rec, s, meta.point));
  }
  bars.sort((a, b) => a.t - b.t);

  return aggregate(bars, IV_MS[interval] || 60000).filter((b) => b.t >= fromMs && b.t <= toMs);
}
