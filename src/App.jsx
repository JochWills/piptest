import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { store, SHARED_ENABLED } from "./storage.js";

/* ============================================================
   PIPTEST — v4
   Collaborative market replay + manual backtesting

   Layout follows the reference: top bar, timeframe strip,
   tool rail + chart, setup/notes panel, and a bottom row of
   Market Watch / Replay + blotter tabs / Performance.
   ============================================================ */

/* ---------------- tokens ---------------- */
const THEMES = {
  light: {
    bg: "#F7F8FA", surface: "#FFFFFF", surface2: "#F7F8FA", surface3: "#F1F3F7",
    border: "#E5E7EB", borderStrong: "#D5D9E0",
    ink: "#101828", muted: "#667085", dim: "#98A2B3",
    accent: "#2563EB", accentSoft: "#EFF4FF", accentInk: "#FFFFFF",
    up: "#16A34A", upSoft: "#DCFCE7", down: "#DC2626", downSoft: "#FEE2E2",
    grid: "#F0F2F5", shadow: "0 1px 2px rgba(16,24,40,.05)",
  },
  dark: {
    bg: "#0F1115", surface: "#171A21", surface2: "#1B1F27", surface3: "#212632",
    border: "#262B34", borderStrong: "#333A46",
    ink: "#E8EAED", muted: "#98A2B3", dim: "#6B7280",
    accent: "#3B82F6", accentSoft: "#16233A", accentInk: "#FFFFFF",
    up: "#22C55E", upSoft: "#14301F", down: "#EF4444", downSoft: "#331616",
    grid: "#1C2029", shadow: "none",
  },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.pc * { box-sizing: border-box; }
.pc {
  background: var(--bg); color: var(--ink);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 14px; font-weight: 400; min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  transition: background .16s ease, color .16s ease;
}
.pc-h1 { font-size:20px; font-weight:600; letter-spacing:-.01em; margin:0; }
.pc-h2 { font-size:16px; font-weight:600; margin:0; }
.pc-sm { font-size:12px; font-weight:400; }
.pc-num { font-variant-numeric: tabular-nums; }
.pc-cap { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }

.pc-card { background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:var(--shadow); }

.pc-btn {
  font-family:inherit; font-size:13px; font-weight:500;
  background:var(--surface); color:var(--ink);
  border:1px solid var(--border); border-radius:7px;
  padding:7px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;
  transition: background .12s, border-color .12s, color .12s;
}
.pc-btn:hover:not(:disabled) { background:var(--surface3); }
.pc-btn:disabled { opacity:.4; cursor:not-allowed; }
.pc-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.pc-btn.pri { background:var(--accent); color:var(--accentInk); border-color:var(--accent); }
.pc-btn.pri:hover:not(:disabled) { filter:brightness(1.07); background:var(--accent); }
.pc-btn.ghost { background:transparent; border-color:transparent; color:var(--accent); }
.pc-btn.ghost:hover:not(:disabled) { background:var(--accentSoft); }
.pc-btn.sec { background:var(--surface); }
.pc-icon {
  width:32px; height:32px; padding:0; display:grid; place-items:center;
  background:transparent; border:1px solid transparent; border-radius:7px;
  color:var(--muted); cursor:pointer; transition:background .12s,color .12s;
}
.pc-icon:hover:not(:disabled) { background:var(--surface3); color:var(--ink); }
.pc-icon:disabled { opacity:.35; cursor:not-allowed; }
.pc-icon.on { background:var(--accent); color:var(--accentInk); }

.pc-in, .pc-sel {
  font-family:inherit; font-size:13px; width:100%;
  background:var(--surface); color:var(--ink);
  border:1px solid var(--border); border-radius:7px; padding:7px 9px;
  font-variant-numeric: tabular-nums;
}
.pc-in:focus, .pc-sel:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accentSoft); }
.pc-in::placeholder { color:var(--dim); }

.pc-tab {
  font-family:inherit; font-size:13px; font-weight:500; padding:7px 11px;
  background:transparent; border:none; border-bottom:2px solid transparent;
  color:var(--muted); cursor:pointer;
}
.pc-tab:hover { color:var(--ink); }
.pc-tab.on { color:var(--accent); border-bottom-color:var(--accent); }

.pc-tf {
  font-family:inherit; font-size:12px; font-weight:500; padding:5px 10px;
  background:transparent; border:1px solid transparent; border-radius:6px;
  color:var(--muted); cursor:pointer;
}
.pc-tf:hover { background:var(--surface3); color:var(--ink); }
.pc-tf.on { background:var(--accentSoft); color:var(--accent); }

.pc-pill { font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; }

.pc-rail { display:flex; flex-direction:column; gap:2px; padding:6px 4px; border-right:1px solid var(--border); }
.pc-tool { width:30px; height:30px; display:grid; place-items:center; border:none; border-radius:6px;
  background:transparent; color:var(--muted); cursor:pointer; transition:background .12s,color .12s; }
.pc-tool:hover:not(:disabled) { background:var(--surface3); color:var(--ink); }
.pc-tool.on { background:var(--accentSoft); color:var(--accent); }
.pc-tool:disabled { opacity:.3; cursor:not-allowed; }
.pc-railsep { height:1px; background:var(--border); margin:5px 4px; }
.pc-sw { width:14px; height:14px; border-radius:4px; border:2px solid transparent; cursor:pointer; padding:0; }
.pc-sw.on { border-color:var(--ink); }

.pc-row { display:flex; align-items:center; justify-content:space-between; padding:7px 0; font-size:13px; }
.pc-row + .pc-row { border-top:1px solid var(--border); }

.pc-scroll::-webkit-scrollbar { width:8px; height:8px; }
.pc-scroll::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
.pc-scroll::-webkit-scrollbar-track { background:transparent; }

.pc-tbl { width:100%; border-collapse:collapse; font-size:13px; }
.pc-tbl th { text-align:left; font-weight:500; color:var(--muted); font-size:12px; padding:8px 10px; border-bottom:1px solid var(--border); }
.pc-tbl td { padding:9px 10px; border-bottom:1px solid var(--border); font-variant-numeric:tabular-nums; }
.pc-tbl tr:last-child td { border-bottom:none; }
.pc-tbl tbody tr:hover { background:var(--surface2); }

.pc-mkt { display:flex; align-items:center; gap:9px; padding:8px 12px; cursor:pointer; border:none; background:transparent; width:100%; text-align:left; font-family:inherit; }
.pc-mkt:hover { background:var(--surface2); }
.pc-mkt.on { background:var(--accentSoft); }

.pc-chart { position:relative; flex:1; min-width:0; }
.pc-ov { position:absolute; inset:0; pointer-events:none; }

.pc-tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
.pc-tile { cursor:pointer; transition:border-color .14s, box-shadow .14s; }
.pc-tile:hover { border-color:var(--accent); }
.pc-tile:hover .pc-del { opacity:1; }
.pc-del { opacity:0; transition:opacity .14s; }

.pc-bottom { display:grid; grid-template-columns:300px minmax(0,1fr) 360px; gap:12px; }
.pc-main { display:grid; grid-template-columns:minmax(0,1fr) 232px; gap:12px; }
@media (max-width:1280px) { .pc-bottom { grid-template-columns:1fr; } }
@media (max-width:1080px) { .pc-main { grid-template-columns:1fr; } }

@keyframes pc-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.pc-live { animation:pc-pulse 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion:reduce) { .pc-live { animation:none; } }
`;

/* ---------------- constants ---------------- */
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "MATICUSDT"];
const INTERVALS = [
  { id: "1s", ms: 1000, label: "1s" }, { id: "1m", ms: 60000, label: "1m" },
  { id: "5m", ms: 300000, label: "5m" }, { id: "15m", ms: 900000, label: "15m" },
  { id: "30m", ms: 1800000, label: "30m" }, { id: "1h", ms: 3600000, label: "1H" },
  { id: "4h", ms: 14400000, label: "4H" }, { id: "1d", ms: 86400000, label: "1D" },
];
const SPEEDS = [1, 2, 5, 10, 25, 50];
const START_BALANCE = 10000;
const MAX_LEVERAGE = 10;
const MAX_ENTRY_DRIFT = 0.25;   // reject entries >25% from the live bar
/* History loaded BEFORE the session start. Expressed as a target TIME span so
   every timeframe covers a comparable date range, capped in bars so small
   timeframes don't try to fetch a decade of one-second candles. */
const WARMUP_MS = 45 * 86400000;   // aim for 45 days of lead-in
const WARMUP_MAX_BARS = 800;
const FORWARD_BARS = 1000;
const WARMUP_MIN_BARS = 200;   // never less lead-in than before, whatever the timeframe
const warmupBars = (id) => Math.max(WARMUP_MIN_BARS, Math.min(WARMUP_MAX_BARS, Math.ceil(WARMUP_MS / barMsOf(id))));
const CHUNK = 1000;
const LWC_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/lightweight-charts/4.2.0/lightweight-charts.standalone.production.js",
  "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
  "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
];
const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const ZOOMS = [{ n: 60, l: "60" }, { n: 120, l: "120" }, { n: 250, l: "250" }, { n: 500, l: "500" }, { n: 0, l: "All" }];

/* ---------------- data ---------------- */
const DATA_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
async function fetchKlines(symbol, interval, startTime, limit = CHUNK) {
  for (const host of DATA_HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`);
      if (!r.ok) continue;
      const raw = await r.json();
      if (Array.isArray(raw) && raw.length) return raw.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
    } catch (e) {}
  }
  return null;
}
/* Binance caps a request at 1000 klines. Page through so lower timeframes can
   still cover a useful stretch of history rather than a few minutes of it. */
async function fetchKlinesPaged(symbol, interval, startTime, wanted) {
  const iv = barMsOf(interval);
  let out = [], t = startTime, guard = 0;
  while (out.length < wanted && guard++ < 6) {
    const chunk = await fetchKlines(symbol, interval, t, 1000);
    if (!chunk || !chunk.length) break;
    const fresh = out.length ? chunk.filter((k) => k.t > out[out.length - 1].t) : chunk;
    if (!fresh.length) break;
    out = out.concat(fresh);
    if (chunk.length < 1000) break;
    t = chunk[chunk.length - 1].t + iv;
  }
  return out.length ? out : null;
}

async function fetchTickers(symbols) {
  for (const host of DATA_HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
      if (!r.ok) continue;
      const raw = await r.json();
      if (Array.isArray(raw)) return raw.map((x) => ({ symbol: x.symbol, price: +x.lastPrice, chg: +x.priceChangePercent }));
    } catch (e) {}
  }
  return null;
}
function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BASE_PX = { BTCUSDT: 62000, ETHUSDT: 3100, SOLUSDT: 145, BNBUSDT: 580, XRPUSDT: 0.52, DOGEUSDT: 0.15, ADAUSDT: 0.45, LINKUSDT: 14, AVAXUSDT: 27, MATICUSDT: 0.55 };
function syntheticKlines(symbol, interval, startTime, count = CHUNK) {
  const rand = mulberry32(hashSeed(symbol + interval + startTime));
  const iv = INTERVALS.find((i) => i.id === interval)?.ms || 60000;
  const base = BASE_PX[symbol] || 100;
  const vol = 0.0006 * Math.sqrt(iv / 60000);
  let price = base; const out = [];
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.5) * vol * price * 2;
    const o = price, c = Math.max(price * 0.5, o + drift);
    const wick = Math.abs(drift) * (0.6 + rand() * 1.8) + price * vol * 0.4;
    out.push({ t: startTime + i * iv, o, c, h: Math.max(o, c) + wick * rand(), l: Math.min(o, c) - wick * rand(), v: 10 + rand() * 100 });
    price = c;
  }
  return out;
}

/* ---------------- format ---------------- */
const dec = (p) => (p >= 1000 ? 2 : p >= 1 ? 3 : 5);
const fmtPrice = (p) => (p == null || Number.isNaN(p) ? "—" : p.toFixed(dec(p)));
const fmtMoney = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toFixed(2);
const fmtR = (r) => (r >= 0 ? "+" : "−") + Math.abs(r).toFixed(2) + "R";
const pad = (n) => String(n).padStart(2, "0");
const fmtClock = (ms, iv) => { const d = new Date(ms); return `${pad(d.getUTCDate())} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${iv === "1s" ? ":" + pad(d.getUTCSeconds()) : ""}`; };
const fmtDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const makeCode = () => { const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join(""); };

/* ---------------- stats ---------------- */
function computeStats(trades) {
  const ord = [...trades].sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
  let gw = 0, gl = 0, wins = 0, losses = 0, flat = 0, peak = START_BALANCE, maxDD = 0, eq = START_BALANCE, rSum = 0;
  const curve = [START_BALANCE];
  for (const t of ord) {
    eq += t.pnl; curve.push(eq); rSum += t.r || 0;
    if (t.pnl > 0) { wins++; gw += t.pnl; }
    else if (t.pnl < 0) { losses++; gl += Math.abs(t.pnl); }
    else flat++;
    if (eq > peak) peak = eq;
    if (peak - eq > maxDD) maxDD = peak - eq;
  }
  const n = ord.length, decided = wins + losses;
  return {
    count: n, wins, losses, flat, net: eq - START_BALANCE,
    winRate: decided ? (wins / decided) * 100 : 0,
    profitFactor: gl > 0 ? gw / gl : null,   // null = no losses to divide by
    avgR: n ? rSum / n : 0,
    avgWin: wins ? gw / wins : 0, avgLoss: losses ? gl / losses : 0,
    expectancy: n ? (eq - START_BALANCE) / n : 0,
    maxDD, maxDDPct: peak ? (maxDD / peak) * 100 : 0,
    best: n ? Math.max(...ord.map((t) => t.pnl)) : 0,
    worst: n ? Math.min(...ord.map((t) => t.pnl)) : 0,
    equity: eq, curve,
  };
}

/* ---------------- setup validation ---------------- */
function validateSetup({ dir, entry, stop, target, riskPct, equity, price }) {
  const e = +entry, s = +stop, t = target === "" || target == null ? null : +target;
  const r = +riskPct;
  const errs = [];
  const long = dir === "long";

  if (!(e > 0)) errs.push("Entry must be a positive number.");
  if (!(s > 0)) errs.push("Stop must be a positive number.");
  if (e > 0 && s > 0) {
    if (s === e) errs.push("Stop cannot equal the entry — there would be no risk to size against.");
    else if (long && s > e) errs.push("A long stop must sit below the entry.");
    else if (!long && s < e) errs.push("A short stop must sit above the entry.");
  }
  if (t != null && !Number.isNaN(t) && e > 0) {
    if (long && t <= e) errs.push("A long target must sit above the entry.");
    if (!long && t >= e) errs.push("A short target must sit below the entry.");
  }
  if (!(r > 0)) errs.push("Risk % must be greater than zero.");
  else if (r > 100) errs.push("Risk % cannot exceed 100.");

  if (price > 0 && e > 0 && Math.abs(e - price) / price > MAX_ENTRY_DRIFT) {
    errs.push(`Entry is ${(Math.abs(e - price) / price * 100).toFixed(0)}% away from the current price (${fmtPrice(price)}) — check the instrument.`);
  }
  if (!errs.length) {
    const qty = (equity * (r / 100)) / Math.abs(e - s);
    if (qty * e > equity * MAX_LEVERAGE) {
      errs.push(`That stop is too tight — it needs ${(qty * e / equity).toFixed(1)}x leverage (cap is ${MAX_LEVERAGE}x). Widen the stop or lower the risk %.`);
    }
  }
  return errs;
}

/* ---------------- indicators ---------------- */
function smaSeries(bars, p) { const o = new Array(bars.length).fill(null); let s = 0; for (let i = 0; i < bars.length; i++) { s += bars[i].c; if (i >= p) s -= bars[i - p].c; if (i >= p - 1) o[i] = s / p; } return o; }
function emaSeries(bars, p) { const o = new Array(bars.length).fill(null); const k = 2 / (p + 1); let pv = null; for (let i = 0; i < bars.length; i++) { pv = pv == null ? bars[i].c : bars[i].c * k + pv * (1 - k); if (i >= p - 1) o[i] = pv; } return o; }
const INDICATORS = [
  { id: "ema20", label: "EMA 20", period: 20, kind: "ema", color: (t) => t.accent },
  { id: "ema50", label: "EMA 50", period: 50, kind: "ema", color: (t) => "#F59E0B" },
  { id: "sma200", label: "SMA 200", period: 200, kind: "sma", color: (t) => t.muted },
];

/* ---------------- icons ---------------- */
const Ic = {
  play: <path d="M5 3.5l8 4.5-8 4.5z" fill="currentColor" />,
  pause: <><rect x="4.5" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" /><rect x="8.9" y="3.5" width="2.6" height="9" rx=".6" fill="currentColor" /></>,
  toStart: <><rect x="3.5" y="3.5" width="1.6" height="9" fill="currentColor" /><path d="M13 3.5l-6.5 4.5L13 12.5z" fill="currentColor" /></>,
  stepBack: <><rect x="3.5" y="3.5" width="1.6" height="9" fill="currentColor" /><path d="M12.5 4.5l-5 3.5 5 3.5z" fill="currentColor" /></>,
  stepFwd: <><rect x="11" y="3.5" width="1.6" height="9" fill="currentColor" /><path d="M3.5 4.5l5 3.5-5 3.5z" fill="currentColor" /></>,
  save: <><path d="M3.5 3.5h7l3 3v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M5.5 3.5v4h5v-4M5.5 14v-3.5h6V14" stroke="currentColor" strokeWidth="1.3" fill="none" /></>,
  sun: <><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>,
  moon: <path d="M13.2 9.9A6 6 0 0 1 6.1 2.8a6 6 0 1 0 7.1 7.1z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />,
  grid: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" /></>,
  users: <><circle cx="6" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M1.8 13.5c0-2.3 1.9-3.8 4.2-3.8s4.2 1.5 4.2 3.8" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /><path d="M11 4.2a2.2 2.2 0 0 1 0 4.2M12 13.5c0-1.7-.6-2.9-1.6-3.6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" /></>,
  undo: <path d="M5.5 4.5L3 7l2.5 2.5M3 7h6a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  redo: <path d="M10.5 4.5L13 7l-2.5 2.5M13 7H7a3.5 3.5 0 0 0 0 7h3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  chev: <path d="M4 6.5L8 10l4-3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  star: <path d="M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.5 4.3 13.5l.8-4.2L2 6.4l4.2-.5z" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />,
  plus: <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  close: <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
  search: <><circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" fill="none" /><path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>,
};
const Tl = {
  cursor: <path d="M4 3l8.5 6.6-3.8.7L10.4 14 9 14.7 7.2 10.9 4.3 12.6z" fill="currentColor" />,
  trend: <><path d="M3 13L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="3" cy="13" r="1.7" fill="currentColor" /><circle cx="13" cy="4" r="1.7" fill="currentColor" /></>,
  ray: <><path d="M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M10.5 9.5L13 12l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(0,-2)" /><circle cx="3" cy="12" r="1.7" fill="currentColor" /></>,
  hline: <><path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></>,
  vline: <><path d="M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></>,
  rect: <rect x="2.5" y="4" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />,
  fib: <path d="M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  measure: <><path d="M3 11L12 4" stroke="currentColor" strokeWidth="1.4" /><path d="M3 7.5V13h5.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>,
  trash: <path d="M3 4.5h10M6.2 4.5V3h3.6v1.5M4.4 4.5l.7 9h5.8l.7-9" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
};
const TOOLS = [
  { id: "cursor", icon: Tl.cursor, title: "Cursor — select, move, delete" },
  { id: "trend", icon: Tl.trend, title: "Trend line" },
  { id: "ray", icon: Tl.ray, title: "Ray" },
  { id: "hline", icon: Tl.hline, title: "Horizontal line" },
  { id: "vline", icon: Tl.vline, title: "Vertical line" },
  { id: "rect", icon: Tl.rect, title: "Rectangle" },
  { id: "fib", icon: Tl.fib, title: "Fib retracement" },
  { id: "measure", icon: Tl.measure, title: "Measure" },
];
const PALETTE = ["accent", "up", "down", "muted"];
const Svg = ({ children, s = 16 }) => <svg width={s} height={s} viewBox="0 0 16 16" fill="none">{children}</svg>;
const barMsOf = (id) => INTERVALS.find((i) => i.id === id)?.ms || 60000;

/* ---------------- equity area chart ---------------- */
function EquityChart({ curve, height = 130 }) {
  const id = useRef("eq" + uid()).current;
  if (!curve || curve.length < 2) {
    return <div style={{ height, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 12 }}>No closed trades yet</div>;
  }
  const W = 400, H = height;
  const lo = Math.min(...curve, START_BALANCE), hi = Math.max(...curve, START_BALANCE);
  const span = hi - lo || 1;
  const x = (i) => (i / (curve.length - 1)) * W;
  const y = (v) => 8 + (1 - (v - lo) / span) * (H - 30);
  const line = curve.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const up = curve[curve.length - 1] >= START_BALANCE;
  const col = up ? "var(--up)" : "var(--down)";
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={y(START_BALANCE)} x2={W} y2={y(START_BALANCE)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H - 14} ${line} ${W},${H - 14}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function Spark({ curve, h = 34 }) {
  if (!curve || curve.length < 2) return <svg width="100%" height={h} viewBox={`0 0 240 ${h}`} preserveAspectRatio="none"><line x1="0" y1={h / 2} x2="240" y2={h / 2} stroke="var(--border)" strokeDasharray="3 4" /></svg>;
  const lo = Math.min(...curve), hi = Math.max(...curve), span = hi - lo || 1;
  const y = (v) => h - 3 - ((v - lo) / span) * (h - 6);
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * 240},${y(v)}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 240 ${h}`} preserveAspectRatio="none">
      <line x1="0" y1={y(curve[0])} x2="240" y2={y(curve[0])} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
      <polyline points={pts} fill="none" stroke={curve[curve.length - 1] >= curve[0] ? "var(--up)" : "var(--down)"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------------- lwc loader ---------------- */
function useLWC() {
  const [s, set] = useState(() => (typeof window !== "undefined" && window.LightweightCharts ? "ready" : "loading"));
  useEffect(() => {
    if (window.LightweightCharts) { set("ready"); return; }
    let i = 0, dead = false;
    const next = () => {
      if (dead) return;
      if (i >= LWC_URLS.length) { set("failed"); return; }
      const el = document.createElement("script");
      el.src = LWC_URLS[i++]; el.async = true;
      el.onload = () => { if (!dead) set(window.LightweightCharts ? "ready" : "failed"); };
      el.onerror = () => { el.remove(); next(); };
      document.head.appendChild(el);
    };
    next();
    return () => { dead = true; };
  }, []);
  return s;
}

/* ============================================================
   CHART
   ============================================================ */
function Chart({ bars, cursor, theme, interval, symbol, trade, height, drawings, onDrawings: onDrawingsRaw, onSnapshot, tool, setTool, color, selected, setSelected, indicators, logScale, zoom }) {
  const boxRef = useRef(null), ovRef = useRef(null);
  const chartRef = useRef(null), serRef = useRef(null), volRef = useRef(null), indRefs = useRef({});
  const lastRef = useRef({ key: "", cursor: -1 });
  const dragRef = useRef(null), hovRef = useRef(null), sigRef = useRef("");
  const stRef = useRef({});
  const lwc = useLWC();
  const t = THEMES[theme];
  const dataKey = `${bars[0]?.t || 0}|${bars.length}|${interval}`;
  const market = symbol;
  const onDrawings = useCallback((next) => {
    onDrawingsRaw((prev) => {
      const others = (prev || []).filter((d) => d.market && d.market !== market);
      const mine = (prev || []).filter((d) => !d.market || d.market === market);
      const updated = typeof next === "function" ? next(mine) : next;
      return [...others, ...updated.map((d) => (d.market ? d : { ...d, market }))];
    });
  }, [onDrawingsRaw, market]);
  const visible = useMemo(() => (drawings || []).filter((d) => !d.market || d.market === market), [drawings, market]);
  stRef.current = { drawings: visible, all: drawings, onDrawings, onSnapshot, tool, setTool, color, selected, setSelected, t, trade, market };

  const indVals = useMemo(() => {
    const o = {};
    INDICATORS.forEach((i) => { if (indicators[i.id]) o[i.id] = i.kind === "ema" ? emaSeries(bars, i.period) : smaSeries(bars, i.period); });
    return o;
  }, [bars, indicators]);

  /* create */
  useEffect(() => {
    if (lwc !== "ready" || !boxRef.current) return;
    const LC = window.LightweightCharts;
    const chart = LC.createChart(boxRef.current, {
      width: boxRef.current.clientWidth, height,
      layout: { background: { color: "transparent" }, textColor: t.muted, fontFamily: "Inter, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border, scaleMargins: { top: 0.12, bottom: 0.2 } },
      timeScale: { borderColor: t.border, timeVisible: true, secondsVisible: interval === "1s", rightOffset: 12 },
      crosshair: { mode: 0, vertLine: { color: t.dim, width: 1, style: 3, labelBackgroundColor: t.ink }, horzLine: { color: t.dim, width: 1, style: 3, labelBackgroundColor: t.ink } },
    });
    const o = { upColor: t.up, downColor: t.down, borderVisible: false, wickUpColor: t.up, wickDownColor: t.down };
    const ser = chart.addCandlestickSeries ? chart.addCandlestickSeries(o) : chart.addSeries(LC.CandlestickSeries, o);
    chartRef.current = chart; serRef.current = ser; lastRef.current = { key: "", cursor: -1 };

    const ro = new ResizeObserver(() => { if (boxRef.current) { chart.applyOptions({ width: boxRef.current.clientWidth }); sizeOv(); } });
    ro.observe(boxRef.current); sizeOv();

    let raf = 0;
    const loop = () => {
      const ser = serRef.current, c = chartRef.current;
      if (ser && c) {
        const { bars: bs } = geoRef.current;          // live, not the mount-time array
        const r = c.timeScale().getVisibleLogicalRange();
        const ref = ser.priceToCoordinate(bs[Math.min(cursorRef.current, bs.length - 1)]?.c ?? 0);
        const sig = `${r?.from?.toFixed(2)}|${r?.to?.toFixed(2)}|${ref}|${boxRef.current?.clientWidth}`;
        if (sig !== sigRef.current) { sigRef.current = sig; paint(); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); chart.remove(); chartRef.current = null; serRef.current = null; volRef.current = null; indRefs.current = {}; };
  }, [lwc, height]); // eslint-disable-line

  useEffect(() => {
    const c = chartRef.current, s = serRef.current;
    if (!c || !s) return;
    c.applyOptions({
      layout: { textColor: t.muted },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.border, mode: logScale ? 1 : 0 },
      timeScale: { borderColor: t.border, secondsVisible: interval === "1s" },
      crosshair: { vertLine: { color: t.dim, labelBackgroundColor: t.ink }, horzLine: { color: t.dim, labelBackgroundColor: t.ink } },
    });
    s.applyOptions({ upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down });
    paint();
  }, [theme, interval, t, logScale]); // eslint-disable-line

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const drawMode = tool !== "cursor";
    c.applyOptions({
      handleScroll: { mouseWheel: true, pressedMouseMove: !drawMode, horzTouchDrag: !drawMode, vertTouchDrag: !drawMode },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });
  }, [tool, lwc]);

  /* zoom presets — also re-applied whenever the dataset changes, so switching
     timeframe keeps the same window size instead of showing whatever the
     previous logical range happened to be */
  useEffect(() => {
    const c = chartRef.current;
    if (!c || !bars.length || lwc !== "ready") return;
    const end = Math.min(cursor + 1, bars.length);
    if (!zoom) c.timeScale().fitContent();
    else c.timeScale().setVisibleLogicalRange({ from: Math.max(0, end - zoom), to: end + 12 });
  }, [zoom, dataKey, lwc]); // eslint-disable-line

  /* volume */
  useEffect(() => {
    const c = chartRef.current, LC = window.LightweightCharts;
    if (!c || !LC) return;
    if (indicators.volume && !volRef.current) {
      const o = { priceFormat: { type: "volume" }, priceScaleId: "vol" };
      volRef.current = c.addHistogramSeries ? c.addHistogramSeries(o) : c.addSeries(LC.HistogramSeries, o);
      c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    } else if (!indicators.volume && volRef.current) {
      try { c.removeSeries(volRef.current); } catch (e) {}
      volRef.current = null;
    }
    lastRef.current = { key: "", cursor: -1 };
  }, [indicators.volume, lwc]);

  useEffect(() => {
    const c = chartRef.current, LC = window.LightweightCharts;
    if (!c || !LC) return;
    INDICATORS.forEach((ind) => {
      const on = !!indicators[ind.id];
      if (on && !indRefs.current[ind.id]) {
        const o = { color: ind.color(t), lineWidth: 1.6, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        indRefs.current[ind.id] = c.addLineSeries ? c.addLineSeries(o) : c.addSeries(LC.LineSeries, o);
      } else if (!on && indRefs.current[ind.id]) {
        try { c.removeSeries(indRefs.current[ind.id]); } catch (e) {}
        delete indRefs.current[ind.id];
      } else if (on) indRefs.current[ind.id].applyOptions({ color: ind.color(t) });
    });
    lastRef.current = { key: "", cursor: -1 };
  }, [indicators, lwc, t]);

  /* data */
  useEffect(() => {
    const s = serRef.current;
    if (!s || !bars.length) return;
    const end = Math.min(cursor + 1, bars.length);
    const tb = (b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c });
    const prev = lastRef.current;
    if (prev.key === dataKey && cursor === prev.cursor + 1 && end > 0) {
      const b = bars[end - 1];
      s.update(tb(b));
      if (volRef.current) volRef.current.update({ time: Math.floor(b.t / 1000), value: b.v, color: (b.c >= b.o ? t.up : t.down) + "55" });
      INDICATORS.forEach((ind) => { const ss = indRefs.current[ind.id], v = indVals[ind.id]; if (ss && v && v[end - 1] != null) ss.update({ time: Math.floor(b.t / 1000), value: v[end - 1] }); });
    } else {
      const sl = bars.slice(0, end);
      s.setData(sl.map(tb));
      if (volRef.current) volRef.current.setData(sl.map((b) => ({ time: Math.floor(b.t / 1000), value: b.v, color: (b.c >= b.o ? t.up : t.down) + "55" })));
      INDICATORS.forEach((ind) => {
        const ss = indRefs.current[ind.id], v = indVals[ind.id];
        if (!ss || !v) return;
        ss.setData(sl.map((b, i) => (v[i] == null ? null : { time: Math.floor(b.t / 1000), value: v[i] })).filter(Boolean));
      });
      if (prev.key !== dataKey && chartRef.current) chartRef.current.timeScale().fitContent();
    }
    lastRef.current = { key: dataKey, cursor };
    paint();
    /* `lwc` MUST be a dependency: when the library finishes loading after this
       component mounted, the series is created in a later effect pass and this
       effect has to re-run or the chart stays empty until something else
       changes. That was the "loading, then blank until I switch timeframe" bug. */
  }, [bars, cursor, dataKey, indVals, lwc]); // eslint-disable-line

  function sizeOv() {
    const cv = ovRef.current, b = boxRef.current;
    if (!cv || !b) return;
    const d = window.devicePixelRatio || 1;
    cv.width = b.clientWidth * d; cv.height = b.clientHeight * d;
    cv.style.width = b.clientWidth + "px"; cv.style.height = b.clientHeight + "px";
    paint();
  }
  /* --- time <-> logical index, so drawings survive a timeframe change ---
     A logical index means a different moment on every timeframe, so drawings
     store a timestamp (`ts`) and are reprojected on every paint.

     CRITICAL: these read `bars` and `interval` from geoRef, NOT from the
     enclosing render's variables. `paint` and the pointer handlers are created
     once (deps []) and would otherwise keep converting against whichever
     timeframe was loaded when the chart first mounted — which is exactly why
     a box drawn on 30m landed in the wrong place on 4H. */
  const geoRef = useRef({ bars: [], interval });
  geoRef.current = { bars, interval };
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const tsToLogical = (ts) => {
    const { bars: bs, interval: iv0 } = geoRef.current;
    if (!bs.length || ts == null) return null;
    const iv = barMsOf(iv0);
    if (ts <= bs[0].t) return (ts - bs[0].t) / iv;
    const last = bs.length - 1;
    if (ts >= bs[last].t) return last + (ts - bs[last].t) / iv;
    let lo = 0, hi = last;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bs[mid].t === ts) return mid;
      if (bs[mid].t < ts) lo = mid + 1; else hi = mid - 1;
    }
    const a = Math.max(0, hi), b = Math.min(last, lo);
    const span = bs[b].t - bs[a].t;
    return span > 0 ? a + (ts - bs[a].t) / span : a;
  };
  const logicalToTs = (l) => {
    const { bars: bs, interval: iv0 } = geoRef.current;
    if (!bs.length || l == null) return null;
    const iv = barMsOf(iv0);
    if (l <= 0) return bs[0].t + l * iv;
    const last = bs.length - 1;
    if (l >= last) return bs[last].t + (l - last) * iv;
    const i = Math.floor(l), f = l - i;
    return bs[i].t + (bs[i + 1].t - bs[i].t) * f;
  };
  /* a point may carry `ts` (preferred) or a legacy bare `l` */
  const ptL = (pt) => (pt.ts != null ? tsToLogical(pt.ts) : pt.l);

  /* Project a logical index to a pixel ourselves instead of using
     logicalToCoordinate, which returns null once the index falls outside the
     loaded bars — that null made the whole drawing vanish or snap to the wrong
     place. Bars are evenly spaced by logical index, so this linear map is what
     the library does internally, and it extrapolates cleanly past both ends. */
  const toX = (l) => {
    const c = chartRef.current;
    if (!c || l == null || !Number.isFinite(l)) return null;
    const ts = c.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r || r.to === r.from) return null;
    const w = (typeof ts.width === "function" ? ts.width() : 0) || boxRef.current?.clientWidth || 0;
    return ((l - r.from) / (r.to - r.from)) * w;
  };
  const toY = (p) => { const v = serRef.current?.priceToCoordinate(p); return v == null ? null : v; };
  const fromX = (x) => chartRef.current?.timeScale().coordinateToLogical(x);
  const fromY = (y) => serRef.current?.coordinateToPrice(y);

  /* paint overlay: drawings + the trade zones */
  const paint = useCallback(() => {
    const cv = ovRef.current, box = boxRef.current;
    if (!cv || !box || !chartRef.current || !serRef.current) return;
    const d = window.devicePixelRatio || 1, W = box.clientWidth, H = box.clientHeight;
    const c = cv.getContext("2d");
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
    c.font = "500 11px Inter, sans-serif"; c.textBaseline = "middle";
    const st = stRef.current;

    const pill = (text, x, y, bg) => {
      c.save(); c.font = "600 11px Inter, sans-serif";
      const w = c.measureText(text).width + 14, h = 18, r = 4;
      const px = Math.min(x, W - w - 72);   // keep clear of the price axis
      c.beginPath(); c.moveTo(px + r, y - h / 2);
      c.arcTo(px + w, y - h / 2, px + w, y + h / 2, r); c.arcTo(px + w, y + h / 2, px, y + h / 2, r);
      c.arcTo(px, y + h / 2, px, y - h / 2, r); c.arcTo(px, y - h / 2, px + w, y - h / 2, r);
      c.closePath(); c.fillStyle = bg; c.fill();
      c.fillStyle = "#fff"; c.fillText(text, px + 7, y + .5); c.restore();
    };

    /* trade zones */
    const tr = st.trade;
    if (tr) {
      const x1 = toX(tr.fromLogical) ?? 0;
      const yE = toY(tr.entry), yS = toY(tr.stop), yT = toY(tr.target);
      if (yE != null) {
        if (yT != null) { c.fillStyle = st.t.up; c.globalAlpha = .13; c.fillRect(x1, Math.min(yE, yT), W - x1, Math.abs(yT - yE)); }
        if (yS != null) { c.fillStyle = st.t.down; c.globalAlpha = .13; c.fillRect(x1, Math.min(yE, yS), W - x1, Math.abs(yS - yE)); }
        c.globalAlpha = 1;
        const dash = (y, col) => { c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x1, y); c.lineTo(W, y); c.stroke(); c.setLineDash([]); };
        if (yT != null) dash(yT, st.t.up);
        if (yS != null) dash(yS, st.t.down);
        c.strokeStyle = st.t.accent; c.lineWidth = 1.4; c.setLineDash([]);
        c.beginPath(); c.moveTo(x1, yE); c.lineTo(W, yE); c.stroke();
        if (yT != null) pill(`Target: ${fmtPrice(tr.target)}`, W - 120, yT, st.t.up);
        pill(`Entry: ${fmtPrice(tr.entry)}`, W - 120, yE, st.t.accent);
        if (yS != null) pill(`Stop: ${fmtPrice(tr.stop)}`, W - 120, yS, st.t.down);
      }
    }

    /* drawings */
    const list = [...(st.drawings || [])];
    if (dragRef.current?.preview) list.push(dragRef.current.preview);
    for (const dr of list) {
      const col = st.t[dr.color] || st.t.accent;
      const sel = dr.id === st.selected, hov = dr.id === hovRef.current;
      c.strokeStyle = col; c.fillStyle = col;
      c.globalAlpha = sel || hov ? 1 : .9; c.lineWidth = sel ? 2.2 : 1.5;
      const P = dr.pts.map((p) => ({ x: toX(ptL(p)), y: toY(p.p) }));
      if (P.some((p) => p.x == null || p.y == null)) continue;

      if (dr.type === "hline") { c.beginPath(); c.moveTo(0, P[0].y); c.lineTo(W, P[0].y); c.stroke(); lbl(fmtPrice(dr.pts[0].p), 6, P[0].y - 10, col); }
      else if (dr.type === "vline") { c.beginPath(); c.moveTo(P[0].x, 0); c.lineTo(P[0].x, H); c.stroke(); }
      else if (dr.type === "trend" || dr.type === "measure") {
        c.beginPath(); c.moveTo(P[0].x, P[0].y); c.lineTo(P[1].x, P[1].y); c.stroke();
        if (dr.type === "measure") {
          const dp = dr.pts[1].p - dr.pts[0].p, dpct = (dp / dr.pts[0].p) * 100, nb = Math.round(ptL(dr.pts[1]) - ptL(dr.pts[0]));
          c.globalAlpha = .12; c.fillRect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y)); c.globalAlpha = 1;
          lbl(`${dp >= 0 ? "+" : ""}${fmtPrice(dp)}   ${dpct >= 0 ? "+" : ""}${dpct.toFixed(2)}%   ${nb} bars`, (P[0].x + P[1].x) / 2 - 65, Math.min(P[0].y, P[1].y) - 13, col);
        }
      } else if (dr.type === "ray") {
        const dx = P[1].x - P[0].x, dy = P[1].y - P[0].y, k = dx === 0 ? 1e6 : (W - P[0].x) / dx;
        c.beginPath(); c.moveTo(P[0].x, P[0].y); c.lineTo(P[0].x + dx * Math.max(k, 1), P[0].y + dy * Math.max(k, 1)); c.stroke();
      } else if (dr.type === "rect") {
        const x = Math.min(P[0].x, P[1].x), y = Math.min(P[0].y, P[1].y);
        const w = Math.abs(P[1].x - P[0].x), h = Math.abs(P[1].y - P[0].y);
        c.globalAlpha = .1; c.fillRect(x, y, w, h); c.globalAlpha = sel || hov ? 1 : .9; c.strokeRect(x, y, w, h);
      } else if (dr.type === "fib") {
        const hi = dr.pts[0].p, lo = dr.pts[1].p;
        const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x);
        FIBS.forEach((f, i) => {
          const pr = hi + (lo - hi) * f, y = toY(pr);
          if (y == null) return;
          c.globalAlpha = .85; c.setLineDash(f === 0 || f === 1 ? [] : [4, 3]);
          c.beginPath(); c.moveTo(x1, y); c.lineTo(Math.max(x2, W), y); c.stroke(); c.setLineDash([]);
          if (i > 0) { const yp = toY(hi + (lo - hi) * FIBS[i - 1]); if (yp != null) { c.globalAlpha = .06; c.fillRect(x1, Math.min(y, yp), Math.max(x2, W) - x1, Math.abs(y - yp)); } }
          c.globalAlpha = 1; lbl(`${(f * 100).toFixed(1)}%  ${fmtPrice(pr)}`, x1 + 4, y - 10, col);
        });
      }
      if (sel) {
        c.globalAlpha = 1; c.fillStyle = st.t.surface; c.strokeStyle = col; c.lineWidth = 1.6;
        P.forEach((p) => {
          const hx = dr.type === "hline" ? W / 2 : p.x, hy = dr.type === "vline" ? H / 2 : p.y;
          c.beginPath(); c.arc(hx, hy, 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
        });
      }
      c.globalAlpha = 1;
    }
    function lbl(text, x, y, col) {
      c.save(); const w = c.measureText(text).width + 8;
      c.globalAlpha = .94; c.fillStyle = st.t.surface; c.fillRect(x - 2, y - 8, w, 16);
      c.globalAlpha = 1; c.fillStyle = col; c.fillText(text, x + 2, y); c.restore();
    }
  }, []); // eslint-disable-line

  useEffect(() => { paint(); }, [drawings, selected, trade, paint]);

  /* hit testing + pointer */
  const dSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const k = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
  };
  const hit = (x, y) => {
    const st = stRef.current, W = boxRef.current?.clientWidth || 0, H = boxRef.current?.clientHeight || 0;
    for (let i = (st.drawings || []).length - 1; i >= 0; i--) {
      const dr = st.drawings[i];
      const P = dr.pts.map((p) => ({ x: toX(ptL(p)), y: toY(p.p) }));
      if (P.some((p) => p.x == null || p.y == null)) continue;
      for (let k = 0; k < P.length; k++) {
        const hx = dr.type === "hline" ? W / 2 : P[k].x, hy = dr.type === "vline" ? H / 2 : P[k].y;
        if (Math.hypot(x - hx, y - hy) < 9) return { d: dr, point: k };
      }
      if (dr.type === "hline" && Math.abs(y - P[0].y) < 6) return { d: dr, point: -1 };
      if (dr.type === "vline" && Math.abs(x - P[0].x) < 6) return { d: dr, point: -1 };
      if ((dr.type === "trend" || dr.type === "ray") && dSeg(x, y, P[0].x, P[0].y, P[1].x, P[1].y) < 7) return { d: dr, point: -1 };
      if (dr.type === "rect") {
        const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x), y1 = Math.min(P[0].y, P[1].y), y2 = Math.max(P[0].y, P[1].y);
        const n = (a, b) => Math.abs(a - b) < 6;
        if ((x >= x1 - 6 && x <= x2 + 6 && (n(y, y1) || n(y, y2))) || (y >= y1 - 6 && y <= y2 + 6 && (n(x, x1) || n(x, x2)))) return { d: dr, point: -1 };
      }
      if (dr.type === "fib") {
        const x1 = Math.min(P[0].x, P[1].x);
        for (const f of FIBS) { const yy = toY(dr.pts[0].p + (dr.pts[1].p - dr.pts[0].p) * f); if (yy != null && Math.abs(y - yy) < 6 && x >= x1 - 6) return { d: dr, point: -1 }; }
      }
    }
    return null;
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const rel = (e) => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e) => {
      if (e.button !== 0) return;
      const st = stRef.current, { x, y } = rel(e), l = fromX(x), p = fromY(y);
      if (l == null || p == null) return;
      if (st.tool === "cursor") {
        const h = hit(x, y); st.setSelected(h ? h.d.id : null);
        if (h) {
          e.stopPropagation(); e.preventDefault();
          st.onSnapshot && st.onSnapshot();
          dragRef.current = { mode: h.point >= 0 ? "point" : "move", id: h.d.id, pointIdx: h.point, start: { l, p }, orig: JSON.parse(JSON.stringify(h.d.pts)) };
        }
        paint(); return;
      }
      e.stopPropagation(); e.preventDefault();
      const single = st.tool === "hline" || st.tool === "vline";
      st.onSnapshot && st.onSnapshot();
      const mk = (li, pr) => ({ l: li, p: pr, ts: logicalToTs(li) });
      const base = { id: uid(), type: st.tool, color: st.color, market: st.market,
                     pts: single ? [mk(l, p)] : [mk(l, p), mk(l, p)] };
      if (single) { st.onDrawings([...(st.drawings || []), base]); st.setTool("cursor"); st.setSelected(base.id); return; }
      dragRef.current = { mode: "new", preview: base };
    };
    const move = (e) => {
      const st = stRef.current, { x, y } = rel(e), drag = dragRef.current;
      if (!drag) {
        if (st.tool === "cursor") { const h = hit(x, y); const id = h ? h.d.id : null; if (id !== hovRef.current) { hovRef.current = id; box.style.cursor = id ? "move" : "default"; paint(); } }
        else box.style.cursor = "crosshair";
        return;
      }
      e.stopPropagation(); e.preventDefault();
      const l = fromX(x), p = fromY(y);
      if (l == null || p == null) return;
      if (drag.mode === "new") { drag.preview.pts[1] = { l, p, ts: logicalToTs(l) }; paint(); }
      else {
        st.onDrawings((st.drawings || []).map((dr) => {
          if (dr.id !== drag.id) return dr;
          if (drag.mode === "point") return { ...dr, pts: dr.pts.map((q, i) => (i === drag.pointIdx ? { l, p, ts: logicalToTs(l) } : q)) };
          const dl = l - drag.start.l, dp = p - drag.start.p;
          return { ...dr, pts: drag.orig.map((q) => {
            const nl = (q.ts != null ? tsToLogical(q.ts) : q.l) + dl;
            return { l: nl, p: q.p + dp, ts: logicalToTs(nl) };
          }) };
        }));
      }
    };
    const up = () => {
      const st = stRef.current, drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === "new") {
        const dr = drag.preview;
        const moved = Math.abs(dr.pts[1].l - dr.pts[0].l) > .4 || Math.abs(dr.pts[1].p - dr.pts[0].p) > 1e-9;
        dragRef.current = null;
        if (moved && dr.type !== "measure") { st.onDrawings([...(st.drawings || []), dr]); st.setTool("cursor"); st.setSelected(dr.id); }
        else if (moved) { dragRef.current = { preview: dr }; paint(); setTimeout(() => { if (dragRef.current?.preview === dr) { dragRef.current = null; paint(); } }, 2800); }
        else paint();
        return;
      }
      dragRef.current = null; paint();
    };
    const leave = () => { if (hovRef.current) { hovRef.current = null; paint(); } };
    box.addEventListener("mousedown", down, true);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", up, true);
    box.addEventListener("mouseleave", leave);
    return () => { box.removeEventListener("mousedown", down, true); window.removeEventListener("mousemove", move, true); window.removeEventListener("mouseup", up, true); box.removeEventListener("mouseleave", leave); };
  }, [lwc, paint]);

  useEffect(() => {
    const key = (e) => {
      const tg = document.activeElement?.tagName;
      if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA") return;
      const st = stRef.current;
      if (e.key === "Escape") { st.setTool("cursor"); st.setSelected(null); dragRef.current = null; paint(); }
      if ((e.key === "Delete" || e.key === "Backspace") && st.selected) { e.preventDefault(); st.onDrawings((st.drawings || []).filter((d) => d.id !== st.selected)); st.setSelected(null); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [paint]);

  if (lwc === "loading") return <div style={{ height, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 12 }}>Loading chart engine…</div>;
  if (lwc === "failed") return (
    <div style={{ height, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Chart engine didn't load</div>
        <div style={{ color: "var(--muted)", fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>Lightweight Charts couldn't be fetched from any CDN. The rest of the workspace still works.</div></div>
    </div>
  );
  return (
    <div className="pc-chart" style={{ height }}>
      <div ref={boxRef} style={{ width: "100%", height: "100%" }} />
      <canvas ref={ovRef} className="pc-ov" />
    </div>
  );
}

/* ============================================================
   ROOT
   ============================================================ */
export default function PipTest() {
  const [booted, setBooted] = useState(false);
  const [handle, setHandle] = useState("");
  const [draft, setDraft] = useState("");
  const [theme, setTheme] = useState("light");
  const [view, setView] = useState("dashboard");
  const [index, setIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const t = THEMES[theme];
  const vars = useMemo(() => { const o = {}; Object.entries(t).forEach(([k, v]) => (o[`--${k}`] = v)); return o; }, [t]);

  useEffect(() => {
    (async () => {
      if (store.ok()) {
        const p = await store.get("profile", false);
        if (p?.handle) setHandle(p.handle);
        if (p?.theme) setTheme(p.theme);
        const ix = await store.get("bt:index", false);
        if (Array.isArray(ix)) setIndex(ix);
      }
      setBooted(true);
    })();
  }, []);

  const saveProf = useCallback(async (patch) => {
    if (!store.ok()) return;
    const p = (await store.get("profile", false)) || {};
    await store.set("profile", { ...p, ...patch }, false);
  }, []);
  const toggleTheme = () => { const n = theme === "light" ? "dark" : "light"; setTheme(n); saveProf({ theme: n }); };
  const writeIndex = useCallback(async (n) => { setIndex(n); if (store.ok()) await store.set("bt:index", n, false); }, []);

  const createSession = async (cfg) => {
    const id = uid();
    const meta = { id, ...cfg, createdAt: Date.now(), updatedAt: Date.now(), stats: computeStats([]) };
    if (store.ok()) await store.set(`bt:${id}`, { id, cursor: 100, trades: [], trade: null, drawings: [], journal: "" }, false);
    await writeIndex([meta, ...index]);
    setActiveId(id); setView("workspace");
  };
  const deleteSession = async (id) => {
    await writeIndex(index.filter((s) => s.id !== id));
    if (store.ok()) await store.del(`bt:${id}`, false);
    if (activeId === id) { setActiveId(null); setView("dashboard"); }
  };
  const updateMeta = useCallback((id, patch) => {
    setIndex((prev) => { const n = prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)); if (store.ok()) store.set("bt:index", n, false); return n; });
  }, []);

  if (!booted) return <div className="pc" style={{ ...vars, padding: 30 }}><style>{CSS}</style><span className="pc-cap">Loading</span></div>;

  if (!handle) {
    return (
      <div className="pc" style={{ ...vars, display: "grid", placeItems: "center", padding: 24 }}>
        <style>{CSS}</style>
        <div className="pc-card" style={{ padding: 30, maxWidth: 380, width: "100%" }}>
          <Logo />
          <h1 className="pc-h1" style={{ margin: "18px 0 6px" }}>Choose a handle</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 18px" }}>
            It identifies you in shared rooms and tags the drawings you place on a chart.
          </p>
          <input className="pc-in" value={draft} maxLength={18} placeholder="josh_pe"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && draft.trim() && (setHandle(draft.trim()), saveProf({ handle: draft.trim() }))} />
          <button className="pc-btn pri" style={{ width: "100%", marginTop: 12, justifyContent: "center", padding: 10 }}
            onClick={() => { const h = draft.trim().slice(0, 18); if (h) { setHandle(h); saveProf({ handle: h }); } }}>Continue</button>
        </div>
      </div>
    );
  }

  const active = index.find((s) => s.id === activeId) || null;

  return (
    <div className="pc" style={vars}>
      <style>{CSS}</style>
      {view === "dashboard" || !active ? (
        <Dashboard index={index} theme={theme} onToggleTheme={toggleTheme} handle={handle}
          onOpen={(id) => { setActiveId(id); setView("workspace"); }} onDelete={deleteSession} onCreate={createSession} />
      ) : (
        <Workspace key={active.id} meta={active} handle={handle} theme={theme} onToggleTheme={toggleTheme}
          onUpdateMeta={updateMeta} onBack={() => setView("dashboard")} />
      )}
    </div>
  );
}

const Logo = ({ size = 20 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="1" y="1" width="18" height="18" rx="5" fill="var(--accent)" />
      <path d="M5 13.2l3.1-4.1 2.4 2.4L15 6.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-.01em" }}>PIPTEST</span>
  </div>
);

/* ============================================================
   DASHBOARD
   ============================================================ */
function Dashboard({ index, onOpen, onDelete, onCreate, theme, onToggleTheme, handle }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIv] = useState("15m");
  const [date, setDate] = useState("2025-03-13");
  const [time, setTime] = useState("10:00");

  const agg = useMemo(() => {
    const count = index.reduce((n, s) => n + (s.stats?.count || 0), 0);
    const wins = index.reduce((n, s) => n + (s.stats?.wins || 0), 0);
    const net = index.reduce((n, s) => n + (s.stats?.net || 0), 0);
    const rSum = index.reduce((n, s) => n + (s.stats?.avgR || 0) * (s.stats?.count || 0), 0);
    let gw = 0, gl = 0;
    index.forEach((s) => { const st = s.stats; if (!st?.count) return; gw += (st.avgWin || 0) * st.wins; gl += (st.avgLoss || 0) * st.losses; });
    const curve = index.slice().sort((a, b) => a.createdAt - b.createdAt).reduce((a, s) => { a.push(a[a.length - 1] + (s.stats?.net || 0)); return a; }, [START_BALANCE]);
    return { count, wins, net, pf: gl > 0 ? gw / gl : null, avgR: count ? rSum / count : 0, winRate: count ? (wins / count) * 100 : 0, curve };
  }, [index]);

  return (
    <div>
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px", height: 56, borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <Logo />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="pc-sm" style={{ color: "var(--muted)", marginRight: 6 }}>@{handle}</span>
          <button className="pc-icon" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme"><Svg>{theme === "light" ? Ic.moon : Ic.sun}</Svg></button>
          <button className="pc-btn pri" onClick={() => setOpen((o) => !o)}><Svg s={14}>{Ic.plus}</Svg>New session</button>
        </div>
      </header>

      <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
        <h1 className="pc-h1" style={{ marginBottom: 4 }}>Backtesting dashboard</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 18px" }}>Every saved session, and how they add up.</p>

        <div className="pc-card" style={{ padding: 18, marginBottom: 12, display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="pc-cap" style={{ marginBottom: 6 }}>Net across sessions</div>
            <div className="pc-num" style={{ fontSize: 30, fontWeight: 600, color: agg.net >= 0 ? "var(--up)" : "var(--down)" }}>
              {agg.count ? fmtSigned(agg.net) : "$0.00"}
            </div>
          </div>
          {[["Sessions", index.length], ["Trades", agg.count], ["Win rate", `${agg.winRate.toFixed(1)}%`],
            ["Profit factor", agg.pf == null ? "—" : agg.pf.toFixed(2)], ["Avg R", agg.count ? fmtR(agg.avgR) : "—"]].map(([l, v]) => (
            <div key={l}>
              <div className="pc-cap" style={{ marginBottom: 6 }}>{l}</div>
              <div className="pc-num" style={{ fontSize: 20, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
          <div style={{ flex: 1, minWidth: 180 }}><Spark curve={agg.curve} h={46} /></div>
        </div>

        {open && (
          <div className="pc-card" style={{ padding: 18, marginBottom: 18 }}>
            <div className="pc-h2" style={{ marginBottom: 14 }}>New backtest session</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
              <Lbl t="Name"><input className="pc-in" value={name} placeholder="London open sweep" onChange={(e) => setName(e.target.value)} /></Lbl>
              <Lbl t="Instrument"><select className="pc-in" value={symbol} onChange={(e) => setSymbol(e.target.value)}>{SYMBOLS.map((s) => <option key={s}>{s}</option>)}</select></Lbl>
              <Lbl t="Timeframe"><select className="pc-in" value={interval} onChange={(e) => setIv(e.target.value)}>{INTERVALS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></Lbl>
              <Lbl t="Start date (UTC)"><input className="pc-in" type="date" value={date} min="2022-01-01" max="2026-07-31" onChange={(e) => setDate(e.target.value)} /></Lbl>
              <Lbl t="Start time"><input className="pc-in" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Lbl>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="pc-btn pri" onClick={() => {
                const startMs = Date.parse(`${date}T${time}:00Z`);
                if (startMs) { onCreate({ name: name.trim() || `${symbol} ${interval} · ${date}`, symbol, interval, startMs }); setOpen(false); setName(""); }
              }}>Create session</button>
              <button className="pc-btn" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="pc-cap" style={{ marginBottom: 10 }}>Saved sessions</div>
        {index.length === 0 ? (
          <div className="pc-card" style={{ padding: 34, textAlign: "center" }}>
            <div className="pc-h2" style={{ marginBottom: 6 }}>No sessions yet</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Create one to load historical bars and start replaying.</div>
            <button className="pc-btn pri" onClick={() => setOpen(true)}>New session</button>
          </div>
        ) : (
          <div className="pc-tiles">
            {index.map((s) => {
              const st = s.stats || {};
              return (
                <div key={s.id} className="pc-card pc-tile" style={{ padding: 15 }} onClick={() => onOpen(s.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div className="pc-sm" style={{ color: "var(--muted)", marginTop: 3 }}>{s.symbol} · {s.interval} · {fmtDate(s.startMs)}</div>
                    </div>
                    <button className="pc-btn pc-del" style={{ padding: "3px 8px", fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${s.name}"?`)) onDelete(s.id); }}>Delete</button>
                  </div>
                  <div style={{ margin: "12px 0 10px" }}><Spark curve={st.curve} h={40} /></div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span className="pc-num" style={{ fontSize: 18, fontWeight: 600, color: !st.count ? "var(--dim)" : st.net > 0 ? "var(--up)" : st.net < 0 ? "var(--down)" : "var(--muted)" }}>{st.count ? fmtSigned(st.net) : "—"}</span>
                    <span className="pc-sm" style={{ color: "var(--muted)" }}>{st.count || 0} trades · {st.count ? `${st.winRate.toFixed(0)}% win` : "not started"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
const Lbl = ({ t, children }) => (<label style={{ display: "block" }}><span className="pc-cap" style={{ display: "block", marginBottom: 5 }}>{t}</span>{children}</label>);

/* ============================================================
   WORKSPACE
   ============================================================ */
function Workspace({ meta, handle, theme, onToggleTheme, onUpdateMeta, onBack }) {
  const [symbol, setSymbol] = useState(meta.symbol);
  const [interval, setIv] = useState(meta.interval);
  const barMs = INTERVALS.find((i) => i.id === interval)?.ms || 60000;

  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [synthetic, setSynthetic] = useState(false);
  const [endOfData, setEndOfData] = useState(false);
  const fetchingRef = useRef(false);
  const anchorRef = useRef(null);
  const [cursor, setCursor] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState("saved");

  /* trade + setup */
  const [trade, setTrade] = useState(null);   // {dir, entry, stop, target, riskPct, qty, riskAmt, status, fromLogical}
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState({ dir: "long", entry: "", stop: "", target: "", riskPct: "1.0" });
  const [formError, setFormError] = useState("");
  const [notes, setNotes] = useState("");
  const [journal, setJournal] = useState("");
  const [blotTab, setBlotTab] = useState("trades");

  /* chart tools */
  const [tool, setTool] = useState("cursor");
  const [color, setColor] = useState("accent");
  const [selected, setSelected] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [indicators, setIndicators] = useState({ volume: true, ema20: false, ema50: false, sma200: false });
  const [indOpen, setIndOpen] = useState(false);
  const [logScale, setLog] = useState(false);
  const [zoom, setZoom] = useState(120);
  const undoRef = useRef([]); const redoRef = useRef([]);

  /* close popovers on Escape or an outside click */
  useEffect(() => {
    const away = (e) => { if (!e.target.closest?.("[data-pop]")) { setIndOpen(false); setRoomOpen(false); } };
    const esc = (e) => { if (e.key === "Escape") { setIndOpen(false); setRoomOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);

  /* market watch */
  const [tickers, setTickers] = useState([]);
  const [mktQuery, setMktQuery] = useState("");

  /* room */
  const [room, setRoom] = useState(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomMsg, setRoomMsg] = useState("");

  const role = room ? room.participants?.[handle]?.role || "viewer" : "host";
  const canControl = !room || role === "host" || role === "editor";
  const isHost = room && room.participants?.[handle]?.role === "host";

  const cur = bars[Math.min(cursor, bars.length - 1)] || null;
  const prevBar = bars[Math.min(cursor, bars.length - 1) - 1] || null;
  const price = cur?.c ?? null;
  const stats = useMemo(() => computeStats(trades), [trades]);
  const equity = stats.equity;
  const openPnl = trade?.status === "open" && price ? (price - trade.entry) * trade.qty * (trade.dir === "long" ? 1 : -1) : 0;
  const chg = cur && prevBar ? cur.c - prevBar.c : 0;
  const chgPct = cur && prevBar ? (chg / prevBar.c) * 100 : 0;

  /* undo snapshots are taken on gesture START (see snapshotDrawings), never on
     every mousemove — otherwise one drag fills the whole stack */
  const applyDrawings = useCallback((next) => {
    setDrawings((prev) => (typeof next === "function" ? next(prev) : next));
  }, []);
  const snapshotDrawings = useCallback(() => {
    setDrawings((prev) => { undoRef.current.push(prev); if (undoRef.current.length > 60) undoRef.current.shift(); redoRef.current = []; return prev; });
  }, []);
  const undo = () => { const p = undoRef.current.pop(); if (p) { redoRef.current.push(drawings); setDrawings(p); setSelected(null); } };
  const redo = () => { const n = redoRef.current.pop(); if (n) { undoRef.current.push(drawings); setDrawings(n); } };

  /* restore */
  useEffect(() => {
    (async () => {
      if (store.ok()) {
        const b = await store.get(`bt:${meta.id}`, false);
        if (b) {
          setCursor(b.cursor ?? 100); setTrades(b.trades || []); setTrade(b.trade || null);
          setDrawings(b.drawings || []); setJournal(b.journal || ""); setNotes(b.notes || "");
          if (b.indicators) setIndicators(b.indicators);
        }
      }
      setRestored(true);
    })();
  }, [meta.id]);

  /* market watch prices */
  useEffect(() => {
    let alive = true;
    (async () => { const tk = await fetchTickers(SYMBOLS); if (alive && tk) setTickers(tk); })();
    const id = setInterval(async () => { const tk = await fetchTickers(SYMBOLS); if (alive && tk) setTickers(tk); }, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  /* load bars */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setEndOfData(false); fetchingRef.current = false;
      /* Load WARMUP bars BEFORE the session start. Without this, every
         timeframe begins at the same instant, so a 1h chart has only a
         couple of bars behind the anchor while a 1s chart has thousands —
         which is why coming back from 1s used to show ~2 candles. */
      const iv = barMsOf(interval);
      const wu = warmupBars(interval);
      const from = meta.startMs - wu * iv;
      const real = await fetchKlinesPaged(symbol, interval, from, wu + FORWARD_BARS);
      if (!alive) return;
      const isReal = real && real.length > 20;
      const next = isReal ? real : syntheticKlines(symbol, interval, from, wu + FORWARD_BARS);
      setSynthetic(!isReal);
      setBars(next);

      /* find the bar nearest a given timestamp */
      const nearest = (ts) => {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < next.length; i++) {
          const d = Math.abs(next[i].t - ts);
          if (d < bestD) { bestD = d; best = i; }
          if (next[i].t > ts) break;
        }
        return best;
      };
      /* anchor to the same MOMENT when switching market or timeframe,
         otherwise open at the session start date */
      const anchor = anchorRef.current;
      let idx = nearest(anchor || meta.startMs);
      anchorRef.current = null;
      /* always leave some context on screen */
      idx = Math.max(Math.min(20, next.length - 1), Math.min(idx, next.length - 1));
      setCursor(idx);
      checkedRef.current = idx;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [symbol, interval, meta.startMs]);

  /* the only sanctioned way to change market or timeframe */
  const switchMarket = (nextSymbol, nextInterval) => {
    const changingSym = nextSymbol && nextSymbol !== symbol;
    const changingIv = nextInterval && nextInterval !== interval;
    if (!changingSym && !changingIv) return;
    if (trade && !confirm(
      trade.status === "open"
        ? "You have an open position. Switching will close it at the current price. Continue?"
        : "You have a working order. Switching will cancel it. Continue?"
    )) return;
    if (trade?.status === "open" && price) closeTrade(price, "market switch");
    else if (trade) setTrade(null);
    /* stale prices from another instrument must never carry over */
    setForm((f) => ({ ...f, entry: "", stop: "", target: "" }));
    setFormError("");
    anchorRef.current = cur?.t ?? null;
    if (changingSym) setSymbol(nextSymbol);
    if (changingIv) setIv(nextInterval);
  };

  useEffect(() => {
    if (loading || endOfData || fetchingRef.current) return;
    if (!bars.length || cursor < bars.length - 120) return;
    fetchingRef.current = true;
    let alive = true;
    (async () => {
      const ns = bars[bars.length - 1].t + barMsOf(interval);
      const more = synthetic ? null : await fetchKlines(symbol, interval, ns);
      if (!alive) { fetchingRef.current = false; return; }
      /* if the exchange has no more bars, STOP. Never invent history. */
      if (!more || !more.length) setEndOfData(true);
      else setBars((b) => (b[b.length - 1].t >= more[0].t ? b : [...b, ...more]));
      fetchingRef.current = false;
    })();
    return () => { alive = false; };
  }, [cursor, bars, loading, synthetic, symbol, interval, barMs, endOfData]);

  /* replay clock */
  const rafRef = useRef(0), accRef = useRef(0), lastRef = useRef(0);
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); lastRef.current = 0; return; }
    const tick = (now) => {
      if (!lastRef.current) lastRef.current = now;
      accRef.current += now - lastRef.current; lastRef.current = now;
      const per = 1000 / speed;
      let steps = 0;
      while (accRef.current >= per && steps < 40) { accRef.current -= per; steps++; }
      if (steps) setCursor((c) => {
        const next = Math.min(c + steps, bars.length - 1);
        if (next >= bars.length - 1 && endOfData) setPlaying(false);
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, bars.length, endOfData]);

  /* fill / stop / target engine.
     Walks EVERY bar between the last checked index and the cursor, so fast
     playback and scrubbing produce the same result as stepping one bar at a
     time. Never calls a setter from inside another setter's updater. */
  const checkedRef = useRef(-1);
  const tradeRef = useRef(null);
  useEffect(() => { tradeRef.current = trade; }, [trade]);

  const bookTrade = useCallback((tr, exit, reason, at) => ({
    id: uid(), symbol: tr.market ? tr.market.split("|")[0] : symbol, interval,
    dir: tr.dir, qty: tr.qty, entry: tr.entry, exit, stop: tr.stop, target: tr.target,
    riskAmt: tr.riskAmt, pnl: (exit - tr.entry) * tr.qty * (tr.dir === "long" ? 1 : -1),
    reason, at, closedAt: Date.now(),
  }), [symbol, interval]);

  useEffect(() => {
    if (!bars.length) return;
    const from = checkedRef.current;
    if (cursor <= from) { checkedRef.current = cursor; return; }
    let t = tradeRef.current;
    if (!t) { checkedRef.current = cursor; return; }

    const closed = [];
    for (let i = from + 1; i <= cursor && t; i++) {
      const b = bars[i];
      if (!b) break;
      if (t.status === "watching") {
        if (b.l <= t.entry && b.h >= t.entry) t = { ...t, status: "open", filledAt: b.t, entryBar: i };
        else continue;
      }
      if (t.status === "open") {
        const long = t.dir === "long";
        const hitStop = long ? b.l <= t.stop : b.h >= t.stop;
        const hitTgt = t.target != null && (long ? b.h >= t.target : b.l <= t.target);
        if (hitStop || hitTgt) {
          /* both touched in one bar: assume the stop, since intrabar order is unknowable */
          const exit = hitStop ? t.stop : t.target;
          const rec = bookTrade(t, exit, hitStop && hitTgt ? "stop (both touched)" : hitStop ? "stop" : "target", b.t);
          closed.push({ ...rec, r: t.riskAmt ? rec.pnl / t.riskAmt : 0 });
          t = null;
        }
      }
    }
    checkedRef.current = cursor;
    if (closed.length) setTrades((list) => [...closed.reverse(), ...list]);
    if (t !== tradeRef.current) setTrade(t);
  }, [cursor, bars, bookTrade]);

  const closeTrade = (exit, reason) => {
    const tr = tradeRef.current;
    if (!tr || !exit) return;
    const rec = bookTrade(tr, exit, reason, cur?.t);
    setTrades((list) => [{ ...rec, r: tr.riskAmt ? rec.pnl / tr.riskAmt : 0 }, ...list]);
    setTrade(null);
  };

  /* an empty entry field means "use the current price" — the placeholder said so */
  const entryVal = parseFloat(form.entry) || price || 0;
  const rr = useMemo(() => {
    const s = parseFloat(form.stop), tg = parseFloat(form.target);
    if (!entryVal || !s || !tg) return null;
    const risk = Math.abs(entryVal - s), rew = Math.abs(tg - entryVal);
    return risk > 0 ? rew / risk : null;
  }, [entryVal, form.stop, form.target]);

  const setupErrors = useMemo(() => {
    if (trade || !form.stop) return [];
    return validateSetup({ dir: form.dir, entry: entryVal, stop: form.stop, target: form.target, riskPct: form.riskPct, equity, price });
  }, [trade, form, entryVal, equity, price]);

  const armSetup = (immediate) => {
    const e = immediate ? price : entryVal;
    const errs = validateSetup({ dir: form.dir, entry: e, stop: form.stop, target: form.target, riskPct: form.riskPct, equity, price });
    if (errs.length) { setFormError(errs[0]); return; }
    setFormError("");
    const s = parseFloat(form.stop), tg = parseFloat(form.target), rp = parseFloat(form.riskPct);
    const riskAmt = equity * (rp / 100);
    setTrade({
      dir: form.dir, entry: e, stop: s, target: Number.isNaN(tg) ? null : tg, riskPct: rp,
      qty: +(riskAmt / Math.abs(e - s)).toFixed(6), riskAmt,
      status: immediate ? "open" : "watching", fromLogical: cursor, entryBar: cursor,
      market: `${symbol}|${interval}`,
    });
  };

  const fillForm = () => setForm((f) => ({ ...f, entry: price ? price.toFixed(dec(price)) : "" }));

  /* autosave */
  const saveT = useRef(null);
  useEffect(() => {
    if (!restored || !store.ok()) return;
    setSaveState("saving");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      const ok = await store.set(`bt:${meta.id}`, { id: meta.id, cursor, trades, trade, drawings, journal, notes, indicators }, false);
      const st = computeStats(trades);
      onUpdateMeta(meta.id, { symbol, interval, stats: { count: st.count, wins: st.wins, losses: st.losses, net: st.net, winRate: st.winRate, avgWin: st.avgWin, avgLoss: st.avgLoss, avgR: st.avgR, maxDD: st.maxDD, curve: st.curve.slice(-60) } });
      setSaveState(ok ? "saved" : "failed");
    }, 1200);
    return () => clearTimeout(saveT.current);
  }, [trades, trade, cursor, drawings, journal, notes, indicators, symbol, interval, restored]); // eslint-disable-line

  /* room sync */
  const pushRef = useRef(0), appRef = useRef(0);
  const pushRoom = useCallback(async (extra = {}) => {
    if (!room || !canControl || !SHARED_ENABLED) return;
    const now = Date.now();
    if (!extra.force && now - pushRef.current < 700) return;
    pushRef.current = now;
    const doc = { ...room, symbol, interval, cursor, playing, speed, drawings, updatedBy: handle, updatedAt: now, ...extra };
    delete doc.force; setRoom(doc);
    await store.set(`room:${room.code}`, doc, true);
  }, [room, canControl, symbol, interval, cursor, playing, speed, drawings, handle]);

  useEffect(() => { if (room && canControl) pushRoom(); }, [cursor, playing, speed, drawings, symbol, interval]); // eslint-disable-line

  useEffect(() => {
    if (!room?.code || !SHARED_ENABLED) return;
    let alive = true;
    const poll = async () => {
      const doc = await store.get(`room:${room.code}`, true);
      if (!alive || !doc) return;
      if (doc.updatedBy === handle || (doc.updatedAt || 0) <= appRef.current) { setRoom((r) => ({ ...r, participants: doc.participants })); return; }
      appRef.current = doc.updatedAt || 0;
      setRoom(doc);
      if (doc.symbol !== symbol) setSymbol(doc.symbol);
      if (doc.interval !== interval) setIv(doc.interval);
      setSpeed(doc.speed); setPlaying(doc.playing);
      setCursor((c) => (Math.abs(c - doc.cursor) > 3 ? doc.cursor : c));
      if (Array.isArray(doc.drawings)) setDrawings(doc.drawings);
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [room?.code, handle]); // eslint-disable-line

  const hostRoom = async () => {
    if (!SHARED_ENABLED) { setRoomMsg("Live rooms need the sync backend. Set VITE_API_URL and redeploy."); return; }
    const code = makeCode();
    const doc = { code, host: handle, symbol, interval, startMs: meta.startMs, participants: { [handle]: { role: "host", ts: Date.now() } }, drawings, cursor, playing: false, speed, updatedBy: handle, updatedAt: Date.now() };
    if (!(await store.set(`room:${code}`, doc, true))) { setRoomMsg("Couldn't open the room."); return; }
    setRoom(doc); setRoomMsg(`Room ${code} is open — guests join as viewers.`);
  };
  const joinRoom = async () => {
    setRoomMsg("");
    const code = joinCode.trim().toUpperCase();
    if (!code) { setRoomMsg("Enter a room code first."); return; }
    if (code.length !== 6) { setRoomMsg(`"${code}" is ${code.length} characters — room codes are 6.`); return; }
    setRoomMsg("Looking for that room…");
    if (!SHARED_ENABLED) { setRoomMsg("Live rooms need the sync backend. Set VITE_API_URL and redeploy."); return; }
    const doc = await store.get(`room:${code}`, true);
    if (!doc) { setRoomMsg(`No open room found for ${code}. Check the code with whoever is hosting.`); return; }
    if (doc.startMs !== meta.startMs) { setRoomMsg(`That room starts ${fmtDate(doc.startMs)}. Open a session with that start date to follow.`); return; }
    doc.participants = { ...doc.participants, [handle]: { role: doc.participants?.[handle]?.role || "viewer", ts: Date.now() } };
    await store.set(`room:${code}`, doc, true);
    appRef.current = 0; setRoom(doc); setRoomMsg(`Joined ${code} as viewer.`);
  };
  const leaveRoom = async () => {
    if (room && store.ok()) { const d = await store.get(`room:${room.code}`, true); if (d?.participants) { delete d.participants[handle]; await store.set(`room:${room.code}`, d, true); } }
    setRoom(null); setRoomMsg("");
  };
  const setRole = async (who, r) => {
    if (!isHost) return;
    const d = await store.get(`room:${room.code}`, true);
    if (!d) return;
    d.participants[who] = { ...d.participants[who], role: r }; d.updatedBy = handle; d.updatedAt = Date.now();
    await store.set(`room:${room.code}`, d, true); setRoom(d);
  };

  const curMarket = symbol;
  const mine = drawings.filter((d) => !d.market || d.market === curMarket);
  const visibleDrawings = mine.length;
  /* a drawing whose whole time span sits outside the loaded bars can't be seen
     on this timeframe — say so rather than letting it look broken */
  const offRange = (!bars.length ? 0 : mine.filter((d) => {
    const ts = d.pts.map((q) => q.ts).filter((x) => x != null);
    if (!ts.length) return false;
    return Math.max(...ts) < bars[0].t || Math.min(...ts) > bars[bars.length - 1].t;
  }).length);
  const marketList = tickers.length ? tickers : SYMBOLS.map((s) => ({ symbol: s, price: BASE_PX[s], chg: 0 }));
  const filtered = marketList.filter((m) => m.symbol.toLowerCase().includes(mktQuery.toLowerCase()));

  return (
    <div>
      {/* ============ TOP BAR ============ */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", height: 56, borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} title="Back to dashboard"><Logo /></button>

        <select className="pc-in" style={{ width: "auto", fontWeight: 600, minWidth: 120 }} value={symbol}
          disabled={!canControl} onChange={(e) => switchMarket(e.target.value, null)}>
          {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
        </select>

        <span className="pc-num" style={{ fontSize: 17, fontWeight: 600 }}>{fmtPrice(price)}</span>
        <span className="pc-num pc-sm" style={{ color: chg >= 0 ? "var(--up)" : "var(--down)", fontWeight: 500 }}>
          {chg >= 0 ? "+" : "−"}{fmtPrice(Math.abs(chg))} ({chgPct >= 0 ? "+" : "−"}{Math.abs(chgPct).toFixed(2)}%)
        </span>
        <span className="pc-sm" style={{ color: "var(--muted)" }}>{cur ? fmtClock(cur.t, interval) : ""}</span>
        {synthetic && <span className="pc-pill" style={{ background: "var(--accentSoft)", color: "var(--accent)" }}>simulated data</span>}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span className="pc-sm" style={{ color: saveState === "failed" ? "var(--down)" : "var(--dim)" }}>
            {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed — storage may be full" : "Saved"}
          </span>
          <span data-pop><button className={"pc-icon" + (roomOpen ? " on" : "")} onClick={() => setRoomOpen((o) => !o)} title="Live room" aria-label="Live room"><Svg>{Ic.users}</Svg></button></span>
          {room && <span className="pc-pill pc-live" style={{ background: "var(--accentSoft)", color: "var(--accent)" }}>● {room.code}</span>}
          <button className="pc-icon" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme"><Svg>{theme === "light" ? Ic.moon : Ic.sun}</Svg></button>
          <button className="pc-icon" onClick={onBack} title="Dashboard" aria-label="Dashboard"><Svg>{Ic.grid}</Svg></button>
          <button className={"pc-btn " + (playing ? "" : "pri")} onClick={() => canControl && setPlaying((p) => !p)} disabled={!canControl}>
            <Svg s={14}>{playing ? Ic.pause : Ic.play}</Svg>{playing ? "Pause" : "Replay"}
          </button>
        </div>
      </header>

      {/* room popover */}
      {roomOpen && (
        <div className="pc-card" data-pop style={{ position: "absolute", right: 14, top: 60, zIndex: 40, padding: 14, width: 262 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="pc-cap">Live room</span>
            <button className="pc-icon" style={{ width: 24, height: 24 }} onClick={() => setRoomOpen(false)} aria-label="Close"><Svg s={13}>{Ic.close}</Svg></button>
          </div>
          {!room ? (
            <>
              <button className="pc-btn pri" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={hostRoom}>Share this chart</button>
              <Lbl t="Join with a code">
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="pc-in" value={joinCode} maxLength={6} placeholder="ABC123" onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
                  <button className="pc-btn" onClick={joinRoom}>Join</button>
                </div>
              </Lbl>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div><div className="pc-num" style={{ fontSize: 19, fontWeight: 700, letterSpacing: ".06em" }}>{room.code}</div>
                  <div className="pc-sm" style={{ color: "var(--muted)" }}>host {room.host}</div></div>
                <button className="pc-btn" onClick={leaveRoom}>Leave</button>
              </div>
              {Object.entries(room.participants || {}).map(([who, info]) => (
                <div key={who} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
                  <span className="pc-sm" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{who}{who === handle ? " (you)" : ""}</span>
                  <span className="pc-pill" style={{ background: info.role === "viewer" ? "var(--surface3)" : "var(--accentSoft)", color: info.role === "viewer" ? "var(--muted)" : "var(--accent)" }}>{info.role}</span>
                  {isHost && info.role !== "host" && (
                    <button className="pc-btn" style={{ padding: "2px 7px", fontSize: 11 }} onClick={() => setRole(who, info.role === "editor" ? "viewer" : "editor")}>
                      {info.role === "editor" ? "Revoke" : "Edit"}
                    </button>
                  )}
                </div>
              ))}
              <div className="pc-sm" style={{ color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>Playback and drawings sync to everyone in the room.</div>
            </>
          )}
          {roomMsg && <div className="pc-sm" style={{ color: "var(--accent)", marginTop: 10, lineHeight: 1.5 }}>{roomMsg}</div>}
        </div>
      )}

      {/* ============ TIMEFRAME STRIP ============ */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>
        {INTERVALS.map((i) => (
          <button key={i.id} className={"pc-tf" + (interval === i.id ? " on" : "")} disabled={!canControl} onClick={() => switchMarket(null, i.id)}>{i.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />
        <div style={{ position: "relative" }} data-pop>
          <button className="pc-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setIndOpen((o) => !o)}>
            Indicators <Svg s={13}>{Ic.chev}</Svg>
          </button>
          {indOpen && (
            <div className="pc-card" style={{ position: "absolute", top: 34, left: 0, zIndex: 30, padding: 6, width: 168 }}>
              {[{ id: "volume", label: "Volume" }, ...INDICATORS].map((ind) => (
                <button key={ind.id} className="pc-btn" style={{ width: "100%", justifyContent: "space-between", border: "none", background: "transparent", padding: "7px 9px" }}
                  onClick={() => setIndicators((s) => ({ ...s, [ind.id]: !s[ind.id] }))}>
                  {ind.label}
                  <span style={{ width: 15, height: 15, borderRadius: 4, border: "1px solid var(--border)", background: indicators[ind.id] ? "var(--accent)" : "transparent", display: "grid", placeItems: "center" }}>
                    {indicators[ind.id] && <svg width="9" height="9" viewBox="0 0 10 10"><path d="M1.5 5.2l2.2 2.2L8.5 2.6" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="pc-icon" onClick={undo} disabled={!canControl} title="Undo" aria-label="Undo"><Svg>{Ic.undo}</Svg></button>
        <button className="pc-icon" onClick={redo} disabled={!canControl} title="Redo" aria-label="Redo"><Svg>{Ic.redo}</Svg></button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          {ZOOMS.map((z) => <button key={z.l} className={"pc-tf" + (zoom === z.n ? " on" : "")} onClick={() => setZoom(z.n)}>{z.l}</button>)}
          <button className={"pc-tf" + (logScale ? " on" : "")} onClick={() => setLog((l) => !l)}>log</button>
        </div>
      </div>

      {/* ============ MAIN ============ */}
      <div style={{ padding: 12 }}>
        <div className="pc-main" style={{ marginBottom: 12 }}>
          {/* chart card */}
          <div className="pc-card" style={{ display: "flex", overflow: "hidden" }}>
            <div className="pc-rail">
              {TOOLS.map((tl) => (
                <button key={tl.id} className={"pc-tool" + (tool === tl.id ? " on" : "")} title={tl.title} aria-label={tl.title}
                  disabled={!canControl && tl.id !== "cursor"} onClick={() => { setTool(tl.id); if (tl.id !== "cursor") setSelected(null); }}>
                  <Svg>{tl.icon}</Svg>
                </button>
              ))}
              <div className="pc-railsep" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: "0 6px" }}>
                {PALETTE.map((c) => <button key={c} className={"pc-sw" + (color === c ? " on" : "")} style={{ background: `var(--${c})` }} onClick={() => setColor(c)} title={c} aria-label={`Colour ${c}`} />)}
              </div>
              <div className="pc-railsep" />
              <button className="pc-tool" title="Clear all drawings" aria-label="Clear drawings" disabled={!canControl || !visibleDrawings}
                onClick={() => { if (confirm(`Remove all drawings on ${symbol}?`)) { snapshotDrawings(); applyDrawings((prev) => prev.filter((d) => d.market && d.market !== curMarket)); setSelected(null); } }}><Svg>{Tl.trash}</Svg></button>
            </div>

            <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <div style={{ position: "absolute", top: 9, left: 12, zIndex: 5, pointerEvents: "none", fontSize: 12 }} className="pc-num">
                <span style={{ fontWeight: 600 }}>{symbol} · {INTERVALS.find((i) => i.id === interval)?.label} · PipTest</span>
                {cur && (
                  <span style={{ marginLeft: 10, color: "var(--muted)" }}>
                    O <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.o)}</b>{" "}
                    H <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.h)}</b>{" "}
                    L <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.l)}</b>{" "}
                    C <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.c)}</b>
                  </span>
                )}
              </div>
              {loading ? (
                <div style={{ height: 470, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 12 }}>Fetching {interval} bars…</div>
              ) : (
                <Chart bars={bars} cursor={cursor} theme={theme} interval={interval} symbol={symbol} trade={trade} height={470}
                  drawings={drawings} onDrawings={canControl ? applyDrawings : () => {}} onSnapshot={canControl ? snapshotDrawings : () => {}}
                  tool={canControl ? tool : "cursor"} setTool={setTool}
                  color={color} selected={selected} setSelected={setSelected} indicators={indicators} logScale={logScale} zoom={zoom} />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--dim)" }}>
                <span>{tool === "cursor"
                  ? (selected ? "Drag to move · handles to reshape · Delete to remove"
                    : `${visibleDrawings} drawing${visibleDrawings === 1 ? "" : "s"} on ${symbol}${offRange ? ` · ${offRange} outside this timeframe's date range` : ""}`)
                  : `${TOOLS.find((x) => x.id === tool)?.title} · drag on the chart · Esc to cancel`}</span>
                <span className="pc-num">bar {cursor + 1} / {bars.length}{!canControl && ` · view only, following ${room?.host}`}</span>
              </div>
            </div>
          </div>

          {/* setup panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="pc-card" style={{ padding: 14 }}>
              <div className="pc-cap" style={{ marginBottom: 10 }}>Setup</div>
              {trade ? (
                <>
                  <div className="pc-row"><span style={{ color: "var(--muted)" }}>Direction</span>
                    <span className="pc-pill" style={{ background: trade.dir === "long" ? "var(--upSoft)" : "var(--downSoft)", color: trade.dir === "long" ? "var(--up)" : "var(--down)" }}>{trade.dir === "long" ? "Long" : "Short"}</span></div>
                  <div className="pc-row"><span style={{ color: "var(--muted)" }}>Entry</span><span className="pc-num">{fmtPrice(trade.entry)}</span></div>
                  <div className="pc-row"><span style={{ color: "var(--muted)" }}>Stop loss</span><span className="pc-num">{fmtPrice(trade.stop)}</span></div>
                  <div className="pc-row"><span style={{ color: "var(--muted)" }}>Take profit</span><span className="pc-num">{trade.target ? fmtPrice(trade.target) : "—"}</span></div>
                  <div style={{ display: "flex", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ flex: 1 }}><div className="pc-cap" style={{ marginBottom: 3 }}>Risk</div><div className="pc-num" style={{ fontWeight: 600 }}>{trade.riskPct.toFixed(1)}%</div></div>
                    <div style={{ flex: 1 }}><div className="pc-cap" style={{ marginBottom: 3 }}>R:R</div><div className="pc-num" style={{ fontWeight: 600 }}>{trade.target ? (Math.abs(trade.target - trade.entry) / Math.abs(trade.entry - trade.stop)).toFixed(2) : "—"}</div></div>
                    <div style={{ flex: 1 }}><div className="pc-cap" style={{ marginBottom: 3 }}>Status</div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: trade.status === "open" ? "var(--up)" : "var(--accent)" }}>{trade.status === "open" ? "Open" : "Watching"}</div></div>
                  </div>
                  {trade.status === "open" && (
                    <div className="pc-row" style={{ borderTop: "1px solid var(--border)", marginTop: 8 }}>
                      <span style={{ color: "var(--muted)" }}>Open P&L</span>
                      <span className="pc-num" style={{ color: openPnl >= 0 ? "var(--up)" : "var(--down)", fontWeight: 600 }}>{fmtSigned(openPnl)} · {fmtR(trade.riskAmt ? openPnl / trade.riskAmt : 0)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {trade.status === "open" && <button className="pc-btn pri" style={{ flex: 1, justifyContent: "center" }} onClick={() => closeTrade(price, "manual")}>Close</button>}
                    <button className="pc-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => setTrade(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {["long", "short"].map((d) => (
                      <button key={d} className="pc-btn" style={{
                        flex: 1, justifyContent: "center",
                        background: form.dir === d ? (d === "long" ? "var(--upSoft)" : "var(--downSoft)") : "var(--surface)",
                        color: form.dir === d ? (d === "long" ? "var(--up)" : "var(--down)") : "var(--muted)",
                        borderColor: form.dir === d ? "transparent" : "var(--border)", fontWeight: 600,
                      }} onClick={() => setForm((f) => ({ ...f, dir: d }))}>{d === "long" ? "Long" : "Short"}</button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <Lbl t="Entry">
                      <div style={{ display: "flex", gap: 5 }}>
                        <input className="pc-in" value={form.entry} placeholder={price ? fmtPrice(price) : ""} onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
                        <button className="pc-btn" style={{ padding: "0 9px", fontSize: 11 }} onClick={fillForm} title="Use current price">Now</button>
                      </div>
                    </Lbl>
                    <Lbl t="Stop loss"><input className="pc-in" value={form.stop} placeholder="—" onChange={(e) => setForm((f) => ({ ...f, stop: e.target.value }))} /></Lbl>
                    <Lbl t="Take profit"><input className="pc-in" value={form.target} placeholder="—" onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} /></Lbl>
                    <Lbl t="Risk % of equity">
                      <input className="pc-in" type="number" min="0.01" max="100" step="0.1" value={form.riskPct}
                        onChange={(e) => setForm((f) => ({ ...f, riskPct: e.target.value }))} />
                    </Lbl>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 6, borderTop: "1px solid var(--border)", fontSize: 13 }}>
                    <span style={{ color: "var(--muted)" }}>R:R</span>
                    <span className="pc-num" style={{ fontWeight: 600 }}>{rr ? rr.toFixed(2) : "—"}</span>
                  </div>
                  {(setupErrors.length > 0 || formError) && (
                    <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", borderRadius: 7, padding: "8px 10px", marginBottom: 10 }}>
                      {(setupErrors.length ? setupErrors : [formError]).map((m, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--down)", lineHeight: 1.5 }}>{m}</div>
                      ))}
                    </div>
                  )}
                  {form.entry === "" && price && setupErrors.length === 0 && form.stop && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                      Entry blank — using the current price, {fmtPrice(price)}.
                    </div>
                  )}
                  <button className="pc-btn pri" style={{ width: "100%", justifyContent: "center", marginBottom: 6 }}
                    disabled={!form.stop || setupErrors.length > 0} onClick={() => armSetup(false)}>
                    <Svg s={14}>{Ic.plus}</Svg>Arm setup
                  </button>
                  <button className="pc-btn" style={{ width: "100%", justifyContent: "center" }}
                    disabled={!form.stop || !price || setupErrors.length > 0} onClick={() => armSetup(true)}>Enter at market</button>
                </>
              )}
            </div>

            <div className="pc-card" style={{ padding: 14 }}>
              <div className="pc-cap" style={{ marginBottom: 8 }}>Notes</div>
              <textarea className="pc-in" rows={6} value={notes} placeholder={"Bullish market structure\nLiquidity sweep of lows\nBreak of structure"}
                style={{ resize: "vertical", lineHeight: 1.7, fontSize: 12.5 }} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ============ BOTTOM ROW ============ */}
        <div className="pc-bottom">
          {/* market watch */}
          <div className="pc-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 14px 10px" }}>
              <div className="pc-h2" style={{ marginBottom: 10 }}>Market Watch</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 9, top: 8, color: "var(--dim)" }}><Svg s={15}>{Ic.search}</Svg></span>
                <input className="pc-in" style={{ paddingLeft: 30 }} placeholder="Search markets…" value={mktQuery} onChange={(e) => setMktQuery(e.target.value)} />
              </div>
            </div>
            <div className="pc-scroll" style={{ overflowY: "auto", maxHeight: 300, borderTop: "1px solid var(--border)" }}>
              {filtered.map((m) => (
                <button key={m.symbol} className={"pc-mkt" + (m.symbol === symbol ? " on" : "")} disabled={!canControl} onClick={() => switchMarket(m.symbol, null)}>
                  <span style={{ color: m.symbol === symbol ? "var(--accent)" : "var(--dim)" }}><Svg s={14}>{Ic.star}</Svg></span>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{m.symbol}</span>
                  <span className="pc-num pc-sm">{fmtPrice(m.price)}</span>
                  <span className="pc-num pc-sm" style={{ width: 54, textAlign: "right", color: m.chg >= 0 ? "var(--up)" : "var(--down)" }}>
                    {m.chg >= 0 ? "+" : ""}{m.chg.toFixed(2)}%
                  </span>
                </button>
              ))}
            </div>
            <div className="pc-sm" style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", color: "var(--dim)" }}>
              {tickers.length
                ? `Live prices right now — your chart is replaying ${cur ? fmtDate(cur.t) : fmtDate(meta.startMs)}, so these will not match`
                : "Live prices unavailable"}
            </div>
          </div>

          {/* replay + blotter */}
          <div className="pc-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: playing ? "var(--up)" : "var(--dim)" }} className={playing ? "pc-live" : ""} />
                Replay Mode
              </span>
              <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
                <button className="pc-icon" disabled={!canControl} onClick={() => setCursor(0)} title="To start"><Svg>{Ic.toStart}</Svg></button>
                <button className="pc-icon" disabled={!canControl} onClick={() => setCursor((c) => Math.max(0, c - 1))} title="Step back"><Svg>{Ic.stepBack}</Svg></button>
                <button className="pc-icon on" disabled={!canControl} onClick={() => setPlaying((p) => !p)} title={playing ? "Pause" : "Play"}><Svg>{playing ? Ic.pause : Ic.play}</Svg></button>
                <button className="pc-icon" disabled={!canControl} onClick={() => setCursor((c) => Math.min(bars.length - 1, c + 1))} title="Step forward"><Svg>{Ic.stepFwd}</Svg></button>
              </div>
              <select className="pc-in" style={{ width: 72 }} value={speed} disabled={!canControl} onChange={(e) => setSpeed(+e.target.value)}>
                {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
              </select>
              <span className="pc-num pc-sm" style={{ marginLeft: "auto", color: "var(--muted)" }}>{cur ? fmtClock(cur.t, interval) + " UTC" : ""}</span>
            </div>

            <div style={{ padding: "14px 16px 6px" }}>
              <input type="range" min={0} max={Math.max(0, bars.length - 1)} value={cursor} disabled={!canControl}
                onChange={(e) => setCursor(+e.target.value)} style={{ width: "100%", accentColor: THEMES[theme].accent }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: "var(--dim)" }} className="pc-num">
                {bars.length > 1 && (() => {
                  const spanMs = bars[bars.length - 1].t - bars[0].t;
                  const multiDay = spanMs > 2 * 86400000;
                  return [0, .25, .5, .75, 1].map((f) => {
                    const b = bars[Math.round(f * (bars.length - 1))];
                    if (!b) return <span key={f} />;
                    const d = new Date(b.t);
                    const day = `${pad(d.getUTCDate())} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]}`;
                    const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
                    return <span key={f}>{multiDay ? `${day} ${String(d.getUTCFullYear()).slice(2)}` : hm}</span>;
                  });
                })()}
              </div>
            </div>

            <div style={{ display: "flex", gap: 2, padding: "0 14px", borderBottom: "1px solid var(--border)" }}>
              {[["trades", `Trades (${trades.length})`], ["orders", "Orders"], ["positions", "Positions"], ["journal", "Journal"]].map(([id, label]) => (
                <button key={id} className={"pc-tab" + (blotTab === id ? " on" : "")} onClick={() => setBlotTab(id)}>{label}</button>
              ))}
            </div>

            <div className="pc-scroll" style={{ maxHeight: 250, overflowY: "auto" }}>
              {blotTab === "trades" && (trades.length === 0 ? (
                <Empty text="No closed trades yet. Arm a setup and advance the replay." />
              ) : (
                <table className="pc-tbl">
                  <thead><tr>{["Market", "Direction", "Entry", "Exit", "R:R", "Result", "Date"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {trades.map((tr) => (
                      <tr key={tr.id}>
                        <td style={{ fontWeight: 500 }}>{tr.symbol}</td>
                        <td style={{ color: tr.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>{tr.dir === "long" ? "Long" : "Short"}</td>
                        <td>{fmtPrice(tr.entry)}</td>
                        <td>{fmtPrice(tr.exit)}</td>
                        <td>{tr.target ? (Math.abs(tr.target - tr.entry) / Math.abs(tr.entry - tr.stop)).toFixed(2) + "R" : "—"}</td>
                        <td style={{ color: tr.pnl > 0 ? "var(--up)" : tr.pnl < 0 ? "var(--down)" : "var(--muted)", fontWeight: 600 }}>{fmtR(tr.r)}</td>
                        <td style={{ color: "var(--muted)" }}>{tr.at ? fmtDate(tr.at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
              {blotTab === "orders" && (trade?.status === "watching" ? (
                <table className="pc-tbl">
                  <thead><tr>{["Market", "Direction", "Entry", "Stop", "Target", "Size", "Status"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody><tr>
                    <td style={{ fontWeight: 500 }}>{symbol}</td>
                    <td style={{ color: trade.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>{trade.dir === "long" ? "Long" : "Short"}</td>
                    <td>{fmtPrice(trade.entry)}</td><td>{fmtPrice(trade.stop)}</td><td>{trade.target ? fmtPrice(trade.target) : "—"}</td>
                    <td>{trade.qty}</td><td><span className="pc-pill" style={{ background: "var(--accentSoft)", color: "var(--accent)" }}>Watching</span></td>
                  </tr></tbody>
                </table>
              ) : <Empty text="No working orders. Arm a setup to place one." />)}
              {blotTab === "positions" && (trade?.status === "open" ? (
                <table className="pc-tbl">
                  <thead><tr>{["Market", "Direction", "Entry", "Size", "Risk", "Open P&L", "R"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody><tr>
                    <td style={{ fontWeight: 500 }}>{symbol}</td>
                    <td style={{ color: trade.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>{trade.dir === "long" ? "Long" : "Short"}</td>
                    <td>{fmtPrice(trade.entry)}</td><td>{trade.qty}</td><td>{fmtMoney(trade.riskAmt)}</td>
                    <td style={{ color: openPnl >= 0 ? "var(--up)" : "var(--down)", fontWeight: 600 }}>{fmtSigned(openPnl)}</td>
                    <td style={{ color: openPnl >= 0 ? "var(--up)" : "var(--down)" }}>{fmtR(trade.riskAmt ? openPnl / trade.riskAmt : 0)}</td>
                  </tr></tbody>
                </table>
              ) : <Empty text="No open position." />)}
              {blotTab === "journal" && (
                <div style={{ padding: 14 }}>
                  <textarea className="pc-in" rows={7} value={journal} placeholder="What did you see, what did you do, what would you change?"
                    style={{ resize: "vertical", lineHeight: 1.7 }} onChange={(e) => setJournal(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* performance */}
          <div className="pc-card" style={{ padding: 14 }}>
            <div className="pc-h2" style={{ marginBottom: 12 }}>Performance Overview</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
              {[["Total Trades", stats.count], ["Win Rate", stats.count ? `${stats.winRate.toFixed(1)}%` : "—"],
                ["Profit Factor", stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2)],
                ["Avg R", stats.count ? fmtR(stats.avgR) : "—"]].map(([l, v]) => (
                <div key={l} style={{ background: "var(--surface)", padding: "10px 11px" }}>
                  <div className="pc-cap" style={{ marginBottom: 4, fontSize: 10 }}>{l}</div>
                  <div className="pc-num" style={{ fontSize: 17, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
            <div className="pc-cap" style={{ marginBottom: 6 }}>Equity curve</div>
            <EquityChart curve={stats.curve} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12 }}>
              <span style={{ color: "var(--muted)" }}>Equity <b className="pc-num" style={{ color: "var(--ink)" }}>{fmtMoney(equity + openPnl)}</b></span>
              <span style={{ color: "var(--muted)" }}>Max DD <b className="pc-num" style={{ color: stats.maxDD > 0 ? "var(--down)" : "var(--ink)" }}>{fmtMoney(stats.maxDD)}</b></span>
            </div>
          </div>
        </div>

        <div className="pc-sm" style={{ color: "var(--dim)", marginTop: 12, textAlign: "center" }}>
          {synthetic
            ? "Live feed unavailable — this session runs a deterministic SIMULATED series, not real market data."
            : `Historical klines from Binance public market data · ${bars.length} real bars${endOfData ? " · end of available history reached" : ""}`}
        </div>
      </div>
    </div>
  );
}
const Empty = ({ text }) => <div style={{ padding: "22px 14px", color: "var(--muted)", fontSize: 13 }}>{text}</div>;
