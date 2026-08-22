/* ============================================================
   market.js — historical candles

   Binance public endpoints, no key required. Pages through the
   1000-kline request cap, and reports honestly when the exchange
   cannot reach as far back as asked (common on 1s).
   ============================================================ */

import { barMsOf } from "../theme.js";

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const PAGE = 1000;

export async function fetchKlines(symbol, interval, startTime, limit = PAGE) {
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}`
        + `&startTime=${Math.floor(startTime)}&limit=${limit}`);
      if (!r.ok) continue;
      const raw = await r.json();
      if (Array.isArray(raw) && raw.length) {
        return raw.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
      }
    } catch (e) { /* next host */ }
  }
  return null;
}

export async function fetchPaged(symbol, interval, startTime, wanted, maxPages = 6) {
  const iv = barMsOf(interval);
  let out = [], cursor = startTime, pages = 0;
  while (out.length < wanted && pages++ < maxPages) {
    const chunk = await fetchKlines(symbol, interval, cursor);
    if (!chunk || !chunk.length) break;
    const last = out.length ? out[out.length - 1].t : -Infinity;
    const fresh = chunk.filter((b) => b.t > last);
    if (!fresh.length) break;
    out = out.concat(fresh);
    if (chunk.length < PAGE) break;
    cursor = chunk[chunk.length - 1].t + iv;
  }
  return out.length ? out : null;
}

export async function fetchTickers(symbols) {
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
      if (!r.ok) continue;
      const raw = await r.json();
      if (Array.isArray(raw)) {
        return raw.map((x) => ({ symbol: x.symbol, price: +x.lastPrice, chg: +x.priceChangePercent }));
      }
    } catch (e) { /* next */ }
  }
  return null;
}

/* ---------- deterministic fallback ----------
   Used only when the feed is unreachable. Seeded from the
   session parameters so every participant in a shared room
   sees byte-identical candles. */
const hashSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const BASE = { BTCUSDT: 62000, ETHUSDT: 3100, SOLUSDT: 145, BNBUSDT: 580, XRPUSDT: 0.52,
  DOGEUSDT: 0.15, ADAUSDT: 0.45, LINKUSDT: 14, AVAXUSDT: 27, LTCUSDT: 85 };

export function syntheticKlines(symbol, interval, startTime, count = 1200) {
  const rand = mulberry32(hashSeed(symbol + interval + startTime));
  const iv = barMsOf(interval);
  const vol = 0.0006 * Math.sqrt(iv / 60000);
  let price = BASE[symbol] || 100;
  const out = [];
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * vol * price * 2;
    const o = price, c = Math.max(price * 0.5, o + drift);
    const wick = Math.abs(drift) * (0.6 + rand() * 1.8) + price * vol * 0.4;
    out.push({ t: startTime + i * iv, o, c,
      h: Math.max(o, c) + wick * rand(), l: Math.min(o, c) - wick * rand(), v: 10 + rand() * 100 });
    price = c;
  }
  return out;
}

/* ---------- window sizing ----------
   Lead-in expressed as a target time span so every timeframe
   reaches over comparable dates where the bar budget allows. */
const LOOKBACK_MS = 45 * 86400000;
const LOOKBACK_MAX = 2000, LOOKBACK_MIN = 200, FORWARD = 1000;
export const lookbackBars = (id) =>
  Math.max(LOOKBACK_MIN, Math.min(LOOKBACK_MAX, Math.ceil(LOOKBACK_MS / barMsOf(id))));

export async function loadWindow(symbol, interval, targetMs) {
  const iv = barMsOf(interval);
  const lb = lookbackBars(interval);
  const from = targetMs - lb * iv;
  const real = await fetchPaged(symbol, interval, from, lb + FORWARD);
  const isReal = !!(real && real.length > 20);
  const bars = isReal ? real : syntheticKlines(symbol, interval, from, lb + FORWARD);
  return {
    bars, synthetic: !isReal,
    /* the exchange's earliest bar, when later than requested */
    shortFrom: isReal && bars[0].t > from + iv * 2 ? bars[0].t : null,
  };
}

export const nearestIndex = (bars, ts) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < bars.length; i++) {
    const d = Math.abs(bars[i].t - ts);
    if (d < bd) { bd = d; best = i; }
    if (bars[i].t > ts) break;
  }
  return best;
};
