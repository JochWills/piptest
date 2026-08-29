/* ============================================================
   candles.js — picks a feed by symbol, same shape either way

   Simulator.jsx imports loadWindow/fetchPaged from here rather than
   straight from market.js (Binance only) now that a second source
   exists: same function names and return shapes, routed to Binance
   (browser-side, market.js) or Twelve Data (through our own API —
   see server/twelvedata.js for why) based on each symbol's `source`
   in theme.js.

   Twelve Data's free tier is generous enough per call (up to 5,000
   candles) that this doesn't need the elaborate small-window/widen-
   on-scroll dance the earlier Dukascopy attempt did — a normal
   lookback fits in one request. The one thing that does need
   handling here: these markets close. Forex is closed weekends;
   the index ETFs (SPY/DIA/QQQ) are open barely six and a half hours
   a day, US market hours only. So fetchPaged asks for a generously
   wide calendar window relative to how many bars it actually wants,
   widening further if the first attempt comes back empty — otherwise
   landing a scroll-back request right on a Friday close could look
   like "no more history" when Thursday's candles are right there.

   No live tickers here — Market Watch (the only thing that ever
   showed them) was retired, and a live quote costs one Twelve Data
   credit PER SYMBOL, so nothing should be polling that on its own
   account. If a ticker feature comes back, resist wiring it back in
   here without deciding fresh how often it's allowed to poll.
   ============================================================ */

import { SYMBOLS, barMsOf } from "../theme.js";
import { api, API_ENABLED } from "./api.js";
import * as binance from "./market.js";

const sourceOf = (symbol) => SYMBOLS.find((s) => s.id === symbol)?.source || "Binance";

const FORWARD = 1000; // matches market.js's own forward buffer
const WIDEN_MULT = [3, 10, 30]; // multiples of the naive span — cheap, each attempt is one call

async function twelveDataRange(symbol, interval, fromMs, toMs) {
  if (!API_ENABLED) return null;
  try {
    const { candles } = await api.twelveDataCandles(symbol, interval, Math.floor(fromMs), Math.floor(toMs));
    return candles && candles.length ? candles : null;
  } catch (e) { return null; }
}

async function twelveDataLoadWindow(symbol, interval, targetMs) {
  const iv = barMsOf(interval);
  const lb = binance.lookbackBars(interval);
  const from = targetMs - lb * iv;
  const to = targetMs + FORWARD * iv;
  const bars = (await twelveDataRange(symbol, interval, from, to)) || [];
  return { bars, synthetic: !bars.length, shortFrom: null };
}

async function twelveDataFetchPaged(symbol, interval, startTime, wanted) {
  const iv = barMsOf(interval);
  for (const mult of WIDEN_MULT) {
    const bars = await twelveDataRange(symbol, interval, startTime, startTime + wanted * iv * mult);
    if (bars) return bars;
  }
  return null;
}

export async function loadWindow(symbol, interval, targetMs) {
  return sourceOf(symbol) === "TwelveData"
    ? twelveDataLoadWindow(symbol, interval, targetMs)
    : binance.loadWindow(symbol, interval, targetMs);
}

export async function fetchPaged(symbol, interval, startTime, wanted, maxPages) {
  return sourceOf(symbol) === "TwelveData"
    ? twelveDataFetchPaged(symbol, interval, startTime, wanted)
    : binance.fetchPaged(symbol, interval, startTime, wanted, maxPages);
}

export const syntheticKlines = binance.syntheticKlines;
export const nearestIndex = binance.nearestIndex;
