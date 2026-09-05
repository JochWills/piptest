/* ============================================================
   marketFeed.js — market data for the TradingView datafeed

   Owns caching and TradingView-shaped lookups (getRange, nextBar,
   ensureAround, barAt). The actual fetching — Binance direct from
   the browser, or forex/index ETFs through our own API to Twelve
   Data — is NOT duplicated here: it's the same lib/candles.js the
   rest of the app already uses, so this feed picks up every fix
   and quirk-handling (the weekend/market-hours widening for
   TwelveData, the multi-host Binance fallback, and the deterministic
   synthetic fallback when a feed is unreachable) for free, and can
   never drift out of sync with the "real" chart the way a second,
   hand-rolled Binance client would.

   This is the one piece of src/tv/ that had to change once the
   forex/index markets were added — see TRADINGVIEW.md for how
   candles.js routes a symbol to Binance vs Twelve Data.
   ============================================================ */

import { loadWindow, fetchPaged } from "../lib/candles.js";
import { barMsOf, INTERVALS } from "../theme.js";

/* TradingView resolution code <-> Piptest interval id. These are the
   only granularities the rest of the app (replay bar, order engine,
   room sync) understands, so the datafeed must not advertise more
   than this regardless of what Binance/TradingView themselves support. */
export const TV_RES_TO_IV = { "1S": "1s", "1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "240": "4h", "1D": "1d" };
export const IV_TO_TV_RES = Object.fromEntries(Object.entries(TV_RES_TO_IV).map(([tv, iv]) => [iv, tv]));
export const SUPPORTED_RESOLUTIONS = INTERVALS.map((i) => IV_TO_TV_RES[i.id]).filter(Boolean);

const key = (symbol, res) => `${symbol}|${res}`;
const toTV = (b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v ?? 0 });

function emptyEntry() { return { bars: [], exhaustedLeft: false }; }

class MarketFeed {
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

  _merge(e, fresh) {
    if (!fresh || !fresh.length) return;
    const merged = new Map();
    for (const b of e.bars) merged.set(b.t, b);
    for (const b of fresh) merged.set(b.t, b);
    e.bars = [...merged.values()].sort((a, b) => a.t - b.t);
  }

  /* Load a window centred on `aroundMs` — coalesced so panning fast
     doesn't fire a request per frame for the same stretch of history.
     The dedup key includes a coarse (6h) bucket of `aroundMs`, not just
     symbol/resolution: two requests a few frames apart while panning
     land in the same bucket and correctly share one fetch, but two
     requests for genuinely distant moments (e.g. a multiplayer guest's
     chart racing to mount at its own placeholder date, briefly, before
     jumping to the room's real one — both for the same symbol/resolution)
     used to collapse into a single fetch keyed on whichever one happened
     to start first, silently starving the other of the data it actually
     needed and leaving its cursor/price/OHLC stuck on the wrong moment
     forever (nothing ever retried it). */
  async _ensureWindow(symbol, ivId, aroundMs) {
    const bucket = Math.floor(aroundMs / (6 * 3600 * 1000));
    const k = `${key(symbol, ivId)}|${bucket}`;
    if (this.inflight.has(k)) return this.inflight.get(k);
    const p = loadWindow(symbol, ivId, aroundMs)
      .then((r) => {
        const e = this.entry(symbol, ivId);
        this._merge(e, r.bars);
        if (!r.bars.length) e.exhaustedLeft = true;
        return r;
      })
      .finally(() => this.inflight.delete(k));
    this.inflight.set(k, p);
    return p;
  }

  /* Bars in [fromMs, toMs). countBack is TradingView's hint for how many
     bars it wants ending at `toMs` — used to widen a thin forward fetch. */
  async getRange(symbol, res, fromMs, toMs, countBack = 0) {
    const ivId = TV_RES_TO_IV[res];
    if (!ivId) return { bars: [], noData: true };
    const ivMs = barMsOf(ivId);
    let e = this.entry(symbol, ivId);

    const covers = e.bars.length && e.bars[0].t <= fromMs && e.bars[e.bars.length - 1].t >= Math.min(toMs, fromMs + ivMs);
    if (!covers && !e.exhaustedLeft) {
      await this._ensureWindow(symbol, ivId, (fromMs + toMs) / 2);
      e = this.entry(symbol, ivId);
    }

    const last = e.bars.length ? e.bars[e.bars.length - 1].t : null;
    if (last != null && last < toMs - ivMs) {
      const wanted = Math.max(countBack, Math.ceil((toMs - last) / ivMs) + 2);
      const more = await fetchPaged(symbol, ivId, last + ivMs, wanted);
      this._merge(e, more);
    }

    const bars = e.bars.filter((b) => b.t >= fromMs && b.t < toMs).map(toTV);
    const noData = bars.length === 0 && e.exhaustedLeft;
    return { bars, noData };
  }

  /* The bar immediately after `afterMs` — the replay engine's next step. */
  async nextBar(symbol, res, afterMs) {
    const ivId = TV_RES_TO_IV[res];
    if (!ivId) return null;
    const e = this.entry(symbol, ivId);
    let hit = e.bars.find((b) => b.t > afterMs);
    if (!hit) {
      const more = await fetchPaged(symbol, ivId, afterMs + 1, 300);
      this._merge(e, more);
      hit = e.bars.find((b) => b.t > afterMs);
    }
    return hit ? toTV(hit) : null;
  }

  /* Make sure the cache covers `ms`. Returns false when the feed genuinely
     has no data that far back at this granularity (1s from months ago,
     or a TwelveData symbol outside the window it happened to widen to). */
  async ensureAround(symbol, res, ms) {
    const ivId = TV_RES_TO_IV[res];
    if (!ivId) return false;
    let e = this.entry(symbol, ivId);
    const covered = e.bars.length && e.bars[0].t <= ms && e.bars[e.bars.length - 1].t >= ms;
    if (covered) return true;
    await this._ensureWindow(symbol, ivId, ms);
    e = this.entry(symbol, ivId);
    const ivMs = barMsOf(ivId);
    return !!(e.bars.length && e.bars[0].t <= ms + ivMs && e.bars[e.bars.length - 1].t >= ms - ivMs);
  }

  /* Bar containing a moment — used to align the cursor across resolutions. */
  barAt(symbol, res, ms) {
    const ivId = TV_RES_TO_IV[res];
    const e = this.entry(symbol, ivId);
    let lo = 0, hi = e.bars.length - 1, best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (e.bars[mid].t <= ms) { best = e.bars[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best ? toTV(best) : null;
  }
}

export const feed = new MarketFeed();
