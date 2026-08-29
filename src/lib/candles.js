/* ============================================================
   candles.js — picks a feed by symbol, same shape either way

   Simulator.jsx used to import loadWindow/fetchPaged/fetchTickers
   straight from market.js (Binance only). Now that a second source
   exists, it imports them from here instead: same function names and
   return shapes, routed to Binance (browser-side, market.js) or
   Dukascopy (through our own API, since Dukascopy can't be called
   from the browser — see server/dukascopy.js) based on each symbol's
   `source` in theme.js.

   Dukascopy's numbers are different in a way worth knowing before
   touching this file:
   · no live ticker — it's a historical archive, not a quote stream,
     so fetchTickers simply never returns a Dukascopy row. Market
     Watch already renders that as "—", the same as when Binance
     itself is unreachable — nothing extra needed for that.
   · a "page" of history costs real, rate-limited server time (each
     hour of ticks is its own throttled fetch — see dukascopy.js), so
     initial loads stay deliberately small and pages stay modest;
     Simulator's existing loadOlder/forward-extend calls just take
     longer to fill in on a cold range, not on a cached one.
   · a weekend or holiday is a real gap, not a failure — fetchPaged
     below widens its own search window a couple of times before
     giving up, so scrolling back into Friday's close doesn't look
     like "no more history" one gap short of Thursday's candles.
   ============================================================ */

import { SYMBOLS, barMsOf } from "../theme.js";
import { api, API_ENABLED } from "./api.js";
import * as binance from "./market.js";

const sourceOf = (symbol) => SYMBOLS.find((s) => s.id === symbol)?.source || "Binance";

const HOUR = 3600000;
const INITIAL_HOURS = 12;   // first paint: fast, not "45 days of comparable history"
const MIN_PAGE_HOURS = 24;  // floor for any one fetchPaged call
const WIDEN_HOURS = [0, 72, 240]; // retry budget so a weekend gap isn't mistaken for "no more data"

async function dukascopyRange(symbol, interval, fromMs, toMs) {
  if (!API_ENABLED) return null;
  try {
    const { candles } = await api.dukascopyCandles(symbol, interval, Math.floor(fromMs), Math.floor(toMs));
    return candles && candles.length ? candles : null;
  } catch (e) { return null; }
}

async function dukascopyLoadWindow(symbol, interval, targetMs) {
  const from = targetMs - INITIAL_HOURS * HOUR;
  const to = targetMs + 2 * HOUR;
  const bars = (await dukascopyRange(symbol, interval, from, to)) || [];
  return { bars, synthetic: !bars.length, shortFrom: null };
}

async function dukascopyFetchPaged(symbol, interval, startTime, wanted) {
  const iv = barMsOf(interval);
  const baseHours = Math.max(MIN_PAGE_HOURS, Math.ceil((wanted * iv) / HOUR));
  for (const extra of WIDEN_HOURS) {
    const bars = await dukascopyRange(symbol, interval, startTime, startTime + (baseHours + extra) * HOUR);
    if (bars) return bars;
  }
  return null;
}

export async function loadWindow(symbol, interval, targetMs) {
  return sourceOf(symbol) === "Dukascopy"
    ? dukascopyLoadWindow(symbol, interval, targetMs)
    : binance.loadWindow(symbol, interval, targetMs);
}

export async function fetchPaged(symbol, interval, startTime, wanted, maxPages) {
  return sourceOf(symbol) === "Dukascopy"
    ? dukascopyFetchPaged(symbol, interval, startTime, wanted)
    : binance.fetchPaged(symbol, interval, startTime, wanted, maxPages);
}

/* Binance-only for now — Dukascopy rows just come back missing,
   which the caller already renders as "—". */
export function fetchTickers(symbolIds) {
  const binanceIds = symbolIds.filter((id) => sourceOf(id) !== "Dukascopy");
  return binanceIds.length ? binance.fetchTickers(binanceIds) : Promise.resolve([]);
}

export const syntheticKlines = binance.syntheticKlines;
export const nearestIndex = binance.nearestIndex;
