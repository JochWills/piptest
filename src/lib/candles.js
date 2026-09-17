/* ============================================================
   candles.js — the app's single entry point for candle data

   Simulator.jsx and src/tv/marketFeed.js import loadWindow/fetchPaged
   from here rather than straight from market.js. Right now every
   market Piptest offers is crypto from Binance, so this is a
   pass-through and nothing else.

   It stays as its own module deliberately. This is the seam where a
   second data source gets routed by symbol — it has held exactly that
   twice now (Twelve Data, then Dukascopy), and both times every
   caller was able to stay unchanged because the seam was already
   here. Whenever forex/gold/indices come back, this is the only file
   that decides which feed a symbol belongs to.

   Before adding that second source, read the note above SYMBOLS in
   src/theme.js: the blocker is licensing, not code.
   ============================================================ */

export {
  loadWindow,
  fetchPaged,
  syntheticKlines,
  nearestIndex,
} from "./market.js";
