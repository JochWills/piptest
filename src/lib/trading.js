/* ============================================================
   trading.js — sizing, validation, the fill engine, and stats

   Trades are scored in R (multiples of the amount risked), not
   dollars, so results stay comparable across instruments and
   account sizes. Position size is derived from the stop, never
   entered by hand.
   ============================================================ */

import { SESSIONS } from "../theme.js";

export const START_BALANCE = 10000;
export const MAX_LEVERAGE = 10;
export const MAX_ENTRY_DRIFT = 0.25;   // reject an entry >25% from the live bar

/* ---------- formatting ---------- */
export const dec = (p) => (p >= 1000 ? 2 : p >= 1 ? 3 : 5);
export const fmtPrice = (p) => (p == null || Number.isNaN(p) ? "—" : (+p).toFixed(dec(p)));
export const fmtMoney = (n) => (n < 0 ? "−" : "") + "$" +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtSigned = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toFixed(2);
export const fmtR = (r) => (r >= 0 ? "+" : "−") + Math.abs(r).toFixed(2) + "R";
export const fmtPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const pad = (n) => String(n).padStart(2, "0");
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const fmtDate = (ms) => { const d = new Date(ms); return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtShort = (ms) => new Date(ms).toISOString().slice(0, 10);
export const fmtClock = (ms, iv) => {
  const d = new Date(ms);
  return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}  `
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${iv === "1s" ? ":" + pad(d.getUTCSeconds()) : ""}`;
};
export const uid = () => Math.random().toString(36).slice(2, 10);
export const makeCode = () => {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
};

/* ---------- setup validation ----------
   A stop on the wrong side of entry used to be accepted, sized
   off an absolute distance, and then booked as a WIN when it
   filled. Everything here exists to make that impossible. */
export function validateSetup({ dir, entry, stop, target, riskPct, equity, price }) {
  const e = +entry, s = +stop, r = +riskPct;
  const t = target === "" || target == null ? null : +target;
  const long = dir === "long";
  const errs = [];

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
    errs.push(`Entry is ${((Math.abs(e - price) / price) * 100).toFixed(0)}% away from the current price (${fmtPrice(price)}) — check the instrument.`);
  }
  if (!errs.length) {
    const qty = (equity * (r / 100)) / Math.abs(e - s);
    if (qty * e > equity * MAX_LEVERAGE) {
      errs.push(`That stop is too tight — it needs ${((qty * e) / equity).toFixed(1)}× leverage (cap is ${MAX_LEVERAGE}×). Widen the stop or lower the risk %.`);
    }
  }
  return errs;
}

export function buildSetup({ dir, entry, stop, target, riskPct, equity, symbol, interval, tags, note, atMarket, ts }) {
  const e = +entry, s = +stop, r = +riskPct;
  const t = target === "" || target == null ? null : +target;
  const riskAmt = equity * (r / 100);
  return {
    id: uid(), dir, entry: e, stop: s, target: Number.isNaN(t) ? null : t,
    riskPct: r, riskAmt, qty: +(riskAmt / Math.abs(e - s)).toFixed(6),
    status: atMarket ? "open" : "watching",
    symbol, interval, tags: tags || [], note: note || "",
    fromTs: ts, armedTs: ts, filledTs: atMarket ? ts : null,
  };
}

export const rrOf = (entry, stop, target) => {
  if (!entry || !stop || !target) return null;
  const risk = Math.abs(entry - stop), rew = Math.abs(target - entry);
  return risk > 0 ? rew / risk : null;
};

/* ---------- the fill engine ----------
   Walks EVERY bar between the last checked moment and the
   cursor. Playback speed therefore cannot change an outcome —
   a burst of 50 bars resolves identically to 50 single steps. */
export function runEngine(trade, bars, fromIdx, toIdx) {
  if (!trade) return { trade, closed: [] };
  /* not a clone up front — `t` only ever gets reassigned to a genuinely
     new object below (fill, close), never mutated in place, so a bar
     that changes nothing leaves `t === trade`. Callers (this file's own
     Simulator.jsx integration in particular) rely on that reference
     equality to skip re-rendering/re-drawing trade UI on every single
     replayed bar instead of just the ones that actually change something. */
  let t = trade;
  const closed = [];
  for (let i = fromIdx + 1; i <= toIdx && t; i++) {
    const b = bars[i];
    if (!b) break;
    if (t.status === "watching") {
      if (b.l <= t.entry && b.h >= t.entry) t = { ...t, status: "open", filledTs: b.t };
      else continue;
    }
    if (t.status === "open") {
      const long = t.dir === "long";
      const hitStop = long ? b.l <= t.stop : b.h >= t.stop;
      const hitTgt = t.target != null && (long ? b.h >= t.target : b.l <= t.target);
      if (hitStop || hitTgt) {
        /* both touched inside one bar: assume the stop, because
           intrabar sequence is unknowable from OHLC alone */
        const exit = hitStop ? t.stop : t.target;
        closed.push(bookTrade(t, exit, hitStop && hitTgt ? "stop (both touched)" : hitStop ? "stop" : "target", b.t));
        t = null;
      }
    }
  }
  return { trade: t, closed };
}

export function bookTrade(t, exit, reason, ts) {
  const sign = t.dir === "long" ? 1 : -1;
  const pnl = (exit - t.entry) * t.qty * sign;
  return {
    id: uid(), symbol: t.symbol, interval: t.interval, dir: t.dir, qty: t.qty,
    entry: t.entry, exit, stop: t.stop, target: t.target,
    riskAmt: t.riskAmt, riskPct: t.riskPct,
    r: t.riskAmt ? pnl / t.riskAmt : 0, pnl, reason,
    tags: t.tags || [], note: t.note || "",
    openedTs: t.filledTs || t.armedTs, closedTs: ts,
    barsHeld: null, closedAt: Date.now(),
  };
}

export const openPnl = (trade, price) =>
  trade && trade.status === "open" && price
    ? (price - trade.entry) * trade.qty * (trade.dir === "long" ? 1 : -1) : 0;

/* ---------- statistics ----------
   Breakeven trades are counted separately: a flat trade is not
   a loss, and profit factor is undefined (not infinite) with no
   losses to divide by. */
export function computeStats(trades, startBalance = START_BALANCE) {
  const ord = [...trades].sort((a, b) => (a.closedTs || a.closedAt || 0) - (b.closedTs || b.closedAt || 0));
  let gw = 0, gl = 0, wins = 0, losses = 0, flat = 0;
  let peak = startBalance, maxDD = 0, eq = startBalance, rSum = 0;
  let streak = 0, bestStreak = 0, worstStreak = 0;
  const curve = [startBalance], rs = [];

  for (const t of ord) {
    eq += t.pnl; curve.push(eq); rSum += t.r || 0; rs.push(t.r || 0);
    if (t.pnl > 0) { wins++; gw += t.pnl; streak = streak > 0 ? streak + 1 : 1; }
    else if (t.pnl < 0) { losses++; gl += Math.abs(t.pnl); streak = streak < 0 ? streak - 1 : -1; }
    else { flat++; streak = 0; }
    bestStreak = Math.max(bestStreak, streak);
    worstStreak = Math.min(worstStreak, streak);
    if (eq > peak) peak = eq;
    if (peak - eq > maxDD) maxDD = peak - eq;
  }
  const n = ord.length, decided = wins + losses;
  return {
    count: n, wins, losses, flat, net: eq - startBalance, equity: eq,
    winRate: decided ? (wins / decided) * 100 : 0,
    profitFactor: gl > 0 ? gw / gl : null,
    avgWin: wins ? gw / wins : 0, avgLoss: losses ? gl / losses : 0,
    avgR: n ? rSum / n : 0, totalR: rSum,
    expectancy: n ? (eq - startBalance) / n : 0,
    maxDD, maxDDPct: peak ? (maxDD / peak) * 100 : 0,
    best: n ? Math.max(...ord.map((t) => t.pnl)) : 0,
    worst: n ? Math.min(...ord.map((t) => t.pnl)) : 0,
    bestStreak, worstStreak: Math.abs(worstStreak),
    curve, rs, ordered: ord,
  };
}

const bucket = (list) => {
  const s = computeStats(list);
  return { n: list.length, net: s.net, winRate: s.winRate, avgR: s.avgR, totalR: s.totalR };
};

export function groupBy(trades, fn) {
  const m = new Map();
  for (const t of trades) {
    const k = fn(t);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return [...m.entries()].map(([k, list]) => ({ key: k, ...bucket(list) }));
}

/* Sessions overlap, and the London/NY overlap is the window most
   traders care about — so name it rather than silently picking
   whichever session happens to be listed first. */
export const sessionOf = (ts) => {
  const h = new Date(ts).getUTCHours();
  const hit = SESSIONS.filter((s) => h >= s.from && h < s.to).map((s) => s.label);
  if (!hit.length) return "Off-hours";
  if (hit.length === 1) return hit[0];
  return hit.join(" / ") + " overlap";
};
export const dayOf = (ts) =>
  ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(ts).getUTCDay()];

export function byTag(trades) {
  const m = new Map();
  for (const t of trades) for (const tag of (t.tags || [])) {
    if (!m.has(tag)) m.set(tag, []);
    m.get(tag).push(t);
  }
  return [...m.entries()].map(([k, list]) => ({ key: k, ...bucket(list) }))
    .sort((a, b) => b.totalR - a.totalR);
}

/* R-multiple histogram for the analytics page */
export function rHistogram(trades) {
  const edges = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3];
  const bins = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0 }));
  let under = 0, over = 0;
  for (const t of trades) {
    const r = t.r || 0;
    if (r < edges[0]) { under++; continue; }
    if (r >= edges[edges.length - 1]) { over++; continue; }
    const b = bins.find((x) => r >= x.lo && r < x.hi);
    if (b) b.n++;
  }
  return { bins, under, over };
}

/* ---------- prop-firm challenge rules ---------- */
export const CHALLENGE_PRESETS = [
  { id: "none", label: "Practice (no rules)", daily: null, total: null, target: null },
  { id: "eval1", label: "Evaluation — 5% daily / 10% total / 8% target", daily: 5, total: 10, target: 8 },
  { id: "eval2", label: "Evaluation — 4% daily / 8% total / 6% target", daily: 4, total: 8, target: 6 },
  { id: "funded", label: "Funded — 5% daily / 10% total, no target", daily: 5, total: 10, target: null },
];

export function evaluateChallenge(trades, rules, startBalance = START_BALANCE) {
  if (!rules || (!rules.daily && !rules.total && !rules.target)) return null;
  const s = computeStats(trades, startBalance);
  const totalDD = (s.maxDD / startBalance) * 100;

  /* worst single UTC day, measured against that day's opening balance */
  const days = new Map();
  let eq = startBalance;
  for (const t of s.ordered) {
    const d = fmtShort(t.closedTs || t.closedAt);
    if (!days.has(d)) days.set(d, { open: eq, low: eq });
    eq += t.pnl;
    const rec = days.get(d);
    if (eq < rec.low) rec.low = eq;
    rec.close = eq;
  }
  let worstDay = 0, worstDayKey = null;
  for (const [d, rec] of days) {
    const dd = ((rec.open - rec.low) / rec.open) * 100;
    if (dd > worstDay) { worstDay = dd; worstDayKey = d; }
  }

  const profitPct = (s.net / startBalance) * 100;
  const breachDaily = rules.daily != null && worstDay >= rules.daily;
  const breachTotal = rules.total != null && totalDD >= rules.total;
  const passed = rules.target != null && profitPct >= rules.target && !breachDaily && !breachTotal;

  return {
    worstDay, worstDayKey, totalDD, profitPct,
    breachDaily, breachTotal, passed,
    failed: breachDaily || breachTotal,
    status: breachDaily || breachTotal ? "failed" : passed ? "passed" : "active",
    rules,
  };
}
