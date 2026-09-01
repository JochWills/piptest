/* ============================================================
   datafeed.js — TradingView Datafeed API, replay-aware

   The library has no Bar Replay of its own, so replay is done
   here: the datafeed refuses to hand over any bar later than
   `cursorMs`, and the replay controller pushes each new bar
   through subscribeBars as time advances.

   The cursor is a TIMESTAMP, never a bar index. That is what
   makes switching timeframe free — the same instant resolves
   correctly on 1s and on 1D with no conversion.

   Every market PipTest offers (crypto via Binance, forex/index
   ETFs via Twelve Data — see theme.js's SYMBOLS) is resolvable
   here, not just the original crypto set. Twelve Data has no
   sub-minute candles, so those symbols simply don't advertise
   the 1s resolution — see SYMBOLS in theme.js for the source of
   truth on which markets exist and where each one's data comes
   from.
   ============================================================ */

import { feed, SUPPORTED_RESOLUTIONS, TV_RES_TO_IV, IV_TO_TV_RES } from "./marketFeed.js";
import { SYMBOLS as MARKETS, INTERVALS, barMsOf } from "../theme.js";

/* The library requires every callback to be invoked asynchronously.
   Calling one synchronously can blow the stack inside the library. */
const async_ = (fn) => setTimeout(fn, 0);

const EXCHANGE_LABEL = { Binance: "BINANCE", TwelveData: "PIPTEST" };

/* The finest resolution actually available for a symbol — Binance goes
   down to 1 second, Twelve Data (forex/index ETFs) only down to 1
   minute. Used below as the fallback when the chosen step size itself
   isn't offered for this symbol (picking "1s" steps on a Twelve Data
   market, which has no seconds data at all). */
function baseResFor(symbolName) {
  const m = MARKETS.find((x) => x.id === symbolName);
  return m?.source === "Binance" ? "1S" : "1";
}

/* Which resolution control.step (below) should actually fetch at, to
   cover a chosen step size finer than the chart's own bar width — its
   OWN resolution if one exists and this symbol actually has it (so
   choosing a "1m" step really does step minute by minute, not drop all
   the way to 1-second data just because that happens to be Binance's
   finest), falling back to the symbol's base resolution otherwise. */
function stepResFor(stepMs, symbolName) {
  const iv = INTERVALS.find((i) => i.ms === stepMs);
  const res = iv && IV_TO_TV_RES[iv.id];
  if (res && (res !== "1S" || baseResFor(symbolName) === "1S")) return res;
  return baseResFor(symbolName);
}

const CONFIG = {
  supported_resolutions: SUPPORTED_RESOLUTIONS,
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: true,
  exchanges: [
    { value: "BINANCE", name: "Binance", desc: "Binance Spot" },
    { value: "PIPTEST", name: "PipTest", desc: "Forex & index ETFs (Twelve Data)" },
  ],
  symbols_types: [{ name: "crypto", value: "crypto" }, { name: "forex", value: "forex" }, { name: "index", value: "index" }],
};

/* price precision per instrument — pricescale is 10^decimals.
   Picked per how the instrument actually quotes, not guessed from a
   regex: crypto majors to 2dp, low-price crypto to 4dp, JPY forex
   pairs to 3dp (their convention), other forex pairs to 5dp, index
   ETFs to 2dp like any other equity-priced instrument. */
const PRICESCALE = {
  BTCUSDT: 100, ETHUSDT: 100, SOLUSDT: 100, BNBUSDT: 100, LTCUSDT: 100, AVAXUSDT: 100,
  XRPUSDT: 10000, DOGEUSDT: 10000, ADAUSDT: 10000, LINKUSDT: 1000,
  USDJPY: 1000,
  EURUSD: 100000, GBPUSD: 100000, USDCHF: 100000, USDCAD: 100000, AUDUSD: 100000, NZDUSD: 100000,
  SPY: 100, DIA: 100, QQQ: 100,
};

function typeOf(cls) {
  if (cls === "Crypto") return "crypto";
  if (cls === "Forex") return "forex";
  return "index";
}

export function createDatafeed(opts = {}) {
  const state = {
    cursorMs: opts.cursorMs ?? Date.now(),
    live: false,                 // true = follow real time instead of replay
    subs: new Map(),             // listenerGuid -> subscription
    onCursor: opts.onCursor || (() => {}),
    stepMs: 60000,                // calendar time one control.step() call should aim to cover
    agg: null,                    // the chart-resolution candle currently being built from sub-bars, if any — see control.step
  };

  const datafeed = {
    onReady(cb) {
      async_(() => cb(CONFIG));
    },

    searchSymbols(userInput, exchange, symbolType, onResult) {
      const q = (userInput || "").toUpperCase();
      const out = MARKETS
        .filter((m) => m.id.includes(q) || m.label.toUpperCase().includes(q))
        .map((m) => ({
          symbol: m.id, full_name: `${EXCHANGE_LABEL[m.source]}:${m.id}`, description: m.label,
          exchange: EXCHANGE_LABEL[m.source], ticker: m.id, type: typeOf(m.cls),
        }));
      async_(() => onResult(out));
    },

    resolveSymbol(symbolName, onResolve, onError) {
      const name = String(symbolName).split(":").pop().toUpperCase();
      const m = MARKETS.find((x) => x.id === name);
      if (!m) { async_(() => onError("unknown symbol")); return; }
      const isCrypto = m.source === "Binance";
      const resolutions = isCrypto ? SUPPORTED_RESOLUTIONS : SUPPORTED_RESOLUTIONS.filter((r) => TV_RES_TO_IV[r] !== "1s");
      const info = {
        name: m.id, ticker: m.id, description: m.label,
        type: typeOf(m.cls),
        session: isCrypto ? "24x7" : "24x7", // replay serves whatever history exists; the library doesn't need real session hours to page through it
        timezone: "Etc/UTC",
        exchange: EXCHANGE_LABEL[m.source], listed_exchange: EXCHANGE_LABEL[m.source],
        format: "price",
        minmov: 1,
        pricescale: PRICESCALE[m.id] || 100,
        has_intraday: true,
        has_seconds: isCrypto,
        seconds_multipliers: isCrypto ? ["1"] : [],
        has_daily: true,
        has_weekly_and_monthly: false,
        supported_resolutions: resolutions,
        volume_precision: isCrypto ? 4 : 0,
        data_status: "streaming",
      };
      async_(() => onResolve(info));
    },

    async getBars(symbolInfo, resolution, periodParams, onResult, onError) {
      const { from, to, countBack } = periodParams;
      const rawFromMs = from * 1000, rawToMs = to * 1000;
      /* Never reveal the future. This clamp is the whole replay — but with
         no saved layout to tell it otherwise, the library's very first
         request for a symbol defaults its viewport to wall-clock "now",
         which can be nowhere near a replay session's start date (this one
         defaults to whatever `startMs`/`meta.startMs` is, often months or
         years in the past). Clamping `to` alone and leaving `from` at its
         original, now-irrelevant value produces a `from` sitting *after*
         the clamped `to` — an inverted, permanently empty range. Re-anchor
         the whole requested span onto the cursor instead of just capping
         one end of it, so a first request for "500 bars ending now" becomes
         "500 bars ending at the cursor" rather than nothing at all. */
      let toMs = rawToMs, fromMs = rawFromMs;
      if (!state.live && rawToMs > state.cursorMs + 1) {
        toMs = state.cursorMs + 1;
        fromMs = toMs - (rawToMs - rawFromMs);
      }

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

    /* How much calendar time one step() call should aim to advance by —
       set from the chosen step size (Simulator's stepId). Only actually
       changes what step() does once it's smaller than the chart's own
       bar duration; see step() below. */
    setStepMs(ms) { state.stepMs = ms; },

    /* Move the cursor forward one bar and push the revealed bar to the
       chart. Returns the raw bar (always at whatever resolution was
       actually stepped — see below), or null at the end of data.

       Normally that's just the chart's own displayed resolution, same
       as ever. But when the chosen step size is *finer* than the
       chart's bar width (e.g. a 1m step on a 5m chart), stepping a
       whole 5m bar at a time would skip right past it — so this steps
       through real sub-bar data instead (stepResFor: the step size's
       own resolution if this symbol actually has it, its base
       resolution otherwise) and aggregates each sub-bar into the
       chart-resolution candle it falls in, pushing the growing candle
       to the chart via onTick exactly like a live tick would
       (TradingView already updates the same bar in place when onTick
       repeats its `time`, rather than appending a new one — no special
       handling needed on the library's side, just feeding it the right
       value).

       The raw sub-bar is what's returned (and so what the trade engine
       sees) either way — real intrabar stop/target checks care about
       the finest data actually available, not the coarser candle a
       chart happens to be displaying it as. */
    async step(symbol, resolution) {
      const chartMs = barMsOf(TV_RES_TO_IV[resolution]);
      const stepRes = state.stepMs >= chartMs ? resolution : stepResFor(state.stepMs, symbol);
      const bar = await feed.nextBar(symbol, stepRes, state.cursorMs);
      if (!bar) return null;
      state.cursorMs = bar.time;
      state.onCursor(bar.time, bar);

      let display = bar;
      if (stepRes !== resolution) {
        const bucketStart = Math.floor(bar.time / chartMs) * chartMs;
        const agg = state.agg;
        display = (agg && agg.symbol === symbol && agg.resolution === resolution && agg.time === bucketStart)
          ? { ...agg, high: Math.max(agg.high, bar.high), low: Math.min(agg.low, bar.low),
              close: bar.close, volume: (agg.volume || 0) + (bar.volume || 0) }
          : { symbol, resolution, time: bucketStart, open: bar.open, high: bar.high, low: bar.low,
              close: bar.close, volume: bar.volume || 0 };
        state.agg = display;
      } else {
        state.agg = null; // stepping at the chart's own resolution — each bar is already complete, nothing to build up
      }

      for (const s of state.subs.values()) {
        if (s.symbol === symbol && s.resolution === resolution) s.onTick({ ...display });
      }
      return bar;
    },

    /* Jump anywhere, including backwards. The library caches bars and
       refuses rewrites of history, so a jump has to invalidate the cache
       and let the chart re-request everything — which also means any
       still-forming candle being built up by step() above is gone; the
       chart will show the last *complete* bar at or before the target
       instead until stepping forward rebuilds one from there again. */
    jumpTo(ms, widget) {
      state.cursorMs = ms;
      state.agg = null;
      state.onCursor(ms, null);
      for (const s of state.subs.values()) s.reset && s.reset();
      try { widget && widget.activeChart().resetData(); } catch (e) {}
    },

    /* Resolution changed: keep the same moment and snap to the open of the
       bar containing it. If the feed has no data that far back at this
       granularity, say so instead of silently dragging the cursor to the
       oldest bar that happens to exist — that is how you end up looking at
       09:47 when every other timeframe says 00:00. */
    async realign(symbol, resolution) {
      state.agg = null;
      const covered = await feed.ensureAround(symbol, resolution, state.cursorMs);
      if (!covered) {
        const e = feed.entry(symbol, resolution);
        return { cursorMs: state.cursorMs, covered: false,
                 earliest: e.bars.length ? e.bars[0].t : null };
      }
      const bar = feed.barAt(symbol, resolution, state.cursorMs);
      if (bar) { state.cursorMs = bar.time; state.onCursor(bar.time, bar); }
      return { cursorMs: state.cursorMs, covered: true };
    },

    subs: state.subs,
  };

  return { datafeed, control };
}
