/* ============================================================
   candles.js — picks a feed by symbol, same shape either way

   Simulator.jsx imports loadWindow/fetchPaged from here rather than
   straight from market.js (Binance only) because a second source
   exists: same function names and return shapes, routed to Binance
   (browser-side, market.js) or Dukascopy (through our own API — see
   server/dukascopy.js for why) based on each symbol's `source` in
   theme.js.

   The Dukascopy side is served from our own mirror of its archive,
   so a range someone has already charted comes back with no upstream
   request at all. A range nobody has touched yet may come back with
   less history than asked for while the rest fills in behind it —
   hence shortFrom below, which is the same honesty signal market.js
   already uses when an exchange simply has no data that far back.

   The one thing that does need handling here: these markets close.
   Forex is shut over the weekend and the index CFDs take a daily
   break, so a naive "N bars x interval" span of calendar time comes
   up short. fetchPaged therefore asks for a wider window than the
   bar count strictly implies. Modest multipliers on purpose — each
   extra day of span is another archive file the server may have to
   mirror, so overshooting by 10x (as an earlier Twelve Data version
   of this file did) costs real upstream requests for data nobody
   asked to see.
   ============================================================ */

import { SYMBOLS, barMsOf } from "../theme.js";
import { api, API_ENABLED } from "./api.js";
import * as binance from "./market.js";

const sourceOf = (symbol) => SYMBOLS.find((s) => s.id === symbol)?.source || "Binance";

const FORWARD = 1000; // matches market.js's own forward buffer
/* 1.6x covers a forex weekend (5 trading days per 7 calendar); the
   3x retry is for holiday runs and the index CFDs' shorter sessions. */
const WIDEN_MULT = [1.6, 3];

async function dukascopyRange(symbol, interval, fromMs, toMs) {
  if (!API_ENABLED) return null;
  try {
    const { candles } = await api.dukascopyCandles(symbol, interval, Math.floor(fromMs), Math.floor(toMs));
    return candles && candles.length ? candles : null;
  } catch (e) { return null; }
}

async function dukascopyLoadWindow(symbol, interval, targetMs) {
  const iv = barMsOf(interval);
  const lb = binance.lookbackBars(interval);
  const from = targetMs - lb * iv;
  const to = targetMs + FORWARD * iv;
  const bars = (await dukascopyRange(symbol, interval, from, to)) || [];
  return {
    bars,
    synthetic: !bars.length,
    /* earliest bar actually available, when later than requested */
    shortFrom: bars.length && bars[0].t > from + iv * 2 ? bars[0].t : null,
  };
}

async function dukascopyFetchPaged(symbol, interval, startTime, wanted) {
  const iv = barMsOf(interval);
  for (const mult of WIDEN_MULT) {
    const bars = await dukascopyRange(symbol, interval, startTime, startTime + wanted * iv * mult);
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

export const syntheticKlines = binance.syntheticKlines;
export const nearestIndex = binance.nearestIndex;
