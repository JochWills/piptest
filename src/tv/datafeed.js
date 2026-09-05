/* ============================================================
   datafeed.js — TradingView Datafeed API, replay-aware

   The library has no Bar Replay of its own, so replay is done
   here: the datafeed refuses to hand over any bar later than
   `cursorMs`, and the replay controller pushes each new bar
   through subscribeBars as time advances.

   The cursor is a TIMESTAMP, never a bar index. That is what
   makes switching timeframe free — the same instant resolves
   correctly on 1s and on 1D with no conversion.

   Every market Piptest offers (crypto via Binance, forex/index
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
    { value: "PIPTEST", name: "Piptest", desc: "Forex & index ETFs (Twelve Data)" },
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

/* Shared by control.step() (a bar just fetched locally) and
   control.pushRemoteBar() (a bar delivered over the room WebSocket
   by whoever's actually driving the replay — see roomSocket.js /
   Simulator.jsx) — both need to fold a sub-bar into the growing
   chart-resolution candle the exact same way, or a room viewer's
   chart would build visibly different candles than the host's own.
   Returns the bar to hand to onTick and updates state.agg in place. */
function aggregateDisplay(state, bar, symbol, resolution, chartMs, stepRes) {
  if (stepRes === resolution) { state.agg = null; return bar; }
  const bucketStart = Math.floor(bar.time / chartMs) * chartMs;
  const agg = state.agg;
  const display = (agg && agg.symbol === symbol && agg.resolution === resolution && agg.time === bucketStart)
    ? { ...agg, high: Math.max(agg.high, bar.high), low: Math.min(agg.low, bar.low),
        close: bar.close, volume: (agg.volume || 0) + (bar.volume || 0) }
    : { symbol, resolution, time: bucketStart, open: bar.open, high: bar.high, low: bar.low,
        close: bar.close, volume: bar.volume || 0 };
  state.agg = display;
  return display;
}

export function createDatafeed(opts = {}) {
  const state = {
    cursorMs: opts.cursorMs ?? Date.now(),
    live: false,                 // true = follow real time instead of replay
    subs: new Map(),             // listenerGuid -> subscription
    onCursor: opts.onCursor || (() => {}),
    stepMs: 60000,                // calendar time one control.step() call should aim to cover
    agg: null,                    // the chart-resolution candle currently being built from sub-bars, if any — see control.step
    jumpGen: 0,                    // bumped on every jumpTo — lets its own retried viewport-restores (below) tell a stale attempt from the current one
    afterBarsSettled: null,        // one-shot callback — see notifyBarsSettled and jumpTo's own comment on why this exists
  };

  /* Called at the end of every getBars completion path (a real result,
     an empty one, or an error) — this is our own datafeed method, so
     it's the one place that actually knows when the library's post-
     resetData() re-fetch has come back and it's about to redraw with
     real data, rather than guessing at a delay from the outside. See
     jumpTo's own comment for why that distinction matters over a real
     network. */
  function notifyBarsSettled() {
    if (!state.afterBarsSettled) return;
    const cb = state.afterBarsSettled;
    state.afterBarsSettled = null;
    cb();
  }

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

      if (toMs <= fromMs) { async_(() => { onResult([], { noData: true }); notifyBarsSettled(); }); return; }

      try {
        const { bars, noData } = await feed.getRange(symbolInfo.name, resolution, fromMs, toMs, countBack);
        /* Do not include a bar stamped exactly `to` — the library already
           holds that one from the previous response. */
        const clean = bars.filter((b) => b.time < toMs);
        async_(() => { onResult(clean, { noData: noData && !clean.length }); notifyBarsSettled(); });
      } catch (e) {
        async_(() => { onError(String(e && e.message ? e.message : e)); notifyBarsSettled(); });
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
       chart. Returns { bar, stepRes } — bar is the raw bar (always at
       whatever resolution was actually stepped — see below), stepRes
       is that resolution itself, which the host's room-sync
       broadcast (see Simulator.jsx) needs to hand a viewer's
       pushRemoteBar (below) so it aggregates the exact same way — or
       null at the end of data.

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

      const display = aggregateDisplay(state, bar, symbol, resolution, chartMs, stepRes);
      for (const s of state.subs.values()) {
        if (s.symbol === symbol && s.resolution === resolution) s.onTick({ ...display });
      }
      return { bar, stepRes };
    },

    /* Room viewer path: the host's step() (above) already ran
       this exact bar through the same aggregation and broadcast it
       over the room WebSocket. Feeding it in here — via the same
       onTick a live tick would use — is what lets a viewer's chart
       extend forward exactly like one, with no resetData()/re-fetch
       at all for the ordinary case of just watching someone else
       play; jumpTo (below) is still what handles a symbol/interval
       change or an actual rewind, both of which need a real reset
       regardless of how the moment was reached. `subRes` is the
       resolution the sender actually stepped at (its own `stepRes`)
       — passed explicitly rather than re-derived from this side's
       own stepMs, so a viewer's chart can't build a differently-
       bucketed candle just because its local step-size sync happens
       to be a beat behind the sender's. */
    pushRemoteBar(bar, symbol, resolution, subRes) {
      if (bar.time < state.cursorMs) return; // stale/out-of-order delivery — never move the cursor backwards
      state.cursorMs = bar.time;
      state.onCursor(bar.time, bar);
      const chartMs = barMsOf(TV_RES_TO_IV[resolution]);
      const display = aggregateDisplay(state, bar, symbol, resolution, chartMs, subRes || resolution);
      for (const s of state.subs.values()) {
        if (s.symbol === symbol && s.resolution === resolution) s.onTick({ ...display });
      }
    },

    /* Jump anywhere, including backwards. The library caches bars and
       refuses rewrites of history, so a jump has to invalidate the cache
       and let the chart re-request everything — which also means any
       still-forming candle being built up by step() above is gone; the
       chart will show the last *complete* bar at or before the target
       instead until stepping forward rebuilds one from there again.

       `skipBarLookup` is for a caller that's about to hand Simulator an
       exact bar of its own right after this returns (stepBack/stepping
       back within the seen-bar buffer, see Simulator.jsx) — the async
       best-effort lookup below fetches at the CHART's resolution, so
       jumping to a moment that isn't itself a bar boundary at that
       resolution (stepping back a sub-bar within a coarser chart, say)
       resolves to the coarser bar *containing* it, arriving after and
       silently overwriting the precise one the caller already set. */
    jumpTo(ms, widget, symbol, resolution, skipBarLookup) {
      state.cursorMs = ms;
      state.agg = null;
      state.onCursor(ms, null);
      for (const s of state.subs.values()) s.reset && s.reset();
      /* resetData() forces the chart to drop its cached bars and
         re-request them — necessary, since the library refuses to
         rewrite history — but left alone it also resets the chart's own
         idea of what range to frame, snapping the visible viewport back
         to a default view around the new cursor. That's exactly what a
         room viewer sees as "the chart keeps refreshing and jumping
         back to the same point": a viewer never plays its own replay
         locally (see the play/pause effect in Simulator.jsx — only the
         host does), so every room-sync poll finds its cursor
         behind the host's and corrects via this same jumpTo, on a
         ~1.5s cadence, for as long as the host keeps playing.

         Capturing the range and restoring it after a fixed guessed
         delay visibly flashed the default view first and only then
         snapped back — worse, over a real (not localhost) network,
         resetData's own re-fetch (getBars below, a real round trip to
         our API/Binance/Twelve Data) can easily take longer than any
         short guessed delay, so the restore landed too early, got
         overwritten right back by the library's own reset once data
         actually arrived, and the view sat wrong until whatever NEXT
         correction happened to come along — which is what showed up as
         "sometimes it takes a few attempts, snapping back and forth
         a few times before it settles". notifyBarsSettled (above) is
         the real fix: getBars is OUR OWN method, so it's the one place
         that actually knows the moment the library's post-reset
         re-fetch has come back, rather than guessing at its timing
         from the outside — afterBarsSettled fires the restore exactly
         then, deterministically. The short timed retries stay too, as
         a safety net for the one case that callback can't cover: the
         library already had this range cached and never calls getBars
         again at all, so nothing would otherwise fire the restore.
         `gen` guards against a second jumpTo landing before this one's
         restore fires and fighting over which range wins. */
      const gen = ++state.jumpGen;
      let chart = null, range = null;
      try { chart = widget && widget.activeChart(); range = chart && chart.getVisibleRange(); } catch (e) {}
      if (chart && range && Number.isFinite(range.from) && Number.isFinite(range.to)
          && range.from > 0 && range.to > range.from) {
        const restore = () => {
          if (state.jumpGen !== gen) return;
          /* setVisibleRange can reject asynchronously — a synchronous
             try/catch alone doesn't catch that (see the matching note
             on TVAdvancedChart.jsx's own restore). */
          try { Promise.resolve(chart.setVisibleRange(range)).catch(() => {}); } catch (e) {}
        };
        state.afterBarsSettled = restore;
        restore();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
        [100, 300, 800, 1500, 3000].forEach((t) => setTimeout(restore, t));
      }
      try { chart && chart.resetData(); } catch (e) {}
      /* best-effort: once the feed actually has data at this position,
         hand Simulator a real bar so its own price/clock/OHLC display
         doesn't sit stale until the next explicit step reveals one —
         realign() (below, resolution switches) already does exactly
         this; a plain jump never did. That gap used to go unnoticed
         because Simulator's room-sync jump was always followed by a
         full widget remount anyway (which gets a real bar for free on
         mount), but a remount on every poll tick is its own, much worse
         bug (constant reloading, drawings wiped) — see the room poll
         effect in Simulator.jsx. Guarded on cursorMs still matching:
         a newer jump/step landing before this resolves should win, not
         get clobbered by a stale lookup. */
      if (symbol && resolution && !skipBarLookup) {
        (async () => {
          const covered = await feed.ensureAround(symbol, resolution, ms);
          if (!covered || state.cursorMs !== ms) return;
          const bar = feed.barAt(symbol, resolution, ms);
          if (bar) state.onCursor(ms, bar);
        })();
      }
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
