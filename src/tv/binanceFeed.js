/* ============================================================
   binanceFeed.js — market data for the TradingView datafeed

   Owns fetching, paging and caching. Knows nothing about
   TradingView or about replay; it just answers "give me bars
   for SYMBOL/RESOLUTION between A and B".
   ============================================================ */

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const PAGE = 1000;                       // Binance hard limit per request
const MAX_PAGES_PER_CALL = 6;            // guard against runaway loops

/* TradingView resolution -> Binance interval.
   TV uses "1S" for seconds, plain minutes as numbers, "1D" for days. */
export const RES_TO_BINANCE = {
  "1S": "1s", "5S": "5s", "15S": "15s", "30S": "30s",
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1h", "120": "2h", "240": "4h", "360": "6h", "480": "8h", "720": "12h",
  "1D": "1d", "3D": "3d", "1W": "1w", "1M": "1M",
};

export const RES_MS = {
  "1S": 1e3, "5S": 5e3, "15S": 15e3, "30S": 30e3,
  "1": 6e4, "3": 18e4, "5": 3e5, "15": 9e5, "30": 18e5,
  "60": 36e5, "120": 72e5, "240": 144e5, "360": 216e5, "480": 288e5, "720": 432e5,
  "1D": 864e5, "3D": 2592e5, "1W": 6048e5, "1M": 2592e6,
};

export const SUPPORTED_RESOLUTIONS = ["1S", "5S", "15S", "30S", "1", "5", "15", "30", "60", "240", "1D", "1W"];

const key = (symbol, res) => `${symbol}|${res}`;

/* one cache entry per symbol+resolution */
function emptyEntry() {
  return { bars: [], oldestRequested: null, exhaustedLeft: false };
}

export class BinanceFeed {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
  }

  entry(symbol, res) {
    const k = key(symbol, res);
    if (!this.cache.has(k)) this.cache.set(k, emptyEntry());
    return this.cache.get(k);
  }

  clear() { this.cache.clear(); }

  async rawKlines(symbol, interval, startTime, limit = PAGE) {
    for (const host of HOSTS) {
      try {
        const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}`
          + `&startTime=${Math.floor(startTime)}&limit=${limit}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const raw = await res.json();
        if (!Array.isArray(raw)) continue;
        return raw.map((k) => ({
          time: k[0],                    // ms — what TradingView expects
          open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
        }));
      } catch (e) { /* try the next host */ }
    }
    return null;
  }

  /* Fetch forward from `startMs` until we have at least `wanted` bars
     or the exchange stops returning data. */
  async fetchForward(symbol, interval, startMs, wanted) {
    const ivMs = 60000;
    let out = [], cursor = startMs, pages = 0;
    while (out.length < wanted && pages++ < MAX_PAGES_PER_CALL) {
      const chunk = await this.rawKlines(symbol, interval, cursor);
      if (!chunk || !chunk.length) break;
      const last = out.length ? out[out.length - 1].time : -Infinity;
      const fresh = chunk.filter((b) => b.time > last);
      if (!fresh.length) break;
      out = out.concat(fresh);
      if (chunk.length < PAGE) break;
      cursor = chunk[chunk.length - 1].time + 1;
    }
    return out;
  }

  /* Bars in [fromMs, toMs). countBack is TradingView's hint for how many
     bars it wants ending at `toMs` — honouring it keeps the chart full
     when the user pans into thin history. */
  async getRange(symbol, res, fromMs, toMs, countBack = 0) {
    const interval = RES_TO_BINANCE[res];
    if (!interval) return { bars: [], noData: true };
    const ivMs = RES_MS[res] || 60000;
    const e = this.entry(symbol, res);

    const need = Math.max(countBack, Math.ceil((toMs - fromMs) / ivMs) + 2);
    const haveFrom = e.bars.length ? e.bars[0].time : null;

    /* extend the cache backwards if the request reaches before what we hold */
    if (!e.bars.length || fromMs < haveFrom) {
      if (!e.exhaustedLeft) {
        const k = key(symbol, res);
        if (!this.inflight.has(k)) {
          const start = Math.min(fromMs, haveFrom ?? fromMs) - ivMs;
          this.inflight.set(k, this.fetchForward(symbol, interval, start, need + PAGE));
        }
        const fetched = await this.inflight.get(k);
        this.inflight.delete(k);
        if (!fetched.length) {
          e.exhaustedLeft = true;
        } else {
          const merged = new Map();
          for (const b of fetched) merged.set(b.time, b);
          for (const b of e.bars) merged.set(b.time, b);
          e.bars = [...merged.values()].sort((a, b) => a.time - b.time);
          /* the exchange gave us nothing older than we asked for → no more history */
          if (e.bars[0].time > fromMs + ivMs) e.exhaustedLeft = true;
          e.earliest = e.bars[0].time;
        }
      }
    }

    /* extend forwards if the request runs past what we hold */
    const haveTo = e.bars.length ? e.bars[e.bars.length - 1].time : null;
    if (haveTo != null && toMs > haveTo + ivMs) {
      const more = await this.fetchForward(symbol, interval, haveTo + 1, need);
      if (more.length) {
        const merged = new Map();
        for (const b of e.bars) merged.set(b.time, b);
        for (const b of more) merged.set(b.time, b);
        e.bars = [...merged.values()].sort((a, b) => a.time - b.time);
      }
    }

    const bars = e.bars.filter((b) => b.time >= fromMs && b.time < toMs);
    /* TradingView treats an empty result with noData:false as "retry",
       so be explicit once we know there is genuinely nothing older. */
    const noData = bars.length === 0 && e.exhaustedLeft;
    return { bars, noData, earliest: e.bars.length ? e.bars[0].time : null };
  }

  /* The bar immediately after `afterMs` — the replay engine's next step. */
  async nextBar(symbol, res, afterMs) {
    const ivMs = RES_MS[res] || 60000;
    const e = this.entry(symbol, res);
    let hit = e.bars.find((b) => b.time > afterMs);
    if (hit) return hit;
    const interval = RES_TO_BINANCE[res];
    const more = await this.fetchForward(symbol, interval, afterMs + 1, 300);
    if (!more.length) return null;
    const merged = new Map();
    for (const b of e.bars) merged.set(b.time, b);
    for (const b of more) merged.set(b.time, b);
    e.bars = [...merged.values()].sort((a, b) => a.time - b.time);
    return e.bars.find((b) => b.time > afterMs) || null;
  }

  /* Make sure the cache covers `ms` for this resolution, fetching if not.
     Returns false when the exchange genuinely has no data that far back at
     this granularity — 1s candles from months ago, typically. */
  async ensureAround(symbol, res, ms) {
    const ivMs = RES_MS[res] || 60000;
    const e = this.entry(symbol, res);
    const covered = e.bars.length && e.bars[0].time <= ms && e.bars[e.bars.length - 1].time >= ms;
    if (covered) return true;
    const interval = RES_TO_BINANCE[res];
    if (!interval) return false;
    const fetched = await this.fetchForward(symbol, interval, ms - 400 * ivMs, 900);
    if (fetched.length) {
      const merged = new Map();
      for (const b of e.bars) merged.set(b.time, b);
      for (const b of fetched) merged.set(b.time, b);
      e.bars = [...merged.values()].sort((a, b) => a.time - b.time);
    }
    return !!(e.bars.length && e.bars[0].time <= ms);
  }

  /* Bar containing a moment — used to align the cursor across resolutions. */
  barAt(symbol, res, ms) {
    const e = this.entry(symbol, res);
    let lo = 0, hi = e.bars.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (e.bars[mid].time <= ms) { best = e.bars[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }
}

export const feed = new BinanceFeed();
