/* ============================================================
   twelvedata.js — forex & index-ETF candles from Twelve Data

   Replaces the earlier Dukascopy attempt. Dukascopy's public tick
   archive worked, but its rate limiting was undocumented and started
   rejecting requests after roughly a dozen of them during testing —
   no published number to design a cache and backoff around. Twelve
   Data's free tier is a real, disclosed contract instead (verified
   directly against the live API with a real key, not taken from
   marketing copy): 800 requests/day, 8/minute, up to 5,000 candles
   per call, plain JSON, CORS wide open (though this still goes
   through our own server rather than the browser, same as
   Dukascopy did, so the API key stays server-side and every user's
   traffic shares one well-behaved queue instead of racing Twelve
   Data's per-minute cap directly).

   Genuine indices (S&P 500, Dow, Nasdaq) are paywalled on the free
   plan — confirmed directly: requesting them returns Twelve Data's
   own "available starting with the Grow/Pro plan" error, not a
   guess. What ships here instead are the ETFs that track them
   closely and *are* free — SPY, DIA, QQQ — labelled as such in
   theme.js rather than presented as the literal index.

   One easy mistake worth flagging for whoever touches this next:
   Twelve Data's datetimes are NOT UTC by default (confirmed by
   comparing a call with and without it — the timestamps shifted by
   hours). Always pass timezone=UTC, or every candle lands on the
   wrong bar for anyone replaying against real session times.
   ============================================================ */

const BASE = "https://api.twelvedata.com";

/* apiSymbol is what Twelve Data expects on the wire; the object key
   is Piptest's own internal id (matches the no-punctuation convention
   the Binance symbols already use, e.g. BTCUSDT not BTC/USDT). */
export const TWELVE_DATA_SYMBOLS = {
  EURUSD: { apiSymbol: "EUR/USD", label: "EUR/USD", cls: "Forex" },
  GBPUSD: { apiSymbol: "GBP/USD", label: "GBP/USD", cls: "Forex" },
  USDJPY: { apiSymbol: "USD/JPY", label: "USD/JPY", cls: "Forex" },
  USDCHF: { apiSymbol: "USD/CHF", label: "USD/CHF", cls: "Forex" },
  USDCAD: { apiSymbol: "USD/CAD", label: "USD/CAD", cls: "Forex" },
  AUDUSD: { apiSymbol: "AUD/USD", label: "AUD/USD", cls: "Forex" },
  NZDUSD: { apiSymbol: "NZD/USD", label: "NZD/USD", cls: "Forex" },
  SPY: { apiSymbol: "SPY", label: "US 500 (SPY)", cls: "Index ETF" },
  DIA: { apiSymbol: "DIA", label: "US 30 (DIA)", cls: "Index ETF" },
  QQQ: { apiSymbol: "QQQ", label: "US Tech (QQQ)", cls: "Index ETF" },
};

/* Twelve Data has no 1-second interval — Piptest's "1s" option simply
   isn't offered for these symbols (see the client-side interval
   picker, which hides it for a non-Binance symbol). */
const INTERVAL_MAP = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1h": "1h", "4h": "4h", "1d": "1day",
};

/* ---------- rate limit ----------
   8/minute is a real, published number, so — unlike Dukascopy — this
   can just be paced evenly against it rather than guessed at: one
   request every 60s/8 = 7.5s, rounded up for a safety margin. */
const MIN_GAP_MS = 8000;
let queueTail = Promise.resolve();

function enqueue(fn) {
  const run = queueTail.then(async () => {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    return fn();
  });
  queueTail = run.catch(() => {});
  return run;
}

/* ---------- permanent cache ----------
   Published candles never change, so a hit never needs revalidating.
   One call can cover up to 5,000 candles, so this fills in far fewer,
   coarser-grained entries than the Dukascopy attempt's per-hour cache
   did — a handful of requests can backfill months of a symbol. */
const MAX_CACHE_ENTRIES = 5000;
const cache = new Map();
const cacheKey = (symbol, interval, fromMs, toMs) => `${symbol}|${interval}|${fromMs}|${toMs}`;

const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

export async function loadTwelveDataCandles(symbol, interval, fromMs, toMs) {
  const meta = TWELVE_DATA_SYMBOLS[symbol];
  if (!meta) return null;
  const ivParam = INTERVAL_MAP[interval];
  if (!ivParam) return []; // e.g. "1s" — this feed just doesn't have it

  const key = cacheKey(symbol, interval, fromMs, toMs);
  if (cache.has(key)) return cache.get(key);
  /* read fresh rather than cached in a module-level const — this way
     the route fails clearly per-request if the key is ever unset,
     instead of every request failing identically since boot */
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY is not set");

  const candles = await enqueue(async () => {
    const url = `${BASE}/time_series?symbol=${encodeURIComponent(meta.apiSymbol)}&interval=${ivParam}`
      + `&start_date=${encodeURIComponent(fmtDate(fromMs))}&end_date=${encodeURIComponent(fmtDate(toMs))}`
      + `&outputsize=5000&timezone=UTC&apikey=${apiKey}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status === "error") {
      /* "no data on these dates" is a normal outcome — market closed,
         or past how far back the free plan reaches — not a failure */
      if (/no data/i.test(data.message || "")) return [];
      throw new Error(`twelvedata ${symbol} ${interval}: ${data.message || data.code}`);
    }
    return (data.values || [])
      .map((v) => ({ t: Date.parse(v.datetime + "Z"), o: +v.open, h: +v.high, l: +v.low, c: +v.close }))
      .sort((a, b) => a.t - b.t);
  });

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, candles);
  return candles;
}

/* Live quotes (a /quote-based ticker) were tried and retired along
   with Market Watch — confirmed directly that a quote batch costs one
   Twelve Data credit PER SYMBOL, not per call, which competed hard
   with the candle requests that are the actual point of this app. If
   a ticker feature comes back, that cost is the first thing to
   re-derive a budget for — don't just wire /quote back in at whatever
   cadence feels reasonable. */
