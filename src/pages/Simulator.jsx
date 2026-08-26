import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, Field, Stat, Empty, Modal, Svg, Ic } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import FloatingBar, { defaultBarPos } from "../components/FloatingBar.jsx";
import ReplayChart, { TOOLS, INDICATORS } from "../chart/ReplayChart.jsx";
import { SYMBOLS, INTERVALS, SPEEDS, barMsOf } from "../theme.js";
import { loadWindow, fetchPaged, fetchTickers, nearestIndex, syntheticKlines } from "../lib/market.js";
import {
  validateSetup, buildSetup, runEngine, bookTrade, openPnl, computeStats, rrOf,
  evaluateChallenge, fmtPrice, fmtMoney, fmtSigned, fmtR, fmtClock, fmtShort, dec,
  START_BALANCE, uid, makeCode,
} from "../lib/trading.js";
import { store, K } from "../lib/store.js";
import * as data from "../lib/data.js";
import { API_ENABLED } from "../lib/api.js";

const TOOL_ICONS = {
  cursor:  <path d="M4 3l8.5 6.6-3.8.7L10.4 14 9 14.7 7.2 10.9 4.3 12.6z" fill="currentColor" />,
  trend:   <><path d="M3 13 13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="3" cy="13" r="1.7" fill="currentColor" /><circle cx="13" cy="4" r="1.7" fill="currentColor" /></>,
  ray:     <><path d="M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="m10.5 7.5 2.5 2.5-2.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="3" cy="12" r="1.7" fill="currentColor" /></>,
  hline:   <><path d="M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></>,
  vline:   <><path d="M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="1.7" fill="currentColor" /></>,
  rect:    <rect x="2.5" y="4" width="11" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.5" fill="none" />,
  fib:     <path d="M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />,
  measure: <><path d="M3 11 12 4" stroke="currentColor" strokeWidth="1.4" /><path d="M3 7.5V13h5.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>,
};
const PALETTE = ["brand", "up", "down", "muted"];
const ZOOMS = [{ n: 60, l: "60" }, { n: 120, l: "120" }, { n: 250, l: "250" }, { n: 500, l: "500" }, { n: 0, l: "All" }];

export default function Simulator({ meta, account, theme, T, tags, onExit, onSaveSession, onTradesClosed, onToggleTheme }) {
  /* ---------- market ---------- */
  const [symbol, setSymbol] = useState(meta.symbol);
  const [interval, setIv] = useState(meta.interval);
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [synthetic, setSynthetic] = useState(false);
  const [shortFrom, setShortFrom] = useState(null);
  const [noOlder, setNoOlder] = useState(false);
  const [tickers, setTickers] = useState([]);
  const fetchingRef = useRef(false), olderRef = useRef(false), anchorRef = useRef(null);

  /* ---------- replay ---------- */
  const [cursor, setCursor] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const checkedRef = useRef(-1);

  /* ---------- trading ---------- */
  const [trade, setTrade] = useState(null);
  const [trades, setTrades] = useState([]);
  const [form, setForm] = useState({ dir: "long", entry: "", stop: "", target: "", riskPct: "1.0" });
  const [formTags, setFormTags] = useState([]);
  const [formErr, setFormErr] = useState("");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState("trades");

  /* ---------- chart tools ---------- */
  const [tool, setTool] = useState("cursor");
  const [colorKey, setColorKey] = useState("brand");
  const [selected, setSelected] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [indicators, setIndicators] = useState({ volume: true, ema20: false, ema50: false, sma200: false });
  const [indOpen, setIndOpen] = useState(false);
  const [logScale, setLog] = useState(false);
  const [zoom, setZoom] = useState(120);
  const undoRef = useRef([]), redoRef = useRef([]);

  /* ---------- room ---------- */
  const [room, setRoom] = useState(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomMsg, setRoomMsg] = useState("");
  const pushRef = useRef(0), appliedRef = useRef(0);

  const [barPos, setBarPos] = useState(() => defaultBarPos());
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [helpOpen, setHelpOpen] = useState(false);

  const role = room ? room.participants?.[account.handle]?.role || "viewer" : "host";
  const canControl = !room || role === "host" || role === "editor";
  const isHost = room && room.participants?.[account.handle]?.role === "host";

  const barsRef = useRef(bars); barsRef.current = bars;
  const cur = bars[Math.min(cursor, bars.length - 1)] || null;
  const prev = bars[Math.min(cursor, bars.length - 1) - 1] || null;
  const price = cur?.c ?? null;
  const stats = useMemo(() => computeStats(trades), [trades]);
  const equity = stats.equity;
  const unreal = openPnl(trade, price);
  const chg = cur && prev ? cur.c - prev.c : 0;
  const chgPct = cur && prev ? (chg / prev.c) * 100 : 0;
  const challenge = useMemo(() => evaluateChallenge(trades, meta.challenge), [trades, meta.challenge]);

  const entryVal = parseFloat(form.entry) || price || 0;
  const rr = useMemo(() => rrOf(entryVal, parseFloat(form.stop), parseFloat(form.target)), [entryVal, form.stop, form.target]);
  const setupErrors = useMemo(() => {
    if (trade || !form.stop) return [];
    return validateSetup({ dir: form.dir, entry: entryVal, stop: form.stop, target: form.target, riskPct: form.riskPct, equity, price });
  }, [trade, form, entryVal, equity, price]);
  const projQty = useMemo(() => {
    const s = parseFloat(form.stop), r = parseFloat(form.riskPct);
    if (!entryVal || !s || !r || setupErrors.length) return null;
    return (equity * (r / 100)) / Math.abs(entryVal - s);
  }, [entryVal, form.stop, form.riskPct, equity, setupErrors]);

  /* ================= restore ================= */
  useEffect(() => {
    (async () => {
      const body = await data.getSessionState(meta.id);
      if (body) {
        setCursor(body.cursor ?? 100);
        setTrades(body.trades || []);
        setTrade(body.trade || null);
        setDrawings(body.drawings || []);
        setNotes(body.notes || "");
        if (body.indicators) setIndicators(body.indicators);
        if (body.symbol) setSymbol(body.symbol);
        if (body.interval) setIv(body.interval);
      }
      const prefs = await store.get(K.prefs);
      if (prefs?.replayBar) {
        setBarPos({
          x: Math.min(Math.max(8, prefs.replayBar.x), Math.max(8, window.innerWidth - 360)),
          y: Math.min(Math.max(8, prefs.replayBar.y), Math.max(8, window.innerHeight - 90)),
        });
        setBarCollapsed(!!prefs.replayBar.collapsed);
      }
      setRestored(true);
    })();
  }, [meta.id]);

  /* ================= market data ================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setNoOlder(false); fetchingRef.current = false;
      const target = anchorRef.current || meta.startMs;
      const { bars: next, synthetic: syn, shortFrom: sf } = await loadWindow(symbol, interval, target);
      if (!alive) return;
      setSynthetic(syn); setShortFrom(sf); setBars(next);
      const idx = Math.max(Math.min(20, next.length - 1), Math.min(nearestIndex(next, target), next.length - 1));
      anchorRef.current = null;
      setCursor(idx); checkedRef.current = idx;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [symbol, interval, meta.startMs]);

  useEffect(() => {
    (async () => { const t = await fetchTickers(SYMBOLS.map((s) => s.id)); if (t) setTickers(t); })();
    const id = setInterval(async () => { const t = await fetchTickers(SYMBOLS.map((s) => s.id)); if (t) setTickers(t); }, 45000);
    return () => clearInterval(id);
  }, []);

  /* extend forwards */
  useEffect(() => {
    if (loading || fetchingRef.current || !bars.length || cursor < bars.length - 120) return;
    fetchingRef.current = true;
    let alive = true;
    (async () => {
      const ns = bars[bars.length - 1].t + barMsOf(interval);
      const more = synthetic ? null : await fetchPaged(symbol, interval, ns, 500);
      if (!alive) { fetchingRef.current = false; return; }
      if (more && more.length) setBars((b) => (b[b.length - 1].t >= more[0].t ? b : [...b, ...more]));
      else if (synthetic) setBars((b) => [...b, ...syntheticKlines(symbol, interval, ns, 500)]);
      fetchingRef.current = false;
    })();
    return () => { alive = false; };
  }, [cursor, bars, loading, synthetic, symbol, interval]);

  /* extend backwards on pan */
  const loadOlder = useCallback(async () => {
    if (olderRef.current || noOlder || synthetic || loading) return;
    const bs = barsRef.current;
    if (!bs.length) return;
    olderRef.current = true;
    const iv = barMsOf(interval), firstT = bs[0].t;
    const older = await fetchPaged(symbol, interval, firstT - 1000 * iv, 1000);
    const fresh = (older || []).filter((k) => k.t < firstT);
    if (!fresh.length) setNoOlder(true);
    else {
      setBars((b) => (b.length && b[0].t === firstT ? [...fresh, ...b] : b));
      setCursor((c) => c + fresh.length);
      checkedRef.current += fresh.length;
      setShortFrom(null);
    }
    olderRef.current = false;
  }, [symbol, interval, noOlder, synthetic, loading]);

  /* ================= replay clock ================= */
  const rafRef = useRef(0), accRef = useRef(0), lastRef = useRef(0);
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); lastRef.current = 0; accRef.current = 0; return; }
    const tick = (now) => {
      if (!lastRef.current) lastRef.current = now;
      accRef.current += now - lastRef.current; lastRef.current = now;
      const per = 1000 / speed;
      let steps = 0;
      while (accRef.current >= per && steps < 40) { accRef.current -= per; steps++; }
      if (steps) setCursor((c) => Math.min(c + steps, bars.length - 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, bars.length]);

  /* ================= fill engine =================
     Walks every bar between the last checked index and the cursor,
     so a 50x burst resolves exactly like 50 single steps. */
  const tradeRef = useRef(null);
  useEffect(() => { tradeRef.current = trade; }, [trade]);
  useEffect(() => {
    if (!bars.length) return;
    const from = checkedRef.current;
    if (cursor <= from) { checkedRef.current = cursor; return; }
    const t0 = tradeRef.current;
    if (!t0) { checkedRef.current = cursor; return; }
    const { trade: t1, closed } = runEngine(t0, bars, from, cursor);
    checkedRef.current = cursor;
    if (closed.length) {
      setTrades((list) => [...closed.slice().reverse(), ...list]);
      onTradesClosed && onTradesClosed(closed);
    }
    if (t1 !== t0) setTrade(t1);
  }, [cursor, bars]); // eslint-disable-line

  /* ================= actions ================= */
  const closeNow = () => {
    const t = tradeRef.current;
    if (!t || !price) return;
    if (t.status === "watching") { setTrade(null); return; }
    const rec = bookTrade(t, price, "manual", cur?.t);
    setTrades((l) => [rec, ...l]);
    onTradesClosed && onTradesClosed([rec]);
    setTrade(null);
  };

  const arm = (atMarket) => {
    const e = atMarket ? price : entryVal;
    const errs = validateSetup({ dir: form.dir, entry: e, stop: form.stop, target: form.target, riskPct: form.riskPct, equity, price });
    if (errs.length) { setFormErr(errs[0]); return; }
    setFormErr("");
    setTrade(buildSetup({ ...form, entry: e, equity, symbol, interval, tags: formTags, note: "", atMarket, ts: cur?.t }));
  };

  const moveStopToBE = () => {
    setTrade((t) => (t && t.status === "open" ? { ...t, stop: t.entry } : t));
  };

  const switchMarket = (nextSym, nextIv) => {
    const cs = nextSym && nextSym !== symbol, ci = nextIv && nextIv !== interval;
    if (!cs && !ci) return;
    if (trade && !confirm(trade.status === "open"
      ? "You have an open position. Switching will close it at the current price. Continue?"
      : "You have a working order. Switching will cancel it. Continue?")) return;
    if (trade?.status === "open" && price) closeNow();
    else if (trade) setTrade(null);
    setForm((f) => ({ ...f, entry: "", stop: "", target: "" }));
    setFormErr("");
    anchorRef.current = cur?.t ?? null;
    if (cs) setSymbol(nextSym);
    if (ci) setIv(nextIv);
  };

  /* drawings */
  const applyDrawings = useCallback((next) => setDrawings((p) => (typeof next === "function" ? next(p) : next)), []);
  const snapshot = useCallback(() => setDrawings((p) => { undoRef.current.push(p); if (undoRef.current.length > 60) undoRef.current.shift(); redoRef.current = []; return p; }), []);
  const undo = () => { const p = undoRef.current.pop(); if (p) { redoRef.current.push(drawings); setDrawings(p); setSelected(null); } };
  const redo = () => { const n = redoRef.current.pop(); if (n) { undoRef.current.push(drawings); setDrawings(n); } };

  /* ================= autosave ================= */
  const saveT = useRef(null);
  useEffect(() => {
    if (!restored) return;
    setSaveState("saving");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      const ok = await data.saveSessionState(meta.id, {
        id: meta.id, cursor, trades, trade, drawings, notes, indicators, symbol, interval,
      });
      const st = computeStats(trades);
      const ch = evaluateChallenge(trades, meta.challenge);
      onSaveSession(meta.id, {
        symbol, interval,
        stats: {
          count: st.count, wins: st.wins, losses: st.losses, flat: st.flat, net: st.net,
          winRate: st.winRate, avgR: st.avgR, totalR: st.totalR, maxDD: st.maxDD,
          curve: st.curve.slice(-80), challengeStatus: ch?.status || null,
        },
      });
      setSaveState(ok ? "saved" : "failed");
    }, 1000);
    return () => clearTimeout(saveT.current);
  }, [trades, trade, cursor, drawings, notes, indicators, symbol, interval, restored]); // eslint-disable-line

  /* remember where the replay bar was left */
  const barSaveT = useRef(null);
  useEffect(() => {
    if (!restored) return;
    clearTimeout(barSaveT.current);
    barSaveT.current = setTimeout(async () => {
      const prefs = (await store.get(K.prefs)) || {};
      await store.set(K.prefs, { ...prefs, replayBar: { ...barPos, collapsed: barCollapsed } });
    }, 500);
    return () => clearTimeout(barSaveT.current);
  }, [barPos, barCollapsed, restored]);

  /* ================= rooms ================= */
  const pushRoom = useCallback(async (extra = {}) => {
    if (!room || !canControl || !API_ENABLED) return;
    const now = Date.now();
    if (!extra.force && now - pushRef.current < 700) return;
    pushRef.current = now;
    const doc = { ...room, symbol, interval, cursor, playing, speed, drawings, updatedBy: account.handle, updatedAt: now, ...extra };
    delete doc.force;
    setRoom(doc);
    await data.roomPut(room.code, doc);
  }, [room, canControl, symbol, interval, cursor, playing, speed, drawings, account.handle]);

  useEffect(() => { if (room && canControl) pushRoom(); }, [cursor, playing, speed, drawings, symbol, interval]); // eslint-disable-line

  useEffect(() => {
    if (!room?.code || !API_ENABLED) return;
    let alive = true;
    const poll = async () => {
      const doc = await data.roomGet(room.code);
      if (!alive || !doc) return;
      if (doc.updatedBy === account.handle || (doc.updatedAt || 0) <= appliedRef.current) {
        setRoom((r) => ({ ...r, participants: doc.participants })); return;
      }
      appliedRef.current = doc.updatedAt || 0;
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
  }, [room?.code, account.handle]); // eslint-disable-line

  const hostRoom = async () => {
    if (!API_ENABLED) { setRoomMsg("Live rooms need the API. Set VITE_API_URL and redeploy."); return; }
    const code = makeCode();
    const doc = { code, host: account.handle, symbol, interval, startMs: meta.startMs,
      participants: { [account.handle]: { role: "host", ts: Date.now() } },
      drawings, cursor, playing: false, speed, updatedBy: account.handle, updatedAt: Date.now() };
    if (!(await data.roomPut(code, doc))) { setRoomMsg("Couldn't open the room. Try again."); return; }
    setRoom(doc); setRoomMsg(`Room ${code} is open — share the code.`);
  };
  const joinRoom = async () => {
    setRoomMsg("");
    if (!API_ENABLED) { setRoomMsg("Live rooms need the API."); return; }
    const code = joinCode.trim().toUpperCase();
    if (!code) { setRoomMsg("Enter a room code first."); return; }
    if (code.length !== 6) { setRoomMsg(`"${code}" is ${code.length} characters — codes are 6.`); return; }
    setRoomMsg("Looking for that room…");
    const doc = await data.roomGet(code);
    if (!doc) { setRoomMsg(`No open room found for ${code}.`); return; }
    doc.participants = { ...doc.participants, [account.handle]: { role: doc.participants?.[account.handle]?.role || "viewer", ts: Date.now() } };
    await data.roomPut(code, doc);
    appliedRef.current = 0; setRoom(doc); setRoomMsg(`Joined ${code} as viewer.`);
  };
  const leaveRoom = async () => {
    if (room && API_ENABLED) {
      const d = await data.roomGet(room.code);
      if (d?.participants) { delete d.participants[account.handle]; await data.roomPut(room.code, d); }
    }
    setRoom(null); setRoomMsg("");
  };
  const setRole = async (who, r) => {
    if (!isHost) return;
    const d = await data.roomGet(room.code);
    if (!d) return;
    d.participants[who] = { ...d.participants[who], role: r };
    d.updatedBy = account.handle; d.updatedAt = Date.now();
    await data.roomPut(room.code, d);
    setRoom(d);
  };

  /* ================= hotkeys ================= */
  useEffect(() => {
    const onKey = (e) => {
      const tg = document.activeElement?.tagName;
      if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.key === " ") { e.preventDefault(); if (canControl) setPlaying((p) => !p); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (canControl) setCursor((c) => Math.min(c + (e.shiftKey ? 10 : 1), bars.length - 1)); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); if (canControl) setCursor((c) => Math.max(c - (e.shiftKey ? 10 : 1), 0)); return; }
      if (e.key === "Escape") { setTool("cursor"); setSelected(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) { e.preventDefault(); snapshot(); applyDrawings((d) => d.filter((x) => x.id !== selected)); setSelected(null); }
        return;
      }
      if (k === "?") { setHelpOpen(true); return; }
      const t = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (t && canControl) { setTool(t.id); if (t.id !== "cursor") setSelected(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, bars.length, selected, drawings]); // eslint-disable-line

  useEffect(() => {
    const away = (e) => { if (!e.target.closest?.("[data-pop]")) { setIndOpen(false); setRoomOpen(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const marketList = tickers.length ? tickers : SYMBOLS.map((s) => ({ symbol: s.id, price: null, chg: 0 }));
  const visibleDrawings = drawings.filter((d) => !d.market || d.market === symbol).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* ================= top bar ================= */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", height: 56,
        borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0, flexWrap: "wrap" }}>
        {/* the logo doubles as the way out — labelled, because an icon
            alone left people with no obvious route back */}
        <button onClick={onExit} title="Back to your dashboard"
          style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent",
            border: "1px solid transparent", borderRadius: 9, padding: "5px 10px 5px 6px",
            cursor: "pointer", fontFamily: "inherit", color: "var(--muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
          <Logo size={27} showText={false} />
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </span>
        </button>
        <div className="vsep" style={{ height: 24 }} />

        <select className="in" style={{ width: "auto", fontWeight: 600, minWidth: 128 }} value={symbol}
          disabled={!canControl} onChange={(e) => switchMarket(e.target.value, null)}>
          {SYMBOLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{fmtPrice(price)}</span>
        <span className="num sm" style={{ fontWeight: 500, color: chg >= 0 ? "var(--up)" : "var(--down)" }}>
          {chg >= 0 ? "+" : "−"}{fmtPrice(Math.abs(chg))} ({chgPct >= 0 ? "+" : "−"}{Math.abs(chgPct).toFixed(2)}%)
        </span>
        <span className="sm mut hide-sm">{cur ? fmtClock(cur.t, interval) + " UTC" : ""}</span>
        {synthetic && <span className="pill b">simulated data</span>}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="sm" style={{ color: saveState === "failed" ? "var(--down)" : "var(--dim)" }}>
            {saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "Saved"}
          </span>
          <div className="hide-sm" style={{ textAlign: "right" }}>
            <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(equity + unreal)}</div>
            <div className="sm mut" style={{ fontSize: 11 }}>
              {stats.count ? fmtR(stats.totalR) : "no trades"}
            </div>
          </div>
          <span data-pop style={{ position: "relative" }}>
            <button className={"btn ghost " + (roomOpen ? "on" : "")} onClick={() => setRoomOpen((o) => !o)}
              title="Live room" aria-label="Live room" style={{ padding: "6px 9px" }}>
              <Svg s={15}>{Ic.users}</Svg>
            </button>
            {roomOpen && <RoomPanel {...{ room, isHost, account, joinCode, setJoinCode, roomMsg, hostRoom, joinRoom, leaveRoom, setRole, onClose: () => setRoomOpen(false) }} />}
          </span>
          {room && <span className="pill b live">● {room.code}</span>}
          <button className="btn ghost" onClick={onToggleTheme} style={{ padding: "6px 9px" }} aria-label="Toggle theme">
            <Svg s={15}>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
          </button>
          <button className={"btn " + (playing ? "" : "pri")} disabled={!canControl} onClick={() => setPlaying((p) => !p)}>
            <Svg s={14}>{playing ? Ic.pause : Ic.play}</Svg>{playing ? "Pause" : "Replay"}
          </button>
        </div>
      </header>

      {/* ================= timeframe strip ================= */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "6px 14px",
        borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap", flexShrink: 0 }}>
        {INTERVALS.map((i) => (
          <button key={i.id} className={"btn ghost " + (interval === i.id ? "on" : "")}
            style={{ padding: "5px 11px", fontSize: 12.5 }} disabled={!canControl}
            onClick={() => switchMarket(null, i.id)}>{i.label}</button>
        ))}
        <div className="vsep" style={{ height: 20 }} />
        <span data-pop style={{ position: "relative" }}>
          <button className="btn" style={{ padding: "5px 11px", fontSize: 12.5 }} onClick={() => setIndOpen((o) => !o)}>
            Indicators <Svg s={13}>{Ic.chev}</Svg>
          </button>
          {indOpen && (
            <div className="card" style={{ position: "absolute", top: 34, left: 0, zIndex: 40, padding: 6, width: 176 }}>
              {[{ id: "volume", label: "Volume" }, ...INDICATORS].map((ind) => (
                <button key={ind.id} className="btn ghost" style={{ width: "100%", justifyContent: "space-between", padding: "8px 10px" }}
                  onClick={() => setIndicators((s) => ({ ...s, [ind.id]: !s[ind.id] }))}>
                  {ind.label}
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: "1px solid var(--border)",
                    background: indicators[ind.id] ? "var(--brand)" : "transparent", color: "#fff",
                    display: "grid", placeItems: "center" }}>
                    {indicators[ind.id] && <Svg s={10}>{Ic.check}</Svg>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </span>
        <button className="btn ghost" style={{ padding: "6px 8px" }} onClick={undo} disabled={!canControl} aria-label="Undo"><Svg s={15}>{Ic.undo}</Svg></button>
        <button className="btn ghost" style={{ padding: "6px 8px" }} onClick={redo} disabled={!canControl} aria-label="Redo"><Svg s={15}>{Ic.redo}</Svg></button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 3, alignItems: "center" }}>
          {ZOOMS.map((z) => (
            <button key={z.l} className={"btn ghost " + (zoom === z.n ? "on" : "")} style={{ padding: "5px 10px", fontSize: 12.5 }}
              onClick={() => setZoom(z.n)}>{z.l}</button>
          ))}
          <button className={"btn ghost " + (logScale ? "on" : "")} style={{ padding: "5px 10px", fontSize: 12.5 }}
            onClick={() => setLog((l) => !l)}>log</button>
          <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 12.5 }} onClick={() => setHelpOpen(true)} title="Keyboard shortcuts">?</button>
        </div>
      </div>

      {/* challenge banner */}
      {challenge && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "8px 16px", flexWrap: "wrap",
          background: challenge.status === "failed" ? "var(--downSoft)" : challenge.status === "passed" ? "var(--upSoft)" : "var(--surface2)",
          borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <span className={"pill " + (challenge.status === "failed" ? "r" : challenge.status === "passed" ? "g" : "b")}>
            {challenge.status === "failed" ? "Challenge failed" : challenge.status === "passed" ? "Target reached" : "Challenge active"}
          </span>
          <span className="sm mut">{meta.challenge.label}</span>
          <span className="sm num">Worst day <b style={{ color: challenge.breachDaily ? "var(--down)" : "var(--ink)" }}>{challenge.worstDay.toFixed(2)}%</b>
            {meta.challenge.daily ? ` / ${meta.challenge.daily}%` : ""}</span>
          <span className="sm num">Drawdown <b style={{ color: challenge.breachTotal ? "var(--down)" : "var(--ink)" }}>{challenge.totalDD.toFixed(2)}%</b>
            {meta.challenge.total ? ` / ${meta.challenge.total}%` : ""}</span>
          {meta.challenge.target != null && (
            <span className="sm num">Profit <b style={{ color: challenge.profitPct >= meta.challenge.target ? "var(--up)" : "var(--ink)" }}>
              {challenge.profitPct.toFixed(2)}%</b> / {meta.challenge.target}%</span>
          )}
        </div>
      )}

      {/* ================= main ================= */}
      <div className="sim-main" style={{ display: "grid", gridTemplateColumns: "232px minmax(0,1fr) 292px", gap: 0, flex: 1, minHeight: 0 }}>

        {/* ---- left: market watch ---- */}
        <aside className="sim-left" style={{ borderRight: "1px solid var(--border)", background: "var(--surface)",
          display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "12px 14px 10px" }}>
            <div className="cap">Market watch</div>
          </div>
          <div className="scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {marketList.map((m) => {
              const s = SYMBOLS.find((x) => x.id === m.symbol);
              const on = m.symbol === symbol;
              return (
                <button key={m.symbol} disabled={!canControl} onClick={() => switchMarket(m.symbol, null)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                    padding: "9px 14px", border: "none", cursor: "pointer", fontFamily: "inherit",
                    background: on ? "var(--brandSoft)" : "transparent",
                    borderLeft: "2px solid " + (on ? "var(--brand)" : "transparent") }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: on ? 600 : 500,
                    color: on ? "var(--brand)" : "var(--ink)" }}>{s?.label || m.symbol}</span>
                  <span className="num sm mut">{m.price != null ? fmtPrice(m.price) : "—"}</span>
                  <span className="num sm" style={{ width: 50, textAlign: "right",
                    color: m.chg >= 0 ? "var(--up)" : "var(--down)" }}>
                    {m.chg >= 0 ? "+" : ""}{m.chg.toFixed(2)}%
                  </span>
                </button>
              );
            })}
          </div>
          <div className="sm mut" style={{ padding: "9px 14px", borderTop: "1px solid var(--border)", lineHeight: 1.5 }}>
            {tickers.length
              ? `Live prices — your chart is replaying ${cur ? fmtShort(cur.t) : fmtShort(meta.startMs)}`
              : "Live prices unavailable"}
          </div>
        </aside>

        {/* ---- centre: chart ---- */}
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* tool rail */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 5px",
              borderRight: "1px solid var(--border)", background: "var(--surface)" }}>
              {TOOLS.map((t) => (
                <button key={t.id} title={`${t.title}  (${t.key})`} aria-label={t.title}
                  disabled={!canControl && t.id !== "cursor"}
                  onClick={() => { setTool(t.id); if (t.id !== "cursor") setSelected(null); }}
                  style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none",
                    borderRadius: 7, cursor: "pointer",
                    background: tool === t.id ? "var(--brandSoft)" : "transparent",
                    color: tool === t.id ? "var(--brand)" : "var(--muted)" }}>
                  <Svg s={16}>{TOOL_ICONS[t.id]}</Svg>
                </button>
              ))}
              <div style={{ height: 1, background: "var(--border)", margin: "5px 3px" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: "0 5px" }}>
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setColorKey(c)} title={c} aria-label={`Colour ${c}`}
                    style={{ width: 14, height: 14, borderRadius: 4, cursor: "pointer", padding: 0,
                      background: `var(--${c})`, border: "2px solid " + (colorKey === c ? "var(--ink)" : "transparent") }} />
                ))}
              </div>
              <div style={{ height: 1, background: "var(--border)", margin: "5px 3px" }} />
              <button title="Clear all drawings" aria-label="Clear drawings" disabled={!canControl || !visibleDrawings}
                onClick={() => { if (confirm("Remove every drawing on this chart?")) { snapshot(); applyDrawings([]); setSelected(null); } }}
                style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none",
                  borderRadius: 7, cursor: "pointer", background: "transparent", color: "var(--muted)",
                  opacity: visibleDrawings ? 1 : 0.35 }}>
                <Svg s={16}>{Ic.trash}</Svg>
              </button>
            </div>

            {/* chart */}
            <div style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column" }}>
              <div className="num" style={{ position: "absolute", top: 8, left: 12, zIndex: 5,
                pointerEvents: "none", fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>
                  {SYMBOLS.find((s) => s.id === symbol)?.label} · {INTERVALS.find((i) => i.id === interval)?.label} · PipTest
                </span>
                {cur && (
                  <span className="mut" style={{ marginLeft: 10 }}>
                    O <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.o)}</b>{" "}
                    H <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.h)}</b>{" "}
                    L <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.l)}</b>{" "}
                    C <b style={{ color: cur.c >= cur.o ? "var(--up)" : "var(--down)" }}>{fmtPrice(cur.c)}</b>
                  </span>
                )}
              </div>

              {loading ? (
                <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 13 }}>
                  Loading {INTERVALS.find((i) => i.id === interval)?.label} candles…
                </div>
              ) : (
                <ReplayChart
                  bars={bars} cursor={cursor} theme={theme} T={T} interval={interval} trade={trade} height={undefined}
                  drawings={drawings} onDrawings={canControl ? applyDrawings : () => {}}
                  onSnapshot={canControl ? snapshot : () => {}}
                  tool={canControl ? tool : "cursor"} setTool={setTool} colorKey={colorKey}
                  selected={selected} setSelected={setSelected} indicators={indicators}
                  logScale={logScale} zoom={zoom} onNeedOlder={loadOlder}
                />
              )}

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 12px",
                borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--dim)", flexWrap: "wrap" }}>
                <span>
                  {tool === "cursor"
                    ? selected ? "Drag to move · handles to reshape · Delete to remove"
                      : `${visibleDrawings} drawing${visibleDrawings === 1 ? "" : "s"} · press ? for shortcuts`
                    : `${TOOLS.find((t) => t.id === tool)?.title} · drag on the chart · Esc to cancel`}
                </span>
                <span className="num">
                  bar {cursor + 1} / {bars.length}
                  {shortFrom && ` · no ${interval} data before ${fmtShort(shortFrom)}`}
                  {!canControl && ` · view only, following ${room?.host}`}
                </span>
              </div>
            </div>
          </div>

          {/* the replay transport now floats — rendered near the end of this
              component so it can sit anywhere over the workspace */}

          {/* ---- blotter ---- */}
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 2, padding: "0 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              {[["trades", `Trades (${trades.length})`], ["orders", "Orders"], ["positions", "Positions"], ["notes", "Notes"]].map(([id, l]) => (
                <button key={id} className={"tab " + (tab === id ? "on" : "")} onClick={() => setTab(id)}>{l}</button>
              ))}
            </div>
            <div className="scroll" style={{ maxHeight: 216, overflowY: "auto" }}>
              {tab === "trades" && (trades.length === 0
                ? <Empty title="No closed trades yet" body="Arm a setup on the right, then advance the replay." />
                : (
                  <table className="tbl">
                    <thead><tr>{["Market", "Side", "Entry", "Exit", "Stop", "R", "P&L", "Exit reason", "Time"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 500 }}>{SYMBOLS.find((s) => s.id === t.symbol)?.label || t.symbol}</td>
                          <td style={{ color: t.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>{t.dir === "long" ? "Long" : "Short"}</td>
                          <td>{fmtPrice(t.entry)}</td><td>{fmtPrice(t.exit)}</td><td className="mut">{fmtPrice(t.stop)}</td>
                          <td style={{ fontWeight: 600, color: t.pnl > 0 ? "var(--up)" : t.pnl < 0 ? "var(--down)" : "var(--muted)" }}>{fmtR(t.r)}</td>
                          <td style={{ color: t.pnl > 0 ? "var(--up)" : t.pnl < 0 ? "var(--down)" : "var(--muted)" }}>{fmtSigned(t.pnl)}</td>
                          <td className="mut" style={{ fontSize: 12 }}>{t.reason}</td>
                          <td className="mut" style={{ fontSize: 12 }}>{fmtShort(t.closedTs || t.closedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}

              {tab === "orders" && (trade?.status === "watching"
                ? <SingleRow trade={trade} symbol={symbol} kind="order" onCancel={() => setTrade(null)} />
                : <Empty title="No working orders" body="Arm a setup to place a resting order at your entry price." />)}

              {tab === "positions" && (trade?.status === "open"
                ? <SingleRow trade={trade} symbol={symbol} kind="position" unreal={unreal} onClose={closeNow} onBE={moveStopToBE} />
                : <Empty title="No open position" />)}

              {tab === "notes" && (
                <div style={{ padding: 14 }}>
                  <textarea className="in" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder={"What are you watching for in this session?\n\nBullish market structure\nLiquidity sweep of the lows\nWaiting for a break and retest"} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ---- right: order ticket ---- */}
        <aside className="sim-right" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto", minHeight: 0 }}>
          <div style={{ padding: 14 }}>
            <div className="cap" style={{ marginBottom: 12 }}>Setup</div>

            {trade ? (
              <OpenTicket trade={trade} price={price} unreal={unreal} onClose={closeNow} onBE={moveStopToBE}
                onCancel={() => setTrade(null)} />
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {["long", "short"].map((d) => (
                    <button key={d} onClick={() => setForm((f) => ({ ...f, dir: d }))}
                      className={"btn " + (form.dir === d ? (d === "long" ? "buy" : "sell") : "")}
                      style={{ flex: 1 }}>{d === "long" ? "Long" : "Short"}</button>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  <Field label="Entry">
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="in" value={form.entry} placeholder={price ? fmtPrice(price) : ""}
                        onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
                      <button className="btn" style={{ padding: "0 11px", fontSize: 12 }}
                        onClick={() => setForm((f) => ({ ...f, entry: price ? price.toFixed(dec(price)) : "" }))}>Now</button>
                    </div>
                  </Field>
                  <Field label="Stop loss">
                    <input className="in" value={form.stop} placeholder="—"
                      onChange={(e) => setForm((f) => ({ ...f, stop: e.target.value }))} />
                  </Field>
                  <Field label="Take profit">
                    <input className="in" value={form.target} placeholder="optional"
                      onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                  </Field>
                  <Field label="Risk % of equity">
                    <input className="in" type="number" min="0.01" max="100" step="0.1" value={form.riskPct}
                      onChange={(e) => setForm((f) => ({ ...f, riskPct: e.target.value }))} />
                  </Field>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", marginTop: 8,
                  borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span className="mut">R:R</span>
                  <span className="num" style={{ fontWeight: 600 }}>{rr ? rr.toFixed(2) : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", fontSize: 13,
                  borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
                  <span className="mut">Position size</span>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {projQty ? `${projQty.toFixed(4)} (${fmtMoney(projQty * entryVal)})` : "—"}
                  </span>
                </div>

                <Field label="Tags">
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {tags.slice(0, 6).map((t) => (
                      <button key={t} className={"btn " + (formTags.includes(t) ? "on" : "")}
                        style={{ padding: "4px 9px", fontSize: 11.5 }}
                        onClick={() => setFormTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}>{t}</button>
                    ))}
                  </div>
                </Field>

                {(setupErrors.length > 0 || formErr) && (
                  <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", borderRadius: 8,
                    padding: "9px 11px", margin: "12px 0" }}>
                    {(setupErrors.length ? setupErrors : [formErr]).map((m, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--down)", lineHeight: 1.55 }}>{m}</div>
                    ))}
                  </div>
                )}
                {form.entry === "" && price && form.stop && setupErrors.length === 0 && (
                  <div className="sm mut" style={{ margin: "10px 0" }}>Entry blank — using {fmtPrice(price)}.</div>
                )}

                <button className="btn pri" style={{ width: "100%", marginTop: 12, padding: 10 }}
                  disabled={!form.stop || setupErrors.length > 0} onClick={() => arm(false)}>
                  <Svg s={14}>{Ic.plus}</Svg>Arm setup
                </button>
                <button className="btn" style={{ width: "100%", marginTop: 7 }}
                  disabled={!form.stop || !price || setupErrors.length > 0} onClick={() => arm(true)}>
                  Enter at market
                </button>
              </>
            )}
          </div>

          <div style={{ height: 1, background: "var(--border)" }} />

          <div style={{ padding: 14 }}>
            <div className="cap" style={{ marginBottom: 12 }}>This session</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["Equity", fmtMoney(equity + unreal), null],
                ["Total R", stats.count ? fmtR(stats.totalR) : "—", stats.totalR > 0 ? "up" : stats.totalR < 0 ? "down" : null],
                ["Win rate", stats.count ? `${stats.winRate.toFixed(0)}%` : "—", null],
                ["Profit factor", stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2), null],
                ["Avg R", stats.count ? fmtR(stats.avgR) : "—", null],
                ["Max DD", stats.count ? fmtMoney(stats.maxDD) : "—", stats.maxDD > 0 ? "down" : null]].map(([l, v, tone]) => (
                <div key={l}>
                  <div className="cap" style={{ marginBottom: 3 }}>{l}</div>
                  <div className="num" style={{ fontSize: 15, fontWeight: 600,
                    color: tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--ink)" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* ================= floating replay bar ================= */}
      <FloatingBar
        pos={barPos}
        onPos={setBarPos}
        collapsed={barCollapsed}
        onToggleCollapse={() => setBarCollapsed((c) => !c)}
        minWidth={560}
        label="Replay"
      >
        <div style={{ padding: "6px 10px" }}>
          {/* one row: transport, speed, scrubber, clock — keeps the bar shallow
              so it covers as little of the chart as possible */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={playing ? "live" : ""} title={playing ? "Playing" : "Paused"}
              style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                background: playing ? "var(--up)" : "var(--dim)" }} />

            <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
              <button className="btn ghost" style={{ padding: "4px 7px" }} disabled={!canControl}
                onClick={() => setCursor(0)} title="Back to the start"><Svg s={13}>{Ic.start}</Svg></button>
              <button className="btn ghost" style={{ padding: "4px 7px" }} disabled={!canControl}
                onClick={() => setCursor((c) => Math.max(0, c - 1))} title="Step back (←)"><Svg s={13}>{Ic.back}</Svg></button>
              <button className="btn pri" style={{ padding: "4px 11px" }} disabled={!canControl}
                onClick={() => setPlaying((p) => !p)} title="Play / pause (space)">
                <Svg s={13}>{playing ? Ic.pause : Ic.play}</Svg>
              </button>
              <button className="btn ghost" style={{ padding: "4px 7px" }} disabled={!canControl}
                onClick={() => setCursor((c) => Math.min(bars.length - 1, c + 1))} title="Step forward (→)"><Svg s={13}>{Ic.fwd}</Svg></button>
            </div>

            <select className="in" value={speed} disabled={!canControl}
              onChange={(e) => setSpeed(+e.target.value)}
              title="Replay speed"
              style={{ width: 66, padding: "4px 6px", fontSize: 12.5, flexShrink: 0 }}>
              {SPEEDS.map((sp) => <option key={sp} value={sp}>{sp}&times;</option>)}
            </select>

            <input type="range" min={0} max={Math.max(0, bars.length - 1)} value={cursor} disabled={!canControl}
              onChange={(e) => setCursor(+e.target.value)}
              title={`Bar ${cursor + 1} of ${bars.length}`}
              style={{ flex: 1, minWidth: 90, accentColor: T.brand, margin: 0 }} />

            <span className="num" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
              {cur ? fmtClock(cur.t, interval) : ""}
            </span>
          </div>
        </div>
      </FloatingBar>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <style>{`
        .sim-right { scrollbar-width: thin; }
        @media (max-width: 1200px) {
          .sim-main { grid-template-columns: minmax(0,1fr) 280px !important; }
          .sim-left { display: none !important; }
        }
        @media (max-width: 900px) {
          .sim-main { grid-template-columns: 1fr !important; }
          .sim-right { border-left: none !important; border-top: 1px solid var(--border); }
          .hide-sm { display: none !important; }
        }
      `}</style>
    </div>
  );
}

/* ---------- pieces ---------- */
function OpenTicket({ trade, price, unreal, onClose, onBE, onCancel }) {
  const rr = trade.target != null ? Math.abs(trade.target - trade.entry) / Math.abs(trade.entry - trade.stop) : null;
  const rNow = trade.riskAmt ? unreal / trade.riskAmt : 0;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className={"pill " + (trade.dir === "long" ? "g" : "r")}>{trade.dir === "long" ? "Long" : "Short"}</span>
        <span className={"pill " + (trade.status === "open" ? "b" : "n")}>
          {trade.status === "open" ? "Open" : "Watching"}
        </span>
      </div>
      {[["Entry", fmtPrice(trade.entry)], ["Stop loss", fmtPrice(trade.stop)],
        ["Take profit", trade.target != null ? fmtPrice(trade.target) : "—"],
        ["Size", `${trade.qty}`], ["Risk", `${trade.riskPct.toFixed(1)}% · ${fmtMoney(trade.riskAmt)}`],
        ["R:R", rr ? rr.toFixed(2) : "—"]].map(([l, v]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0",
          borderBottom: "1px solid var(--border)", fontSize: 13 }}>
          <span className="mut">{l}</span><span className="num" style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ))}
      {trade.status === "open" && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", fontSize: 13 }}>
          <span className="mut">Open P&L</span>
          <span className="num" style={{ fontWeight: 700, color: unreal >= 0 ? "var(--up)" : "var(--down)" }}>
            {fmtSigned(unreal)} · {fmtR(rNow)}
          </span>
        </div>
      )}
      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {trade.status === "open" && (
          <>
            <button className="btn pri" onClick={onClose}>Close at market</button>
            <button className="btn" onClick={onBE} disabled={trade.stop === trade.entry}>
              {trade.stop === trade.entry ? "Stop at breakeven" : "Move stop to breakeven"}
            </button>
          </>
        )}
        <button className="btn" onClick={onCancel}>{trade.status === "open" ? "Discard position" : "Cancel order"}</button>
      </div>
    </>
  );
}

function SingleRow({ trade, symbol, kind, unreal, onClose, onBE, onCancel }) {
  const s = SYMBOLS.find((x) => x.id === symbol);
  return (
    <table className="tbl">
      <thead>
        <tr>{(kind === "order"
          ? ["Market", "Side", "Entry", "Stop", "Target", "Size", "Status", ""]
          : ["Market", "Side", "Entry", "Stop", "Size", "Risk", "Open P&L", ""]).map((h) => <th key={h}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ fontWeight: 500 }}>{s?.label || symbol}</td>
          <td style={{ color: trade.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>
            {trade.dir === "long" ? "Long" : "Short"}
          </td>
          <td>{fmtPrice(trade.entry)}</td>
          <td>{fmtPrice(trade.stop)}</td>
          {kind === "order" ? <td>{trade.target != null ? fmtPrice(trade.target) : "—"}</td> : null}
          <td>{trade.qty}</td>
          {kind === "order"
            ? <td><span className="pill b">Watching</span></td>
            : <><td>{fmtMoney(trade.riskAmt)}</td>
              <td style={{ fontWeight: 600, color: unreal >= 0 ? "var(--up)" : "var(--down)" }}>
                {fmtSigned(unreal)} · {fmtR(trade.riskAmt ? unreal / trade.riskAmt : 0)}
              </td></>}
          <td>
            {kind === "order"
              ? <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} onClick={onCancel}>Cancel</button>
              : <span style={{ display: "flex", gap: 5 }}>
                  <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} onClick={onBE}>BE</button>
                  <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }} onClick={onClose}>Close</button>
                </span>}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function RoomPanel({ room, isHost, account, joinCode, setJoinCode, roomMsg, hostRoom, joinRoom, leaveRoom, setRole, onClose }) {
  return (
    <div className="card" data-pop style={{ position: "absolute", right: 0, top: 36, zIndex: 60, padding: 15, width: 272 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className="cap">Live room</span>
        <button className="btn ghost" style={{ padding: "2px 7px" }} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {!room ? (
        <>
          <button className="btn pri" style={{ width: "100%", marginBottom: 12 }} onClick={hostRoom}>Share this chart</button>
          <Field label="Join with a code">
            <div style={{ display: "flex", gap: 6 }}>
              <input className="in" value={joinCode} maxLength={6} placeholder="ABC123"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
              <button className="btn" onClick={joinRoom}>Join</button>
            </div>
          </Field>
        </>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div className="num" style={{ fontSize: 21, fontWeight: 700, letterSpacing: ".08em" }}>{room.code}</div>
              <div className="sm mut">host {room.host}</div>
            </div>
            <button className="btn" onClick={leaveRoom}>Leave</button>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {Object.entries(room.participants || {}).map(([who, info]) => (
              <div key={who} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="sm" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {who}{who === account.handle ? " (you)" : ""}
                </span>
                <span className={"pill " + (info.role === "viewer" ? "n" : "b")}>{info.role}</span>
                {isHost && info.role !== "host" && (
                  <button className="btn ghost" style={{ padding: "2px 7px", fontSize: 11 }}
                    onClick={() => setRole(who, info.role === "editor" ? "viewer" : "editor")}>
                    {info.role === "editor" ? "Revoke" : "Edit"}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="sm mut" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Playback and drawings sync to everyone. Trades stay individual.
          </div>
        </>
      )}
      {roomMsg && <div className="sm" style={{ color: "var(--brand)", marginTop: 11, lineHeight: 1.5 }}>{roomMsg}</div>}
    </div>
  );
}

function ShortcutHelp({ open, onClose }) {
  const rows = [
    ["Space", "Play / pause replay"], ["→ / ←", "Step one bar forward / back"],
    ["Shift + → / ←", "Step ten bars"], ["V", "Cursor"], ["T", "Trend line"], ["R", "Ray"],
    ["H", "Horizontal line"], ["L", "Vertical line"], ["B", "Rectangle"], ["F", "Fib retracement"],
    ["M", "Measure"], ["Delete", "Remove selected drawing"], ["Esc", "Cancel tool / deselect"],
    ["Ctrl/⌘ Z", "Undo drawing"], ["Ctrl/⌘ ⇧ Z", "Redo drawing"], ["?", "This panel"],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width={440}>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(([k, d]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span className="sm mut">{d}</span>
            <kbd className="mono" style={{ fontSize: 11.5, background: "var(--surface3)", border: "1px solid var(--border)",
              borderRadius: 5, padding: "3px 8px", whiteSpace: "nowrap" }}>{k}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
