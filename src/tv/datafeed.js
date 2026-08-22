/* ============================================================
   datafeed.js — TradingView Datafeed API, replay-aware

   The library has no Bar Replay of its own, so replay is done
   here: the datafeed refuses to hand over any bar later than
   `cursorMs`, and the replay controller pushes each new bar
   through subscribeBars as time advances.

   The cursor is a TIMESTAMP, never a bar index. That is what
   makes switching timeframe free — the same instant resolves
   correctly on 1s and on 1D with no conversion.
   ============================================================ */

import { feed, RES_MS, SUPPORTED_RESOLUTIONS } from "./binanceFeed.js";

/* The library requires every callback to be invoked asynchronously.
   Calling one synchronously can blow the stack inside the library. */
const async_ = (fn) => setTimeout(fn, 0);

const CONFIG = {
  supported_resolutions: SUPPORTED_RESOLUTIONS,
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: true,
  exchanges: [{ value: "BINANCE", name: "Binance", desc: "Binance Spot" }],
  symbols_types: [{ name: "crypto", value: "crypto" }],
};

const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "LTCUSDT",
];

/* price precision per instrument — pricescale is 10^decimals */
function priceScaleFor(symbol) {
  if (/^(BTC|ETH|BNB|SOL|LTC|AVAX)/.test(symbol)) return 100;
  if (/^(LINK|ADA)/.test(symbol)) return 10000;
  return 100000;
}

export function createDatafeed(opts = {}) {
  const state = {
    cursorMs: opts.cursorMs ?? Date.now(),
    live: false,                 // true = follow real time instead of replay
    subs: new Map(),             // listenerGuid -> subscription
    onCursor: opts.onCursor || (() => {}),
  };

  const datafeed = {
    onReady(cb) {
      async_(() => cb(CONFIG));
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
      const q = (userInput || "").toUpperCase();
      const out = SYMBOLS.filter((s) => s.includes(q)).map((s) => ({
        symbol: s, full_name: `BINANCE:${s}`, description: s,
        exchange: "BINANCE", ticker: s, type: "crypto",
      }));
      async_(() => onResult(out));
    },

    resolveSymbol(symbolName, onResolve, onError) {
      const name = String(symbolName).replace("BINANCE:", "").toUpperCase();
      if (!SYMBOLS.includes(name)) { async_(() => onError("unknown symbol")); return; }
      const info = {
        name, ticker: name, description: name,
        type: "crypto",
        session: "24x7",
        timezone: "Etc/UTC",
        exchange: "BINANCE", listed_exchange: "BINANCE",
        format: "price",
        minmov: 1,
        pricescale: priceScaleFor(name),
        has_intraday: true,
        has_seconds: true,
        seconds_multipliers: ["1", "5", "15", "30"],
        has_daily: true,
        has_weekly_and_monthly: false,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        volume_precision: 4,
        data_status: "streaming",
      };
      async_(() => onResolve(info));
    },

    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const { from, to, countBack, firstDataRequest } = periodParams;
      const fromMs = from * 1000;
      /* Never reveal the future. This single clamp is the whole replay. */
      const toMs = state.live ? to * 1000 : Math.min(to * 1000, state.cursorMs + 1);

      if (toMs <= fromMs) { async_(() => onResult([], { noData: true })); return; }

      try {
        const { bars, noData } = await feed.getRange(symbolInfo.name, resolution, fromMs, toMs, countBack);
        /* Do not include a bar stamped exactly `to` — the library already
           holds that one from the previous response. */
        const clean = bars.filter((b) => b.time < toMs);
        async_(() => onResult(clean, { noData: noData && !clean.length }));
      } catch (e) {
        async_(() => onError(String(e && e.message ? e.message : e)));
      }
    },

    subscribeBars(symbolInfo, resolution, onTick, listenerGuid, onResetCacheNeededCallback) {
      state.subs.set(listenerGuid, {
        symbol: symbolInfo.name, resolution, onTick,
        reset: onResetCacheNeededCallback,
      });
    },

    unsubscribeBars(listenerGuid) {
      state.subs.delete(listenerGuid);
    },
  };

  /* ---------- replay control surface ---------- */
  const control = {
    get cursorMs() { return state.cursorMs; },

    setLive(v) { state.live = !!v; },

    /* Move the cursor forward and push the revealed bar to the chart.
       Returns the bar, or null at the end of available data. */
    async step(symbol, resolution) {
      const bar = await feed.nextBar(symbol, resolution, state.cursorMs);
      if (!bar) return null;
      state.cursorMs = bar.time;
      state.onCursor(bar.time, bar);
      for (const s of state.subs.values()) {
        if (s.symbol === symbol && s.resolution === resolution) s.onTick({ ...bar });
      }
      return bar;
    },

    /* Jump anywhere, including backwards. The library caches bars and
       refuses rewrites of history, so a jump has to invalidate the cache
       and let the chart re-request everything. */
    jumpTo(ms, widget) {
      state.cursorMs = ms;
      state.onCursor(ms, null);
      for (const s of state.subs.values()) s.reset && s.reset();
      try { widget && widget.activeChart().resetData(); } catch (e) {}
    },

    /* Resolution changed: keep the same moment and snap to the open of the
       bar containing it. If the exchange has no data that far back at this
       granularity, say so instead of silently dragging the cursor to the
       oldest bar that happens to exist — that is how you end up looking at
       09:47 when every other timeframe says 00:00. */
    async realign(symbol, resolution) {
      const covered = await feed.ensureAround(symbol, resolution, state.cursorMs);
      if (!covered) {
        const e = feed.entry(symbol, resolution);
        return { cursorMs: state.cursorMs, covered: false,
                 earliest: e.bars.length ? e.bars[0].time : null };
      }
      const bar = feed.barAt(symbol, resolution, state.cursorMs);
      if (bar) { state.cursorMs = bar.time; state.onCursor(bar.time, bar); }
      return { cursorMs: state.cursorMs, covered: true };
    },

    subs: state.subs,
  };

  return { datafeed, control };
}
