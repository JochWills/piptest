import React, { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { barMsOf } from "../theme.js";
import { fmtPrice, uid } from "../lib/trading.js";

/* ============================================================
   ReplayChart — TradingView Lightweight Charts + a drawing layer

   Lightweight Charts ships no drawing tools (that's the paid
   Advanced Charts library), so the overlay below adds them.

   Two rules make it behave:
   · every drawing point stores a TIMESTAMP, reprojected each
     paint — so a level drawn on 30m sits at the same moment
     on 4H
   · geometry is read from a ref, never from a render closure —
     paint() and the pointer handlers are created once, and a
     captured `bars` array would silently convert against the
     wrong timeframe
   ============================================================ */

const LWC_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/lightweight-charts/4.2.0/lightweight-charts.standalone.production.js",
  "https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
  "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js",
];
const FIBS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const TOOLS = [
  { id: "cursor",  title: "Cursor — select, move, delete", key: "V" },
  { id: "trend",   title: "Trend line", key: "T" },
  { id: "ray",     title: "Ray", key: "R" },
  { id: "hline",   title: "Horizontal line", key: "H" },
  { id: "vline",   title: "Vertical line", key: "L" },
  { id: "rect",    title: "Rectangle / zone", key: "B" },
  { id: "fib",     title: "Fib retracement", key: "F" },
  { id: "measure", title: "Measure", key: "M" },
];

export const INDICATORS = [
  { id: "ema20",  label: "EMA 20",  period: 20,  kind: "ema", color: () => "#2563EB" },
  { id: "ema50",  label: "EMA 50",  period: 50,  kind: "ema", color: () => "#F59E0B" },
  { id: "sma200", label: "SMA 200", period: 200, kind: "sma", color: (t) => t.muted },
];

const sma = (bars, p) => { const o = new Array(bars.length).fill(null); let s = 0;
  for (let i = 0; i < bars.length; i++) { s += bars[i].c; if (i >= p) s -= bars[i - p].c; if (i >= p - 1) o[i] = s / p; } return o; };
const ema = (bars, p) => { const o = new Array(bars.length).fill(null); const k = 2 / (p + 1); let pv = null;
  for (let i = 0; i < bars.length; i++) { pv = pv == null ? bars[i].c : bars[i].c * k + pv * (1 - k); if (i >= p - 1) o[i] = pv; } return o; };

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
      el.onload = () => !dead && set(window.LightweightCharts ? "ready" : "failed");
      el.onerror = () => { el.remove(); next(); };
      document.head.appendChild(el);
    };
    next();
    return () => { dead = true; };
  }, []);
  return s;
}

export default function ReplayChart({
  bars, cursor, theme, T, interval, trade, height = 480,
  drawings, onDrawings, onSnapshot, tool, setTool, colorKey, selected, setSelected,
  indicators, logScale, zoom, onNeedOlder,
}) {
  const boxRef = useRef(null), ovRef = useRef(null);
  const chartRef = useRef(null), serRef = useRef(null), volRef = useRef(null), indRefs = useRef({});
  const lastRef = useRef({ key: "", cursor: -1 });
  const dragRef = useRef(null), hovRef = useRef(null), sigRef = useRef("");
  const olderAskRef = useRef(0);
  const lwc = useLWC();

  /* live geometry + callbacks, readable from once-created closures */
  const geo = useRef({ bars, interval, cursor });
  geo.current = { bars, interval, cursor };
  const st = useRef({});
  st.current = { drawings, onDrawings, onSnapshot, tool, setTool, colorKey, selected, setSelected, T, trade, onNeedOlder };

  const dataKey = `${bars[0]?.t || 0}|${bars.length}|${interval}`;

  const indVals = useMemo(() => {
    const o = {};
    INDICATORS.forEach((i) => { if (indicators[i.id]) o[i.id] = i.kind === "ema" ? ema(bars, i.period) : sma(bars, i.period); });
    return o;
  }, [bars, indicators]);

  /* ---------- time <-> logical index ---------- */
  const tsToLogical = (ts) => {
    const { bars: bs, interval: iv0 } = geo.current;
    if (!bs.length || ts == null) return null;
    const iv = barMsOf(iv0), last = bs.length - 1;
    if (ts <= bs[0].t) return (ts - bs[0].t) / iv;
    if (ts >= bs[last].t) return last + (ts - bs[last].t) / iv;
    let lo = 0, hi = last;
    while (lo <= hi) { const m = (lo + hi) >> 1;
      if (bs[m].t === ts) return m;
      if (bs[m].t < ts) lo = m + 1; else hi = m - 1; }
    const a = Math.max(0, hi), b = Math.min(last, lo), span = bs[b].t - bs[a].t;
    return span > 0 ? a + (ts - bs[a].t) / span : a;
  };
  const logicalToTs = (l) => {
    const { bars: bs, interval: iv0 } = geo.current;
    if (!bs.length || l == null) return null;
    const iv = barMsOf(iv0), last = bs.length - 1;
    if (l <= 0) return bs[0].t + l * iv;
    if (l >= last) return bs[last].t + (l - last) * iv;
    const i = Math.floor(l), f = l - i;
    return bs[i].t + (bs[i + 1].t - bs[i].t) * f;
  };
  const ptL = (p) => (p.ts != null ? tsToLogical(p.ts) : p.l);

  /* Project logical -> pixel ourselves. logicalToCoordinate returns null
     outside the loaded bars, which used to make drawings vanish or jump. */
  const toX = (l) => {
    const c = chartRef.current;
    if (!c || l == null || !Number.isFinite(l)) return null;
    const ts = c.timeScale(), r = ts.getVisibleLogicalRange();
    if (!r || r.to === r.from) return null;
    const w = (typeof ts.width === "function" ? ts.width() : 0) || boxRef.current?.clientWidth || 0;
    return ((l - r.from) / (r.to - r.from)) * w;
  };
  const toY = (p) => { const v = serRef.current?.priceToCoordinate(p); return v == null ? null : v; };
  const fromX = (x) => chartRef.current?.timeScale().coordinateToLogical(x);
  const fromY = (y) => serRef.current?.coordinateToPrice(y);

  /* ---------- create ---------- */
  useEffect(() => {
    if (lwc !== "ready" || !boxRef.current) return;
    const LC = window.LightweightCharts;
    const chart = LC.createChart(boxRef.current, {
      width: boxRef.current.clientWidth, height,
      layout: { background: { color: "transparent" }, textColor: T.muted, fontFamily: "Inter, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      rightPriceScale: { borderColor: T.border, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderColor: T.border, timeVisible: true, secondsVisible: interval === "1s", rightOffset: 12 },
      crosshair: { mode: 0,
        vertLine: { color: T.dim, width: 1, style: 3, labelBackgroundColor: T.brand },
        horzLine: { color: T.dim, width: 1, style: 3, labelBackgroundColor: T.brand } },
    });
    const o = { upColor: T.up, downColor: T.down, borderVisible: false, wickUpColor: T.up, wickDownColor: T.down };
    const ser = chart.addCandlestickSeries ? chart.addCandlestickSeries(o) : chart.addSeries(LC.CandlestickSeries, o);
    chartRef.current = chart; serRef.current = ser; lastRef.current = { key: "", cursor: -1 };

    const ro = new ResizeObserver(() => { if (boxRef.current) { chart.applyOptions({ width: boxRef.current.clientWidth, height: boxRef.current.clientHeight }); sizeOv(); } });
    ro.observe(boxRef.current); sizeOv();

    let raf = 0;
    const loop = () => {
      const s = serRef.current, c = chartRef.current;
      if (s && c) {
        const { bars: bs, cursor: cu } = geo.current;
        const r = c.timeScale().getVisibleLogicalRange();
        const ref = s.priceToCoordinate(bs[Math.min(cu, bs.length - 1)]?.c ?? 0);
        const sig = `${r?.from?.toFixed(2)}|${r?.to?.toFixed(2)}|${ref}|${boxRef.current?.clientWidth}`;
        if (sig !== sigRef.current) {
          sigRef.current = sig; paint();
          if (r && r.from < 12 && Date.now() - olderAskRef.current > 1500) {
            olderAskRef.current = Date.now();
            st.current.onNeedOlder && st.current.onNeedOlder();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); chart.remove();
      chartRef.current = null; serRef.current = null; volRef.current = null; indRefs.current = {}; };
  }, [lwc, height]); // eslint-disable-line

  /* ---------- theme ---------- */
  useEffect(() => {
    const c = chartRef.current, s = serRef.current;
    if (!c || !s) return;
    c.applyOptions({
      layout: { textColor: T.muted },
      grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      rightPriceScale: { borderColor: T.border, mode: logScale ? 1 : 0 },
      timeScale: { borderColor: T.border, secondsVisible: interval === "1s" },
      crosshair: { vertLine: { color: T.dim, labelBackgroundColor: T.brand }, horzLine: { color: T.dim, labelBackgroundColor: T.brand } },
    });
    s.applyOptions({ upColor: T.up, downColor: T.down, wickUpColor: T.up, wickDownColor: T.down });
    paint();
  }, [theme, interval, T, logScale]); // eslint-disable-line

  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    const drawing = tool !== "cursor";
    c.applyOptions({
      handleScroll: { mouseWheel: true, pressedMouseMove: !drawing, horzTouchDrag: !drawing, vertTouchDrag: !drawing },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });
  }, [tool, lwc]);

  useEffect(() => {
    const c = chartRef.current;
    if (!c || !bars.length || lwc !== "ready") return;
    const end = Math.min(cursor + 1, bars.length);
    if (!zoom) c.timeScale().fitContent();
    else c.timeScale().setVisibleLogicalRange({ from: Math.max(0, end - zoom), to: end + 12 });
  }, [zoom, dataKey, lwc]); // eslint-disable-line

  /* ---------- volume + indicators ---------- */
  useEffect(() => {
    const c = chartRef.current, LC = window.LightweightCharts;
    if (!c || !LC) return;
    if (indicators.volume && !volRef.current) {
      const o = { priceFormat: { type: "volume" }, priceScaleId: "vol" };
      volRef.current = c.addHistogramSeries ? c.addHistogramSeries(o) : c.addSeries(LC.HistogramSeries, o);
      c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.86, bottom: 0 } });
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
        const o = { color: ind.color(T), lineWidth: 1.6, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        indRefs.current[ind.id] = c.addLineSeries ? c.addLineSeries(o) : c.addSeries(LC.LineSeries, o);
      } else if (!on && indRefs.current[ind.id]) {
        try { c.removeSeries(indRefs.current[ind.id]); } catch (e) {}
        delete indRefs.current[ind.id];
      } else if (on) indRefs.current[ind.id].applyOptions({ color: ind.color(T) });
    });
    lastRef.current = { key: "", cursor: -1 };
  }, [indicators, lwc, T]);

  /* ---------- feed data ---------- */
  useEffect(() => {
    const s = serRef.current;
    if (!s || !bars.length) return;
    const end = Math.min(cursor + 1, bars.length);
    const tb = (b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c });
    const prev = lastRef.current;
    if (prev.key === dataKey && cursor === prev.cursor + 1 && end > 0) {
      const b = bars[end - 1];
      s.update(tb(b));
      if (volRef.current) volRef.current.update({ time: Math.floor(b.t / 1000), value: b.v, color: (b.c >= b.o ? T.up : T.down) + "55" });
      INDICATORS.forEach((ind) => { const ss = indRefs.current[ind.id], v = indVals[ind.id];
        if (ss && v && v[end - 1] != null) ss.update({ time: Math.floor(b.t / 1000), value: v[end - 1] }); });
    } else {
      const sl = bars.slice(0, end);
      s.setData(sl.map(tb));
      if (volRef.current) volRef.current.setData(sl.map((b) => ({ time: Math.floor(b.t / 1000), value: b.v, color: (b.c >= b.o ? T.up : T.down) + "55" })));
      INDICATORS.forEach((ind) => { const ss = indRefs.current[ind.id], v = indVals[ind.id];
        if (!ss || !v) return;
        ss.setData(sl.map((b, i) => (v[i] == null ? null : { time: Math.floor(b.t / 1000), value: v[i] })).filter(Boolean)); });
      if (prev.key !== dataKey && chartRef.current) chartRef.current.timeScale().fitContent();
    }
    lastRef.current = { key: dataKey, cursor };
    paint();
  }, [bars, cursor, dataKey, indVals, lwc]); // eslint-disable-line

  /* ---------- overlay ---------- */
  function sizeOv() {
    const cv = ovRef.current, b = boxRef.current;
    if (!cv || !b) return;
    const d = window.devicePixelRatio || 1;
    cv.width = b.clientWidth * d; cv.height = b.clientHeight * d;
    cv.style.width = b.clientWidth + "px"; cv.style.height = b.clientHeight + "px";
    paint();
  }

  const paint = useCallback(() => {
    const cv = ovRef.current, box = boxRef.current;
    if (!cv || !box || !chartRef.current || !serRef.current) return;
    const d = window.devicePixelRatio || 1, W = box.clientWidth, H = box.clientHeight;
    const c = cv.getContext("2d");
    c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
    c.font = "500 11px Inter, sans-serif"; c.textBaseline = "middle";
    const S = st.current, TT = S.T;

    const pill = (text, y, bg) => {
      c.save(); c.font = "600 11px Inter, sans-serif";
      const w = c.measureText(text).width + 14, h = 18, r = 4, x = W - w - 74;
      c.beginPath(); c.moveTo(x + r, y - h / 2);
      c.arcTo(x + w, y - h / 2, x + w, y + h / 2, r); c.arcTo(x + w, y + h / 2, x, y + h / 2, r);
      c.arcTo(x, y + h / 2, x, y - h / 2, r); c.arcTo(x, y - h / 2, x + w, y - h / 2, r);
      c.closePath(); c.fillStyle = bg; c.fill();
      c.fillStyle = "#fff"; c.fillText(text, x + 7, y + 0.5); c.restore();
    };

    /* trade zones */
    const tr = S.trade;
    if (tr) {
      const x1 = toX(tsToLogical(tr.fromTs)) ?? 0;
      const yE = toY(tr.entry), yS = toY(tr.stop), yT = tr.target != null ? toY(tr.target) : null;
      if (yE != null) {
        if (yT != null) { c.fillStyle = TT.up; c.globalAlpha = 0.13; c.fillRect(x1, Math.min(yE, yT), W - x1, Math.abs(yT - yE)); }
        if (yS != null) { c.fillStyle = TT.down; c.globalAlpha = 0.13; c.fillRect(x1, Math.min(yE, yS), W - x1, Math.abs(yS - yE)); }
        c.globalAlpha = 1;
        const dash = (y, col) => { c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash([4, 3]);
          c.beginPath(); c.moveTo(x1, y); c.lineTo(W, y); c.stroke(); c.setLineDash([]); };
        if (yT != null) dash(yT, TT.up);
        if (yS != null) dash(yS, TT.down);
        c.strokeStyle = TT.brand; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x1, yE); c.lineTo(W, yE); c.stroke();
        if (yT != null) pill(`Target ${fmtPrice(tr.target)}`, yT, TT.up);
        pill(`${tr.status === "open" ? "Entry" : "Limit"} ${fmtPrice(tr.entry)}`, yE, TT.brand);
        if (yS != null) pill(`Stop ${fmtPrice(tr.stop)}`, yS, TT.down);
      }
    }

    const list = [...(S.drawings || [])];
    if (dragRef.current?.preview) list.push(dragRef.current.preview);

    for (const dr of list) {
      const col = TT[dr.color] || TT.brand;
      const sel = dr.id === S.selected, hov = dr.id === hovRef.current;
      c.strokeStyle = col; c.fillStyle = col;
      c.globalAlpha = sel || hov ? 1 : 0.9; c.lineWidth = sel ? 2.2 : 1.5;
      const P = dr.pts.map((p) => ({ x: toX(ptL(p)), y: toY(p.p) }));
      if (P.some((p) => p.x == null || p.y == null)) continue;

      if (dr.type === "hline") { c.beginPath(); c.moveTo(0, P[0].y); c.lineTo(W, P[0].y); c.stroke(); lbl(fmtPrice(dr.pts[0].p), 6, P[0].y - 10, col); }
      else if (dr.type === "vline") { c.beginPath(); c.moveTo(P[0].x, 0); c.lineTo(P[0].x, H); c.stroke(); }
      else if (dr.type === "trend" || dr.type === "measure") {
        c.beginPath(); c.moveTo(P[0].x, P[0].y); c.lineTo(P[1].x, P[1].y); c.stroke();
        if (dr.type === "measure") {
          const dp = dr.pts[1].p - dr.pts[0].p, dpct = (dp / dr.pts[0].p) * 100;
          const nb = Math.round(ptL(dr.pts[1]) - ptL(dr.pts[0]));
          c.globalAlpha = 0.12; c.fillRect(Math.min(P[0].x, P[1].x), Math.min(P[0].y, P[1].y), Math.abs(P[1].x - P[0].x), Math.abs(P[1].y - P[0].y)); c.globalAlpha = 1;
          lbl(`${dp >= 0 ? "+" : ""}${fmtPrice(dp)}   ${dpct >= 0 ? "+" : ""}${dpct.toFixed(2)}%   ${nb} bars`,
            (P[0].x + P[1].x) / 2 - 68, Math.min(P[0].y, P[1].y) - 13, col);
        }
      } else if (dr.type === "ray") {
        const dx = P[1].x - P[0].x, dy = P[1].y - P[0].y, k = dx === 0 ? 1e6 : (W - P[0].x) / dx;
        c.beginPath(); c.moveTo(P[0].x, P[0].y); c.lineTo(P[0].x + dx * Math.max(k, 1), P[0].y + dy * Math.max(k, 1)); c.stroke();
      } else if (dr.type === "rect") {
        const x = Math.min(P[0].x, P[1].x), y = Math.min(P[0].y, P[1].y);
        const w = Math.abs(P[1].x - P[0].x), h = Math.abs(P[1].y - P[0].y);
        c.globalAlpha = 0.1; c.fillRect(x, y, w, h); c.globalAlpha = sel || hov ? 1 : 0.9; c.strokeRect(x, y, w, h);
      } else if (dr.type === "fib") {
        const hi = dr.pts[0].p, lo = dr.pts[1].p;
        const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x);
        FIBS.forEach((f, i) => {
          const pr = hi + (lo - hi) * f, y = toY(pr);
          if (y == null) return;
          c.globalAlpha = 0.85; c.setLineDash(f === 0 || f === 1 ? [] : [4, 3]);
          c.beginPath(); c.moveTo(x1, y); c.lineTo(Math.max(x2, W), y); c.stroke(); c.setLineDash([]);
          if (i > 0) { const yp = toY(hi + (lo - hi) * FIBS[i - 1]);
            if (yp != null) { c.globalAlpha = 0.06; c.fillRect(x1, Math.min(y, yp), Math.max(x2, W) - x1, Math.abs(y - yp)); } }
          c.globalAlpha = 1; lbl(`${(f * 100).toFixed(1)}%  ${fmtPrice(pr)}`, x1 + 4, y - 10, col);
        });
      }
      if (sel) {
        c.globalAlpha = 1; c.fillStyle = TT.surface; c.strokeStyle = col; c.lineWidth = 1.6;
        P.forEach((p) => { const hx = dr.type === "hline" ? W / 2 : p.x, hy = dr.type === "vline" ? H / 2 : p.y;
          c.beginPath(); c.arc(hx, hy, 4.5, 0, Math.PI * 2); c.fill(); c.stroke(); });
      }
      c.globalAlpha = 1;
    }
    function lbl(text, x, y, col) {
      c.save(); const w = c.measureText(text).width + 8;
      c.globalAlpha = 0.94; c.fillStyle = TT.surface; c.fillRect(x - 2, y - 8, w, 16);
      c.globalAlpha = 1; c.fillStyle = col; c.fillText(text, x + 2, y); c.restore();
    }
  }, []); // eslint-disable-line

  useEffect(() => { paint(); }, [drawings, selected, trade, T, paint]);

  /* ---------- hit testing + pointer ---------- */
  const dSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const k = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L));
    return Math.hypot(px - (ax + k * dx), py - (ay + k * dy));
  };
  const hit = (x, y) => {
    const S = st.current, W = boxRef.current?.clientWidth || 0, H = boxRef.current?.clientHeight || 0;
    for (let i = (S.drawings || []).length - 1; i >= 0; i--) {
      const dr = S.drawings[i];
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
        const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x);
        const y1 = Math.min(P[0].y, P[1].y), y2 = Math.max(P[0].y, P[1].y);
        const n = (a, b) => Math.abs(a - b) < 6;
        if ((x >= x1 - 6 && x <= x2 + 6 && (n(y, y1) || n(y, y2))) || (y >= y1 - 6 && y <= y2 + 6 && (n(x, x1) || n(x, x2)))) return { d: dr, point: -1 };
      }
      if (dr.type === "fib") {
        const x1 = Math.min(P[0].x, P[1].x);
        for (const f of FIBS) { const yy = toY(dr.pts[0].p + (dr.pts[1].p - dr.pts[0].p) * f);
          if (yy != null && Math.abs(y - yy) < 6 && x >= x1 - 6) return { d: dr, point: -1 }; }
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
      const S = st.current, { x, y } = rel(e), l = fromX(x), p = fromY(y);
      if (l == null || p == null) return;
      if (S.tool === "cursor") {
        const h = hit(x, y); S.setSelected(h ? h.d.id : null);
        if (h) { e.stopPropagation(); e.preventDefault(); S.onSnapshot && S.onSnapshot();
          dragRef.current = { mode: h.point >= 0 ? "point" : "move", id: h.d.id, pointIdx: h.point,
            start: { l, p }, orig: JSON.parse(JSON.stringify(h.d.pts)) }; }
        paint(); return;
      }
      e.stopPropagation(); e.preventDefault();
      S.onSnapshot && S.onSnapshot();
      const mk = (li, pr) => ({ l: li, p: pr, ts: logicalToTs(li) });
      const single = S.tool === "hline" || S.tool === "vline";
      const base = { id: uid(), type: S.tool, color: S.colorKey, pts: single ? [mk(l, p)] : [mk(l, p), mk(l, p)] };
      if (single) { S.onDrawings([...(S.drawings || []), base]); S.setTool("cursor"); S.setSelected(base.id); return; }
      dragRef.current = { mode: "new", preview: base };
    };
    const move = (e) => {
      const S = st.current, { x, y } = rel(e), drag = dragRef.current;
      if (!drag) {
        if (S.tool === "cursor") { const h = hit(x, y); const id = h ? h.d.id : null;
          if (id !== hovRef.current) { hovRef.current = id; box.style.cursor = id ? "move" : "default"; paint(); } }
        else box.style.cursor = "crosshair";
        return;
      }
      e.stopPropagation(); e.preventDefault();
      const l = fromX(x), p = fromY(y);
      if (l == null || p == null) return;
      if (drag.mode === "new") { drag.preview.pts[1] = { l, p, ts: logicalToTs(l) }; paint(); }
      else {
        S.onDrawings((S.drawings || []).map((dr) => {
          if (dr.id !== drag.id) return dr;
          if (drag.mode === "point") return { ...dr, pts: dr.pts.map((q, i) => (i === drag.pointIdx ? { l, p, ts: logicalToTs(l) } : q)) };
          const dl = l - drag.start.l, dp = p - drag.start.p;
          return { ...dr, pts: drag.orig.map((q) => { const nl = (q.ts != null ? tsToLogical(q.ts) : q.l) + dl;
            return { l: nl, p: q.p + dp, ts: logicalToTs(nl) }; }) };
        }));
      }
    };
    const up = () => {
      const S = st.current, drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === "new") {
        const dr = drag.preview;
        const moved = Math.abs(dr.pts[1].l - dr.pts[0].l) > 0.4 || Math.abs(dr.pts[1].p - dr.pts[0].p) > 1e-9;
        dragRef.current = null;
        if (moved && dr.type !== "measure") { S.onDrawings([...(S.drawings || []), dr]); S.setTool("cursor"); S.setSelected(dr.id); }
        else if (moved) { dragRef.current = { preview: dr }; paint();
          setTimeout(() => { if (dragRef.current?.preview === dr) { dragRef.current = null; paint(); } }, 2800); }
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
    return () => { box.removeEventListener("mousedown", down, true); window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", up, true); box.removeEventListener("mouseleave", leave); };
  }, [lwc, paint]);

  if (lwc === "loading") return <div style={{ flex: 1, minHeight: height, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 13 }}>Loading chart engine…</div>;
  if (lwc === "failed") return (
    <div style={{ flex: 1, minHeight: height, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Chart engine didn't load</div>
        <div className="sm mut" style={{ maxWidth: 360, lineHeight: 1.6 }}>
          Lightweight Charts couldn't be fetched from any CDN. Check the connection and reload — the rest of the workspace still works.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, width: "100%" }}>
      <div ref={boxRef} style={{ width: "100%", height: "100%" }} />
      <canvas ref={ovRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}
