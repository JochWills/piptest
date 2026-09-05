import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, Field, Stat, Empty, Modal, Svg, Ic } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import Avatar from "../components/Avatar.jsx";
import FloatingBar, { defaultBarPos } from "../components/FloatingBar.jsx";
import TVAdvancedChart from "../tv/TVAdvancedChart.jsx";
import { IV_TO_TV_RES, TV_RES_TO_IV } from "../tv/marketFeed.js";
import { SYMBOLS, INTERVALS, barMsOf } from "../theme.js";
import {
  validateSetup, buildSetup, runEngine, bookTrade, openPnl, computeStats, rrOf,
  evaluateChallenge, fmtPrice, fmtMoney, fmtSigned, fmtR, fmtClock, fmtShort, dec,
  START_BALANCE, uid, makeCode,
} from "../lib/trading.js";
import { store, K } from "../lib/store.js";
import * as data from "../lib/data.js";
import { censor } from "../lib/profanity.js";
import { API_ENABLED } from "../lib/api.js";
import { connectRoomSocket } from "../lib/roomSocket.js";

/* Below this bar-index no saved `cursor` could plausibly be a real
   millisecond timestamp (that's a UNIX time somewhere in 1970) — it's a
   leftover from before this file switched the replay cursor from a bar
   index to a timestamp. Treated as "unrecognised", not "corrupt": the
   session just resumes from its configured start date instead of the
   exact bar it was left on. */
const LEGACY_CURSOR_CUTOFF = 1e12;

export default function Simulator({ meta, account, theme, T, onExit, onSaveSession, onTradesClosed, onToggleTheme, onNav, onSignOut, sessions = [], autoJoinCode, onAutoJoinDone }) {
  /* ---------- market ---------- */
  const [symbol, setSymbol] = useState(meta.symbol);
  const [interval, setIv] = useState(meta.interval);

  /* ---------- replay ----------
     `cursor` is a TIMESTAMP (ms) now, not a bar index — the datafeed in
     src/tv/ owns fetching/paging, so there's no local `bars` array to
     index into any more. `cur` (the current bar) comes straight off
     onBar/onCursor instead of being derived by indexing anything.
     chartStartRef is the widget's mount-time replay start: it only ever
     changes at a handful of reset points (switchInterval, session restore,
     a room resync), deliberately never on every tick, because
     TVAdvancedChart fully remounts the widget whenever its
     startMs prop changes — wiring that straight to the live cursor would
     remount on every single revealed bar. */
  const [cursor, setCursor] = useState(meta.startMs);
  const chartStartRef = useRef(meta.startMs);
  const [cur, setCur] = useState(null);
  const prevCloseRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  /* how much calendar time one "next" click or one play-tick advances,
     as an INTERVALS id (e.g. "30m") — independent of the chart's own
     displayed interval. stepMs below turns that into milliseconds. */
  const [stepId, setStepId] = useState("1m");
  const chartCtlRef = useRef(null);
  const [chartReady, setChartReady] = useState(false);
  /* bumped on every drawing/study edit (see handleDrawingsChanged) purely
     so the autosave effect below has something to react to — drawing a
     trendline while paused doesn't touch trades/cursor/notes/symbol/interval
     on its own, so without this the layout only got persisted incidentally
     whenever one of those *also* happened to change. */
  const [layoutTick, setLayoutTick] = useState(0);
  /* Replay is forward-only by design — no rewinding once you've seen how
     a bar played out, same as a real market. This ring buffer of
     recently-seen bar timestamps, oldest first, used to also back
     stepping backward through them (removed); what's left of its job is
     letting stepForward catch up cheaply through anything already seen —
     e.g. right after a room resync — instead of always asking the
     datafeed for a fresh bar. Restore (below) may reset the whole thing
     to a saved position before the widget ever mounts. */
  const seenRef = useRef([meta.startMs]);
  const seenIdxRef = useRef(0);
  /* index-aligned with seenRef — the full {t,o,h,l,c,v} bar for every
     entry that's actually been revealed (handleBar), or null for the
     one bare anchor timestamp seenRef starts life with (mount/restore/
     switchInterval — nothing's been revealed at that position yet, so
     there's no bar to show). Lets stepForward update the displayed
     clock/price/OHLC immediately when it catches up through already-seen
     history, instead of only on a freshly revealed bar. */
  const seenBarsRef = useRef([null]);

  /* ---------- trading ---------- */
  const [trade, setTrade] = useState(null);
  const [trades, setTrades] = useState([]);
  /* A room guest's mirror of the HOST's current trade — see
     canTrade below and the "trade mirror" section further down for
     why this can't just be `trade` itself. Reset whenever the room
     changes so a stale trade from a previous room can't linger. */
  const [hostTrade, setHostTrade] = useState(null);
  const [form, setForm] = useState({ dir: "long", entry: "", stop: "", target: "", riskPct: "1.0" });
  const [formErr, setFormErr] = useState("");
  const [notes, setNotes] = useState("");
  const [tab, setTab] = useState("trades");
  const [blotterH, setBlotterH] = useState(216);
  /* Pointer capture, not window mousemove/mouseup — the chart above this
     handle is a TradingView iframe, a separate document. A plain window
     listener stops receiving events the instant the cursor crosses into
     it, which is exactly what a quick upward drag does (the handle sits
     right at the chart's bottom edge), making the drag feel like it
     "sticks" or stops responding. Pointer capture keeps delivering events
     to this element regardless of what's under the cursor — same fix
     FloatingBar already uses for its own drag. */
  const blotterDrag = useRef(null);
  const onBlotterResizeStart = useCallback((e) => {
    blotterDrag.current = { startY: e.clientY, startH: blotterH };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  }, [blotterH]);
  const onBlotterResizeMove = useCallback((e) => {
    const d = blotterDrag.current;
    if (!d) return;
    setBlotterH(Math.min(560, Math.max(80, d.startH - (e.clientY - d.startY))));
  }, []);
  const onBlotterResizeEnd = useCallback((e) => {
    if (!blotterDrag.current) return;
    blotterDrag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  }, []);

  /* ---------- chart chrome ----------
     Drawing tools, indicators, log/linear, zoom presets are all the
     library's own now (its native left toolbar and legend) — nothing
     left here to own that state on PipTest's side. */
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  /* ---------- room ---------- */
  const [room, setRoom] = useState(null);
  const [roomOpen, setRoomOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [roomMsg, setRoomMsg] = useState("");
  /* just a UI indicator (RoomPanel) — nothing else reads this, since
     every consumer of the socket's health checks roomSocketRef
     directly at the moment it matters instead of re-rendering on it. */
  const [wsLive, setWsLive] = useState(false);
  const pushRef = useRef(0), appliedRef = useRef(0), missRef = useRef(0);
  /* Only the host can ever push chart state, and a freshly-joined
     guest's own local symbol/interval/cursor/stepId/playing is still
     whatever placeholder joinRoomFromDashboard made up, not the room's
     real state, until the first poll below actually syncs it. Without
     this guard, pushRoom could fire on that very first render and
     clobber the host's real cursor with the guest's placeholder
     garbage. True for the host right away (their own local state IS the
     room's state, by construction). For a joining guest this can't
     just be set the moment the poll *attempts* a correction
     (chartStartRef reassignment or jumpTo) — both are asynchronous (a
     remount's onReady, a jumpTo's bar lookup), and the widget can
     independently deliver its OWN still-uncorrected cursor in the
     meantime, which used to get waved through as "synced" and pushed
     straight back out, corrupting the room for everyone. It's only set
     once handleCursor actually observes a cursor landing near where
     lastKnownDocCursorRef says the room really is. */
  const roomSyncedRef = useRef(false);
  const lastKnownDocCursorRef = useRef(null);

  /* ---------- room chat ----------
     Lives inside the room doc itself (kv row), so it's gone the
     moment the room is deleted — nothing to separately expire. */
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const chatSeenRef = useRef(0);

  const [barPos, setBarPos] = useState(() => defaultBarPos());
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [restored, setRestored] = useState(false);
  const [saveState, setSaveState] = useState("saved");
  const [helpOpen, setHelpOpen] = useState(false);

  /* ---------- fullscreen ----------
     Deliberately scoped to the whole page root, not just the chart —
     see TVAdvancedChart's own disabled_features comment for why the
     library's built-in fullscreen button had to go: it only fullscreens
     its own iframe, so the replay bar and trade ticket (both outside
     it) would just vanish behind it with no CSS fix possible. Fullscreening
     this component's own root keeps everything — header, chart, replay
     bar, ticket — in the same fullscreened element, so nothing changes
     about how they're laid out or drawn over each other.
     `fullscreen` state, not a read of document.fullscreenElement at
     render time: it also has to track exits the button never caused
     (Escape, the browser's own "Exit full screen" bar), which only the
     fullscreenchange event reports.
     No button lives in PipTest's own header for this — `fullscreen` and
     `toggleFullscreen` are instead handed down to TVAdvancedChart, which
     puts a real button back where the library's own used to be (next to
     the screenshot icon, in its header). See its own comment for why
     that's a live DOM graft rather than the documented createButton API,
     and for the fallback if that graft ever comes up empty. Either way
     the plain "f" shortcut below still works even if no button is
     visible anywhere. */
  const pageRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === pageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else pageRef.current?.requestFullscreen?.();
  }, []);

  const role = room ? room.participants?.[account.handle]?.role || "viewer" : "host";
  const isHost = room && room.participants?.[account.handle]?.role === "host";
  /* Sharing a session is view-only, full stop: a guest watches, the
     host trades and drives playback, and there's no role in between —
     no promoting a guest to co-pilot the chart, no order ticket or
     trade actions of their own. Solo (no room) always both. A guest's
     chart/ticket/blotter still needs to reflect the host's trade
     though (see hostTrade and the "trade mirror" section below) —
     displayTrade is "whichever trade is actually mine to look at": my
     own when I can trade, otherwise the host's mirrored copy. */
  const canControl = !room || role === "host";
  const canTrade = !room || isHost;
  const displayTrade = canTrade ? trade : hostTrade;

  /* the widget only reads canDraw at mount, so gaining or losing
     control — joining a room as a guest, leaving one, being kicked —
     has to remount it, same tradeoff as an actual timeframe switch.
     Freeze the position first, exactly like switchInterval does, so
     the remount lands back where the replay actually is rather than
     snapping to wherever the widget last mounted. */
  const canControlRef = useRef(canControl);
  useEffect(() => {
    if (canControlRef.current === canControl) return;
    canControlRef.current = canControl;
    const at = cur?.t ?? cursor;
    chartStartRef.current = at;
    seenRef.current = [at]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
  }, [canControl]); // eslint-disable-line

  /* the chosen step size, in calendar milliseconds. What that actually
     means in bars depends on whether it's at/above the chart's own bar
     duration (whole chart-resolution candles, handled entirely by the
     seen-buffer walk below) or below it (sub-bar candle-building,
     handled by control.step in datafeed.js — see stepMs there). */
  const stepMs = useMemo(() => barMsOf(stepId), [stepId]);

  const price = cur?.c ?? null;
  /* Chosen once, at session creation (see Dashboard's "Starting balance"
     field) — meta.startBalance is missing only for sessions saved before
     that field existed, which is what the fallback is for. */
  const startBalance = meta.startBalance || START_BALANCE;
  const stats = useMemo(() => computeStats(trades, startBalance), [trades, startBalance]);
  const equity = stats.equity;
  const unreal = openPnl(displayTrade, price);
  const chg = cur && prevCloseRef.current != null ? cur.c - prevCloseRef.current : 0;
  const chgPct = cur && prevCloseRef.current ? (chg / prevCloseRef.current) * 100 : 0;
  const challenge = useMemo(() => evaluateChallenge(trades, meta.challenge, startBalance), [trades, meta.challenge, startBalance]);

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

  /* ================= restore =================
     Chart layout (drawings/indicators/settings) is restored via the
     widget's own api.load() once it's ready — see the onReady handler
     below — rather than as React state here. */
  const pendingLayoutRef = useRef(null);
  /* The room's latest known chart state, refreshed by every poll. No
     queueing counterpart to pendingLayoutRef for drawings: the
     reconciler effect further down compares against this whenever it
     ticks, so "the widget wasn't up yet" needs no special case. */
  const roomChartRef = useRef(null);
  useEffect(() => {
    (async () => {
      const body = await data.getSessionState(meta.id);
      if (body) {
        const savedCursor = typeof body.cursor === "number" && body.cursor >= LEGACY_CURSOR_CUTOFF ? body.cursor : meta.startMs;
        setCursor(savedCursor);
        chartStartRef.current = savedCursor;
        seenRef.current = [savedCursor]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
        setTrades(body.trades || []);
        setTrade(body.trade || null);
        pendingLayoutRef.current = body.layout || null;
        setNotes(body.notes || "");
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

  /* ================= chart ready / bar feed =================
     The widget (src/tv/) owns fetching, paging and the replay clock
     itself now — this just wires its output into the trade engine and
     PipTest's own state, and converts its {time,open,high,low,close}
     bars to the {t,o,h,l,c} shape the rest of this file already uses. */
  const tradeRef = useRef(null);
  useEffect(() => { tradeRef.current = trade; }, [trade]);
  /* handleBar (below) is memoized narrowly ([onTradesClosed]) so it
     doesn't go stale mid-play, same reasoning as tradeRef — these
     back it with the current symbol/interval/room for the room
     WebSocket broadcast without widening that dependency array. */
  const symbolRef = useRef(symbol);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  const intervalRef = useRef(interval);
  useEffect(() => { intervalRef.current = interval; }, [interval]);
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);
  /* the room's real-time relay connection (see roomSocket.js /
     server/ws.js) — opened/closed by the effect further down,
     alongside the existing REST poll which keeps running unmodified
     as the fallback if this is ever unavailable. */
  const roomSocketRef = useRef(null);

  const toNative = (b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume });

  const handleReady = useCallback((api) => {
    chartCtlRef.current = api;
    setChartReady(true);
    /* a fresh widget instance has nothing loaded onto it yet, no
       matter what was loaded onto whatever instance came before it, so
       this can't just leave lastAppliedLayoutRef holding a stale value
       from the torn-down instance — a poll's content-comparison would
       wrongly conclude "already applied" and skip it forever on the
       new one. But *only* nulling it and leaving the actual apply to
       "whichever poll happens to run next" raced with this same
       pendingLayoutRef apply below — two near-simultaneous load()
       calls on a chart that just mounted is what was throwing real
       (uncaught, async) errors out of the library's own
       setVisibleRange. Applying here AND marking it applied in the
       same breath closes that race: a poll landing right after this
       sees content that already matches and skips, instead of
       queuing its own redundant call. */
    if (pendingLayoutRef.current) {
      const snap = pendingLayoutRef.current;
      pendingLayoutRef.current = null;
      lastAppliedLayoutRef.current = JSON.stringify(snap);
      api.load(snap);
    } else {
      lastAppliedLayoutRef.current = null;
    }
    /* Mirrored drawings just get forgotten here rather than re-applied
       — a new widget carries none of the previous one's, and
       TVAdvancedChart's key->id map went with it, so this has to start
       from scratch. The reconciler effect further down notices the
       mismatch and re-mirrors on its next tick. Doing it there instead
       of here on purpose: at this moment the chart is "ready" but its
       bars may still be arriving, and shapes created against data that
       isn't there yet come out malformed. */
    lastAppliedDrawingsRef.current = null;
  }, []);

  const handleBar = useCallback((rawBar, stepRes) => {
    const b = toNative(rawBar);
    setCur((prevBar) => { prevCloseRef.current = prevBar?.c ?? prevCloseRef.current; return b; });
    const last = seenRef.current[seenRef.current.length - 1];
    if (last !== b.t) {
      seenRef.current.push(b.t); seenBarsRef.current.push(b);
      if (seenRef.current.length > 500) { seenRef.current.shift(); seenBarsRef.current.shift(); }
    }
    seenIdxRef.current = seenRef.current.length - 1;

    /* broadcast every bar WE reveal locally to the room's real-time
       relay, so a viewer's chart can extend forward the instant it
       happens instead of waiting on the next poll — see roomSocket.js
       and control.pushRemoteBar in datafeed.js. Only the host's own
       local stepping ever reaches here with canControl true; a
       pure viewer's bars arrive via applyRemoteBar instead (below),
       which re-fires this same callback — canControlRef being false
       there is what stops it echoing straight back out. */
    if (canControlRef.current && roomRef.current) {
      roomSocketRef.current?.send({
        type: "bar", symbol: symbolRef.current, resolution: IV_TO_TV_RES[intervalRef.current] || "30", subRes: stepRes,
        time: rawBar.time, open: rawBar.open, high: rawBar.high, low: rawBar.low, close: rawBar.close, volume: rawBar.volume,
      });
    }

    const t0 = tradeRef.current;
    if (t0) {
      const { trade: t1, closed } = runEngine(t0, [b], -1, 0);
      if (closed.length) {
        /* tagged with the session it happened in, so deleting the
           session can take its trades with it — see deleteSession in
           App.jsx and the matching server-side cascade. */
        const tagged = closed.map((c) => ({ ...c, sessionId: meta.id }));
        setTrades((list) => [...tagged.slice().reverse(), ...list]);
        onTradesClosed && onTradesClosed(tagged);
      }
      if (t1 !== t0) {
        setTrade(t1);
        /* a stop/target hit during play is the one trade transition
           with no button click behind it anywhere else in this file
           to hang a broadcast off — this is the only place it happens. */
        broadcastTradeRef.current?.(t1, closed.length ? closed : undefined);
      }
    }
  }, [onTradesClosed, meta.id]);

  const handleCursor = useCallback((ms, rawBar) => {
    setCursor(ms);
    if (rawBar) {
      setCur((prevBar) => { prevCloseRef.current = prevBar?.c ?? prevCloseRef.current; return toNative(rawBar); });
      /* The ring buffer's index 0 starts life as a bare anchor with no
         bar attached (see seenBarsRef's own declaration) — nothing's
         been revealed at that exact position yet at the point it's
         created. But setMarket's own realign() (see replayController.js)
         fetches a real bar for that same moment moments later, right
         here, and that's the only bar this position will ever get: it
         doesn't come from handleBar (nothing was "stepped" to reach it)
         and applySeenBar has no bar to substitute either. Without this,
         stepping back all the way to the start leaves the display
         showing whatever the last real step left on screen — a stale
         reading dressed up as the session's actual start — rather than
         going stale outright, since the fields still look plausible. */
      if (!seenBarsRef.current[0] && seenRef.current[0] === ms) seenBarsRef.current[0] = toNative(rawBar);
    }
    /* confirm room-sync only once a cursor actually lands near where the
       room doc says it should be — see roomSyncedRef's own comment for
       why "we attempted a correction" isn't good enough on its own. A
       day's tolerance is generous on purpose: this is only distinguishing
       "landed in the right neighbourhood" from "still showing a stale
       placeholder that can be months/years off", not checking bar-level
       precision (jumpTo/the drift-check elsewhere already handle that). */
    if (!roomSyncedRef.current && lastKnownDocCursorRef.current != null
        && Math.abs(ms - lastKnownDocCursorRef.current) < 86400000) {
      roomSyncedRef.current = true;
    }
  }, []);

  /* ================= actions ================= */
  const closeNow = () => {
    const t = tradeRef.current;
    if (!t || !price) return;
    if (t.status === "watching") { setTrade(null); broadcastTrade(null); return; }
    const rec = { ...bookTrade(t, price, "manual", cur?.t), sessionId: meta.id };
    setTrades((l) => [rec, ...l]);
    onTradesClosed && onTradesClosed([rec]);
    setTrade(null);
    broadcastTrade(null, [rec]);
  };

  const arm = (atMarket) => {
    if (!canTrade) return;
    const e = atMarket ? price : entryVal;
    const errs = validateSetup({ dir: form.dir, entry: e, stop: form.stop, target: form.target, riskPct: form.riskPct, equity, price });
    if (errs.length) { setFormErr(errs[0]); return; }
    setFormErr("");
    const t = buildSetup({ ...form, entry: e, equity, symbol, interval, note: "", atMarket, ts: cur?.t });
    setTrade(t);
    broadcastTrade(t);
  };

  const moveStopToBE = () => {
    setTrade((t) => {
      const next = t && t.status === "open" ? { ...t, stop: t.entry } : t;
      if (next !== t) broadcastTrade(next);
      return next;
    });
  };

  /* Cancelling a resting order or discarding an open position without
     booking it — distinct from closeNow, which always books a record
     for an open position. Either way the room mirror needs to hear
     about it, same as every other trade transition here. */
  const cancelTrade = () => { setTrade(null); broadcastTrade(null); };

  /* Timeframe only — the market itself is chosen once, when the session
     is created (see Dashboard's "Market" field), and fixed for its whole
     life from there. Was symbol-or-timeframe (switchMarket), but a
     session locked to one pair means the symbol half of it can never
     fire any more; keeping the dead branch around would just be a second
     place for "can this session's market actually change?" to have an
     answer, and a wrong one. */
  /* The confirm/cancel gate used to live in here too, back when this was
     only ever reached by clicking one of PipTest's own timeframe buttons.
     Now it's reached from handleIntervalChanged below, which has already
     asked and gotten a yes by the time this runs — this is purely the
     "make the switch happen" half. Twelve Data's missing 1s resolution
     no longer needs handling here either: the chart's own dropdown is
     built from supported_resolutions, which never lists 1S for a Twelve
     Data symbol in the first place (see resolveSymbol in datafeed.js),
     so this can't be reached with a resolution that was never offered. */
  const switchInterval = (nextIv) => {
    if (!nextIv || nextIv === interval) return;
    if (trade?.status === "open" && price) closeNow();
    else if (trade) setTrade(null);
    setForm((f) => ({ ...f, entry: "", stop: "", target: "" }));
    setFormErr("");
    /* freeze the widget's next mount at wherever we currently are — this
       must only ever be touched here, on an actual switch, never on a
       normal tick, since TVAdvancedChart remounts whenever its startMs
       prop changes (see the note by chartStartRef's declaration). */
    const at = cur?.t ?? cursor;
    chartStartRef.current = at;
    seenRef.current = [at]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
    setIv(nextIv);
    /* tell a viewer's chart to remount at the new timeframe right away,
       rather than waiting on the next ~1.5s poll (still the fallback
       — see the room WebSocket effect further down). */
    if (room && canControl) {
      roomSocketRef.current?.send({ type: "market", symbol, interval: nextIv, cursor: at });
    }
  };

  /* Fired by the chart's own native resolution control (see
     TVAdvancedChart's onIntervalChanged subscription) — PipTest's own
     timeframe buttons are gone now, so this is the only door left. The
     widget has *already* switched resolution by the time this runs
     (that's how the library's own dropdown works — it doesn't wait to
     be told it's OK), which is exactly why the cancel branch has to
     explicitly set it back rather than just declining to act: there's
     no "don't apply it yet" to fall back on here, unlike the old
     button, which asked before touching anything. Declining re-fires
     this same handler with the old resolution, which the interval-
     unchanged guard below turns into a no-op rather than a loop. */
  const handleIntervalChanged = (tvRes) => {
    const nextIv = TV_RES_TO_IV[tvRes];
    if (!nextIv || nextIv === interval || !canControl) return;
    if (trade && !confirm(trade.status === "open"
      ? "You have an open position. Switching will close it at the current price. Continue?"
      : "You have a working order. Switching will cancel it. Continue?")) {
      /* setResolution called synchronously, right here, is a silent
         no-op — confirmed directly, not assumed: the library is still
         mid-dispatch of the *first* onIntervalChanged when this runs,
         and won't accept a second resolution change until that finishes.
         Deferring one tick lets it finish first. */
      const revertRes = IV_TO_TV_RES[interval];
      setTimeout(() => chartCtlRef.current?.chart?.setResolution(revertRes), 0);
      return;
    }
    switchInterval(nextIv);
  };

  /* ================= transport =================
     Replay only ever moves forward — no stepping back, deliberately: once
     a bar's played out you've seen the outcome, and rewinding to "redo"
     a decision against a result you already know isn't a real backtest.
     Re-stepping forward within what's already been seen this visit
     (e.g. right after a room resync) still walks the small ring buffer
     of recently-seen bars via jumpTo rather than asking the datafeed for
     something it already has; anything actually new comes from
     replay.stepFor.

     This covers `stepMs` of calendar time, not always one bar — the
     chosen step size (the dropdown next to Play) can span several
     already-seen bars, several fresh ones, or a mix: whatever's still in
     the ring buffer is an instant jumpTo, and whatever isn't gets freshly
     revealed (and run through the trade engine, bar by bar) via
     replay.stepFor. If the step size is *finer* than the chart's own
     bar width, "freshly revealed" means real sub-bar data, and what
     lands in the buffer is a sub-bar of the still-forming candle rather
     than a whole new one — see control.step in datafeed.js, which is
     what actually decides that and builds the candle up on the chart.

     jumpTo repositions the chart but never tells Simulator's own
     OHLC/clock state what it jumped to (only a freshly *revealed* bar
     does, via handleBar) — applySeenBar fixes that using the bar this
     ring buffer already has on hand for anything actually re-visited. */
  const applySeenBar = (idx) => {
    const b = seenBarsRef.current[idx];
    if (!b) return; // the one bare anchor entry — nothing revealed there yet
    setCur((prevBar) => { prevCloseRef.current = prevBar?.c ?? prevCloseRef.current; return b; });
  };
  /* how far the seen buffer already reaches, forward or back, before
     `stepMs` of calendar time (measured from the current position) runs
     out — always at least one bar/position if the buffer has one to
     give, same "can't step less than the smallest unit available"
     floor the old bar-count version had. */
  const walkSeen = (dir) => {
    const startT = seenRef.current[seenIdxRef.current];
    const lastIdx = seenRef.current.length - 1;
    let idx = seenIdxRef.current;
    if (dir > 0) {
      while (idx < lastIdx && seenRef.current[idx + 1] - startT <= stepMs) idx++;
      if (idx === seenIdxRef.current && idx < lastIdx) idx++;
    } else {
      while (idx > 0 && startT - seenRef.current[idx - 1] <= stepMs) idx--;
      if (idx === seenIdxRef.current && idx > 0) idx--;
    }
    return idx;
  };
  const stepForward = useCallback(() => {
    const ctl = chartCtlRef.current;
    if (!ctl) return;
    const startT = seenRef.current[seenIdxRef.current];
    const lastIdx = seenRef.current.length - 1;
    const idx = walkSeen(1);
    const movedWithinBuffer = idx > seenIdxRef.current;
    const coveredMs = movedWithinBuffer ? seenRef.current[idx] - startT : 0;
    if (movedWithinBuffer) {
      seenIdxRef.current = idx;
      /* skipBarLookup: applySeenBar below hands Simulator the exact bar
         from the buffer already — see its own note on jumpTo in
         datafeed.js for what goes wrong if that lookup runs anyway. */
      ctl.replay.jumpTo(seenRef.current[idx], ctl.widget, true);
      applySeenBar(idx);
    }
    if (idx === lastIdx && coveredMs < stepMs) ctl.replay.stepFor(stepMs - coveredMs);
  }, [stepMs]);
  /* drives the widget's own replay clock off Simulator's playing/step
     state, rather than the other way round — room sync and the transport
     buttons both just flip this state, same as before.

     A room viewer (canControl false) never runs this locally, even
     though `playing` still mirrors the host's — it has nothing driving
     it forward at the host's actual pace (both sides free-run their own
     independent 260ms tick loop, see replayController.js, with nothing
     keeping them phase-locked), so a viewer's local clock would drift
     from the host's within seconds. A viewer's chart instead moves
     forward exclusively via the room WebSocket's `bar` messages
     (applyRemoteBar, below) — or, if that connection isn't up, the
     room poll's periodic jumpTo correction as a fallback — so it stays
     exactly in step with the host without ever running its own clock. */
  useEffect(() => {
    /* a viewer must never call play() (see the comment above), but it
       used to still call pause() unconditionally on every render this
       depends on — pause() -> stop() emits state with playing:false,
       which handleReplayState (below) turns straight back into
       setPlaying(false), stomping the `true` a WS "play" message (or
       the poll) had just set. canControl false now leaves the replay
       controller's own play state alone entirely, so Simulator's own
       `playing` — a viewer's only source for it — sticks. */
    if (!chartReady || !chartCtlRef.current || !canControl) return;
    if (playing) chartCtlRef.current.replay.play();
    else chartCtlRef.current.replay.pause();
  }, [playing, chartReady, canControl]);
  useEffect(() => {
    if (!chartReady || !chartCtlRef.current) return;
    chartCtlRef.current.replay.setStep(stepMs);
  }, [stepMs, chartReady]);
  /* real-time room broadcasts for the two bits of transport state a
     bar reveal doesn't already carry — everything else (drawings,
     the actual bars) is sent from handleBar/handleDrawingsChanged
     right where it happens instead of a generic effect like this,
     since those need the freshest possible value, not whatever this
     effect's own dependency array last saw. */
  useEffect(() => {
    if (!room || !canControl) return;
    roomSocketRef.current?.send({ type: playing ? "play" : "pause" });
  }, [playing, canControl, room?.code]); // eslint-disable-line
  useEffect(() => {
    if (!room || !canControl) return;
    roomSocketRef.current?.send({ type: "step", stepId });
  }, [stepId, canControl, room?.code]); // eslint-disable-line
  /* the replay controller can also stop itself (end of available data) —
     without this, the Play button could keep showing "playing" forever */
  const handleReplayState = useCallback((s) => { if (!s.playing) setPlaying(false); }, []);

  /* ================= trade zones =================
     Entry/stop/target as three shapes via the library's own shape API,
     replacing the hand-drawn canvas rectangles ReplayChart used to paint.
     Keyed off displayTrade, not trade directly, so a room guest's chart
     draws the HOST's zones too — see displayTrade's own comment above. */
  const zoneShapesRef = useRef([]);
  useEffect(() => {
    const ctl = chartCtlRef.current;
    if (!ctl) return;
    for (const id of zoneShapesRef.current) ctl.removeShape(id);
    zoneShapesRef.current = [];
    if (!displayTrade) return;
    zoneShapesRef.current.push(ctl.drawZone({ price: displayTrade.entry, color: T.brand,
      text: `${displayTrade.status === "open" ? "Entry" : "Limit"} ${fmtPrice(displayTrade.entry)}` }));
    if (displayTrade.stop != null) zoneShapesRef.current.push(ctl.drawZone({ price: displayTrade.stop, color: T.down, text: `Stop ${fmtPrice(displayTrade.stop)}` }));
    if (displayTrade.target != null) zoneShapesRef.current.push(ctl.drawZone({ price: displayTrade.target, color: T.up, text: `Target ${fmtPrice(displayTrade.target)}` }));
  }, [displayTrade, chartReady]); // eslint-disable-line

  /* ================= autosave =================
     `layout` is the widget's own save() snapshot — drawings, indicators
     and chart settings together, replacing what used to be two separate
     hand-rolled fields. Only taken when the widget is actually up. */
  const saveT = useRef(null);
  useEffect(() => {
    /* a transient (joined-room) session never gets a backend row at all —
       see joinRoomFromDashboard in App.jsx. Nothing to autosave here: the
       chart state is the room's, not this throwaway session's own. */
    if (!restored || meta.transient) return;
    setSaveState("saving");
    clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      const layout = chartReady && chartCtlRef.current ? await chartCtlRef.current.save() : pendingLayoutRef.current;
      const ok = await data.saveSessionState(meta.id, {
        id: meta.id, cursor, trades, trade, layout, notes, symbol, interval,
      });
      const st = computeStats(trades, startBalance);
      const ch = evaluateChallenge(trades, meta.challenge, startBalance);
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
  }, [trades, trade, cursor, notes, symbol, interval, restored, chartReady, layoutTick]); // eslint-disable-line

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

  /* ================= rooms =================
     A read-then-write-the-whole-doc push — even one that reads fresh
     right before writing — still races: two participants' pushes can
     each read a doc that doesn't yet have the other's just-landed
     write, and whichever PUT lands second wins in full, quietly
     reverting every field the FIRST push had just changed (their new
     drawing included) back to what the second push's own stale read
     saw. That's what kept showing up as vanishing drawings and
     resyncing viewports even after only reading fresh immediately
     before writing. `data.roomPatch` (server/routes.js) fixes this
     properly: the merge happens inside Postgres via jsonb_set, computed
     from whatever the row actually holds at the moment each patch
     executes, not from anything a client read over the network — so
     this push only ever touches the exact fields it lists below, full
     stop, regardless of what anyone else's concurrent patch is doing
     to layout/trading/participants/etc. */
  /* Holds the JSON-*stringified* layout last applied/pushed, not the
     raw object — every poll's doc.layout is freshly deserialized from
     the network response, a brand-new object even when the content is
     byte-for-byte identical to last time, so comparing by `!==` was
     never actually catching "unchanged", only "a new object landed" —
     which is every single poll. That meant `.load()` (below) was
     firing on every ~1.5s tick regardless of whether anyone had
     actually drawn anything, each one a real, visible viewport
     glitch — not just on real edits. */
  const lastAppliedLayoutRef = useRef(null);
  const pushRoom = useCallback(async (extra = {}) => {
    if (!room || !canControl || !API_ENABLED || !roomSyncedRef.current) return;
    const now = Date.now();
    if (!extra.force && now - pushRef.current < 700) return;
    pushRef.current = now;
    const patches = [
      { path: ["symbol"], value: symbol }, { path: ["interval"], value: interval },
      { path: ["cursor"], value: cursor }, { path: ["playing"], value: playing },
      { path: ["stepId"], value: stepId }, { path: ["updatedBy"], value: account.handle },
      { path: ["updatedAt"], value: now },
    ];
    if (extra.layout !== undefined) patches.push({ path: ["layout"], value: extra.layout });
    if (extra.drawings !== undefined) patches.push({ path: ["drawings"], value: extra.drawings });
    if (extra.trade !== undefined) patches.push({ path: ["trade"], value: extra.trade });
    if (extra.closed?.length) patches.push({ path: ["closedTrades"], append: extra.closed });
    const merged = await data.roomPatch(room.code, patches);
    if (merged) setRoom(merged);
  }, [room, canControl, symbol, interval, cursor, playing, stepId, account.handle]);

  /* Same content-comparison reasoning as lastAppliedLayoutRef — a
     freshly-deserialized array is a new object every poll. */
  const lastAppliedDrawingsRef = useRef(null);

  const handleDrawingsChanged = useCallback((kind) => {
    /* always bump this, room or not — it's what makes the autosave effect
       below (which otherwise only reacts to trades/cursor/notes/symbol/
       interval) also pick up a layout-only edit and persist it. */
    setLayoutTick((n) => n + 1);
    if (kind !== "study") return; // drawings are handled by the watcher below
    if (!room || !canControl || !chartCtlRef.current) return;
    (async () => {
      /* Drawings and indicators take different routes to a room-mate
         (a per-shape mirror vs. a whole-chart snapshot — see
         TVAdvancedChart's stripDrawings), and drawing edits are by far
         the more frequent of the two. Pushing only the one that
         actually changed is what keeps the layout snapshot stable
         while someone is drawing, so the receiving chart never
         reloads. */
      const { layout, drawings } = await chartCtlRef.current.saveShared();
      lastAppliedLayoutRef.current = JSON.stringify(layout);
      lastAppliedDrawingsRef.current = JSON.stringify(drawings);
      pushRoom({ layout, drawings, force: true });
    })();
  }, [room, canControl, pushRoom]);

  /* ---- what actually publishes drawings to a room ----

     The library's `drawing_event` looked like the natural trigger and
     isn't: measured against the real widget, it fires exactly once per
     drawing, at the instant the tool creates it — when a two-point
     line still has BOTH points on the first click — and then never
     again. Not when the drawing is completed, and not when an existing
     one is dragged. So anything driven off that event alone publishes
     a half-finished shape and nothing afterwards, which is why a
     drawing only ever reached a room-mate on the *next* edit, always
     one behind, and why dragging one never reached them at all.

     Comparing the actual serialized shapes on a short timer is
     immune to which events the library chooses to emit: whatever
     changed, however it changed, shows up as different content. The
     read only walks shapes already in memory, and only runs while
     actually hosting/co-editing a room. */
  const pushRoomRef = useRef(pushRoom);
  useEffect(() => { pushRoomRef.current = pushRoom; }, [pushRoom]);

  /* ================= trade mirror (rooms) =================
     Only the host ever trades (see canTrade above), which used to
     mean a guest's `trade` stayed null forever — no entry/stop/target
     lines, no live position, and a closed trade never reached their
     blotter at all, even though it closed right in front of them.
     Called at every point the host's own `trade` actually changes
     (armed, stop moved, cancelled, closed), same "durable poll, fast
     WS" split as everything else in a room: the socket send is what a
     connected guest sees instantly, pushRoom's forced patch is what a
     late joiner or a reconnect catches up from afterwards. `closed`
     is a separate, explicit argument rather than something inferred
     from the trade transition — going to null covers both "cancelled"
     and "closed", and only the caller booking the trade actually has
     the closed record to hand. */
  const broadcastTrade = useCallback((nextTrade, closed) => {
    if (!room || !isHost) return;
    const msg = { type: "trade", trade: nextTrade };
    if (closed?.length) msg.closed = closed;
    roomSocketRef.current?.send(msg);
    pushRoom({ trade: nextTrade, closed, force: true });
  }, [room, isHost, pushRoom]);
  const broadcastTradeRef = useRef(broadcastTrade);
  useEffect(() => { broadcastTradeRef.current = broadcastTrade; }, [broadcastTrade]);

  useEffect(() => {
    if (!room?.code || !canControl || !chartReady || !API_ENABLED) return;
    const id = setInterval(() => {
      const api = chartCtlRef.current;
      if (!api || !roomSyncedRef.current) return;
      const drawings = api.getDrawings();
      const str = JSON.stringify(drawings);
      if (str === lastAppliedDrawingsRef.current) return;
      lastAppliedDrawingsRef.current = str;
      setLayoutTick((n) => n + 1); // persist it to the host's own session too
      pushRoomRef.current({ drawings, force: true });
    }, 800);
    return () => clearInterval(id);
  }, [room?.code, canControl, chartReady]);

  /* ---- and the mirror image of it, on a viewer ----

     Comparing what the room holds against what's actually mirrored,
     rather than acting on the moment a change arrives, is what makes
     this self-healing. Every way the two can drift apart converges
     here on the next tick: the widget remounting (a guest's chart is
     replaced as it joins, when the room's market turns out not to be
     the throwaway session's) and losing every mirror; an apply landing
     while the chart was still fetching bars; a poll that skipped
     because the doc hadn't changed since the last one, which is every
     poll while the host sits still. The room's own poll can't cover
     those on its own — it only ever acts on a doc it considers new,
     and a host who isn't touching anything never produces one, so a
     single missed apply would otherwise stay missed indefinitely.
     That is exactly what "the drawings aren't there until the host
     makes a change" was. */
  useEffect(() => {
    if (!room?.code || canControl || !chartReady || !API_ENABLED) return;
    const id = setInterval(() => {
      const api = chartCtlRef.current;
      const want = roomChartRef.current?.drawings;
      if (!api || !want) return;
      const str = JSON.stringify(want);
      if (str === lastAppliedDrawingsRef.current) return;
      lastAppliedDrawingsRef.current = str;
      api.applyDrawings(want);
    }, 800);
    return () => clearInterval(id);
  }, [room?.code, canControl, chartReady]);

  useEffect(() => { if (room && canControl) pushRoom(); }, [cursor, playing, stepId, symbol, interval]); // eslint-disable-line

  useEffect(() => {
    if (!room?.code || !API_ENABLED) return;
    let alive = true;
    missRef.current = 0;
    const poll = async () => {
      const doc = await data.roomGet(room.code);
      if (!alive) return;
      if (!doc) {
        /* a failed fetch also comes back empty, so don't treat one miss as
           "closed" — only act once it's been gone for a few polls straight.
           Never reached for the host: closeRoom clears their own `room`
           synchronously, which stops this poll before it could ever see
           its own room go missing (see closeRoom/kickParticipant below) —
           so this is always a guest finding out the host ended it, and
           there's nothing left here worth sticking around for. */
        if (++missRef.current >= 3) {
          setRoom(null); setChatOpen(false);
          store.del(K.roomLink(meta.id));
          onExit();
        }
        return;
      }
      missRef.current = 0;
      /* The room's current chart state, kept fresh on EVERY poll —
         including the echo branch below, which skips everything else.
         A doc that nobody has touched since it was last applied still
         describes what the room looks like, and a widget that mounts
         after that point needs it: see handleReady. */
      roomChartRef.current = { layout: doc.layout || null, drawings: doc.drawings || null };
      const isMyOwnEcho = doc.updatedBy === account.handle || (doc.updatedAt || 0) <= appliedRef.current;
      if (isMyOwnEcho) {
        setRoom((r) => ({ ...r, participants: doc.participants, messages: doc.messages }));
      } else {
        appliedRef.current = doc.updatedAt || 0;
        /* Removed from participants by someone else's patch — the
           host kicked me (see kickParticipant). Never true for the
           host's own poll: closing a room deletes the whole doc
           instead (the separate !doc branch above), and nothing else
           ever touches the host's own entry. */
        if (!doc.participants?.[account.handle]) {
          setRoom(null); setChatOpen(false);
          store.del(K.roomLink(meta.id));
          onExit();
          return;
        }
        setRoom(doc);
        const marketChanged = doc.symbol !== symbol || doc.interval !== interval;
        if (doc.symbol !== symbol) setSymbol(doc.symbol);
        if (doc.interval !== interval) setIv(doc.interval);
        setStepId(doc.stepId || "1m"); setPlaying(doc.playing);
        /* the room's authoritative position, for handleCursor to confirm
           against once a correction (remount or jumpTo, both async)
           actually lands — see roomSyncedRef's own comment. Tracked on
           every full-apply regardless of branch, not just when a
           correction is attempted, since it's also what "already in
           sync, nothing to do" below confirms against immediately. */
        lastKnownDocCursorRef.current = doc.cursor;

        /* trade/closedTrades are the durable half of the trade mirror
           (see broadcastTrade) — this is what a guest who just joined,
           or was disconnected when the WS message went out, catches up
           from. doc.closedTrades is the FULL history every time, not a
           delta, so dedupe against what's already here rather than
           reapplying it wholesale on every ~1.5s tick. */
        if (!canTrade) {
          if ("trade" in doc) setHostTrade(doc.trade ?? null);
          if (Array.isArray(doc.closedTrades) && doc.closedTrades.length) {
            setTrades((list) => {
              const known = new Set(list.map((t) => t.id));
              const fresh = doc.closedTrades.filter((t) => !known.has(t.id));
              return fresh.length ? [...fresh.slice().reverse(), ...list] : list;
            });
          }
        }

        if (marketChanged || !chartCtlRef.current) {
          /* Either a real remount is about to happen anyway (symbol/
             interval just changed — TVAdvancedChart remounts on those
             props regardless of anything here), or the widget isn't up
             yet (first join, or the widget can simply race to mount
             before this poll ever runs). Either way this is the one
             moment startMs is actually read, so it needs to be right.
             A routine cursor sync while the SAME widget stays mounted
             must go through jumpTo below instead, never this ref —
             touching it on every poll used to force a remount every
             ~1.5s the moment more than one participant could push chart
             state, wiping drawings and jolting the view on every single
             tick. */
          chartStartRef.current = doc.cursor;
          seenRef.current = [doc.cursor]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
        } else if (roomSocketRef.current?.isOpen()) {
          /* the room WebSocket is live and feeding bars directly via
             applyRemoteBar as they happen (see the WS message handler
             below) — this poll-based correction is only the fallback
             for when that connection isn't up, and forcing a
             jumpTo/resetData here anyway would fight the smooth,
             tick-by-tick bar delivery for no reason. */
          roomSyncedRef.current = true;
        } else if (Math.abs(cursor - doc.cursor) > barMsOf(interval) * 2) {
          /* a couple of bars' worth of drift is normal jitter, not a
             desync — cursor is milliseconds now, not a bar index, so the
             old ">3" bar tolerance would resync on every poll */
          seenRef.current = [doc.cursor]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
          /* replay.jumpTo, not control.jumpTo directly — the wrapper is
             what threads symbol/resolution through so a real bar comes
             back and price/clock/OHLC don't sit stale (see datafeed.js's
             jumpTo); it also stops local playback, which is right here
             since playing already gets re-synced from doc.playing above. */
          chartCtlRef.current.replay.jumpTo(doc.cursor, chartCtlRef.current.widget);
        } else {
          // already within a couple of bars of the room — nothing to
          // correct, so there's nothing async to wait on either.
          roomSyncedRef.current = true;
        }

        const docLayoutStr = doc.layout ? JSON.stringify(doc.layout) : null;
        if (docLayoutStr && docLayoutStr !== lastAppliedLayoutRef.current) {
          lastAppliedLayoutRef.current = docLayoutStr;
          /* if a remount is imminent (marketChanged) or the widget isn't
             up, load() on whatever chartCtlRef currently holds would
             either hit a stale/about-to-be-torn-down instance or no-op —
             queue it the same way the host's own saved layout is queued
             on initial restore, so the NEXT mount's onReady picks it up
             instead of silently losing it. */
          if (marketChanged || !chartCtlRef.current) pendingLayoutRef.current = doc.layout;
          else chartCtlRef.current.load(doc.layout);
        }

        /* Drawings, unlike the layout above, never go through load()
           — applyDrawings adds/moves/removes individual shapes on the
           live chart, so this runs as often as the host draws without
           the chart being rebuilt (and therefore without the viewport
           moving) even once. */
        /* Drawings are deliberately NOT applied here. Reaching this
           branch at all depends on the doc looking new, and the
           reconciler below has to handle the times it doesn't anyway
           (a widget that mounts later, an apply that lands while the
           chart is still filling in) — so it owns the job outright
           rather than splitting it across two places that each cover
           half the cases. roomChartRef, set above on every poll, is
           how it learns what the room currently holds. */
      }
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [room?.code, account.handle]); // eslint-disable-line

  /* ---- room WebSocket: real-time relay for a viewer's chart ----
     Applies the host's own bar/market/play/pause/step messages —
     only for a guest (canControl true means this side IS the host,
     the source of truth, not a follower; see handleBar's own
     broadcast guard for the other half of that split) — plus the
     host's trade mirror, which every guest needs regardless of that
     split (see the trade case below). Defined fresh every render, not
     memoized, and stashed in a ref the connect effect below reads
     from — so it always sees the latest symbol/interval/chartCtlRef
     without the effect itself needing to tear down and reconnect the
     socket whenever any of those change. */
  const handleRoomSocketMessage = (msg) => {
    if (!chartCtlRef.current) return;
    /* Named separately from canControl even though the two now
       coincide for a room (sharing is view-only — see canControl's
       own comment above) — this is gated on "can I trade", the
       question that actually matters here, not "can I drive the
       chart", which only reads the same today because there's no
       role left that answers them differently. */
    if (msg.type === "trade") {
      if (canTrade) return; // the host never applies an echo of their own trade
      if ("trade" in msg) setHostTrade(msg.trade);
      if (msg.closed?.length) {
        const ids = new Set(msg.closed.map((c) => c.id));
        setTrades((list) => [...msg.closed.slice().reverse(), ...list.filter((t) => !ids.has(t.id))]);
      }
      return;
    }
    if (canControl) return;
    switch (msg.type) {
      case "bar":
        chartCtlRef.current.replay.applyRemoteBar(
          { time: msg.time, open: msg.open, high: msg.high, low: msg.low, close: msg.close, volume: msg.volume },
          msg.symbol, msg.resolution, msg.subRes
        );
        break;
      case "play":
        setPlaying(true);
        break;
      case "pause":
        setPlaying(false);
        break;
      case "step":
        if (msg.stepId) setStepId(msg.stepId);
        break;
      case "market": {
        const marketChanged = (msg.symbol && msg.symbol !== symbol) || (msg.interval && msg.interval !== interval);
        if (msg.symbol) setSymbol(msg.symbol);
        if (msg.interval) setIv(msg.interval);
        if (marketChanged && typeof msg.cursor === "number") {
          chartStartRef.current = msg.cursor;
          seenRef.current = [msg.cursor]; seenBarsRef.current = [null]; seenIdxRef.current = 0;
          setCursor(msg.cursor);
        }
        break;
      }
      default: break;
    }
  };
  const roomMsgHandlerRef = useRef(handleRoomSocketMessage);
  roomMsgHandlerRef.current = handleRoomSocketMessage;

  /* a stale mirror from whatever room this client was in before
     (or from before joining any room at all) has no business
     surviving into a new one */
  useEffect(() => { setHostTrade(null); }, [room?.code]);

  useEffect(() => {
    if (!room?.code || !API_ENABLED) { setWsLive(false); return; }
    const sock = connectRoomSocket(room.code, {
      onMessage: (msg) => roomMsgHandlerRef.current(msg),
      onOpen: () => setWsLive(true),
      onClose: () => setWsLive(false),
    });
    roomSocketRef.current = sock;
    return () => {
      sock.close();
      if (roomSocketRef.current === sock) roomSocketRef.current = null;
    };
  }, [room?.code]); // eslint-disable-line

  /* unread badge on the chat toggle while the panel is closed */
  useEffect(() => {
    const msgs = room?.messages || [];
    if (chatOpen) { chatSeenRef.current = msgs.length; setChatUnread(0); return; }
    if (msgs.length > chatSeenRef.current) {
      const added = msgs.slice(chatSeenRef.current).filter((m) => m.from !== account.handle);
      if (added.length) setChatUnread((n) => n + added.length);
      chatSeenRef.current = msgs.length;
    }
  }, [room?.messages, chatOpen]); // eslint-disable-line

  const hostRoom = async () => {
    if (!API_ENABLED) { setRoomMsg("Live rooms need the API. Set VITE_API_URL and redeploy."); return; }
    const code = makeCode();
    /* seed the room with whatever's already drawn, not a blank
       `layout: null` — a guest only ever gets a layout push when
       handleDrawingsChanged actually fires, i.e. on the NEXT drawing
       edit, which meant every pre-existing drawing from before the
       room was even opened stayed invisible to anyone who joined
       until the host happened to touch the chart again. */
    const shared = chartCtlRef.current ? await chartCtlRef.current.saveShared() : { layout: null, drawings: [] };
    const { layout, drawings } = shared;
    /* Same reasoning as layout/drawings above, for trades: a viewer who
       joins mid-session should see the account's whole picture — any
       order already armed or position already open, and the full closed
       history — not just what happens to change after the room opens.
       Without this a guest who joined an hour into a session saw a blank
       blotter and no ticket until the host's very next trade. */
    const doc = { code, host: account.handle, sessionId: meta.id,
      symbol, interval, startMs: meta.startMs,
      participants: { [account.handle]: { role: "host", ts: Date.now(), avatar: account.avatar || null } },
      layout, drawings, cursor, playing: false, stepId, messages: [], updatedBy: account.handle, updatedAt: Date.now(),
      trade, closedTrades: trades };
    if (!(await data.roomPut(code, doc))) { setRoomMsg("Couldn't open the room. Try again."); return; }
    chatSeenRef.current = 0; setChatUnread(0);
    roomSyncedRef.current = true; // the doc IS the host's own already-correct local state
    lastKnownDocCursorRef.current = cursor;
    if (layout) lastAppliedLayoutRef.current = JSON.stringify(layout);
    /* the host's own chart already has these — it's where they came
       from — so mark them applied, or its next poll would mirror the
       host's drawings on top of themselves. */
    if (drawings) lastAppliedDrawingsRef.current = JSON.stringify(drawings);
    setRoom(doc); setRoomMsg(`Room ${code} is open — share the code.`);
    store.set(K.roomLink(meta.id), code); // survives a refresh — see the rehydrate effect below
  };
  const joinRoom = async (codeArg) => {
    setRoomMsg("");
    if (!API_ENABLED) { setRoomMsg("Live rooms need the API."); return; }
    const code = (codeArg ?? joinCode).trim().toUpperCase();
    if (!code) { setRoomMsg("Enter a room code first."); return; }
    if (code.length !== 6) { setRoomMsg(`"${code}" is ${code.length} characters — codes are 6.`); return; }
    setRoomMsg("Looking for that room…");
    const existing = await data.roomGet(code);
    if (!existing) { setRoomMsg(`No open room found for ${code}.`); return; }
    const role = existing.participants?.[account.handle]?.role || "viewer";
    const merged = await data.roomPatch(code, [
      { path: ["participants", account.handle], value: { role, ts: Date.now(), avatar: account.avatar || null } },
    ]);
    const doc = merged || existing;
    appliedRef.current = 0; chatSeenRef.current = doc.messages?.length || 0; setChatUnread(0);
    /* not yet — Simulator's own symbol/interval/cursor/stepId/playing are
       still joinRoomFromDashboard's throwaway placeholder until the poll
       effect's first full-apply actually overwrites them with the room's
       real state (see roomSyncedRef's own comment). */
    roomSyncedRef.current = false;
    setRoom(doc);
    /* role, not "did I just click Join" — this same function is also
       how a host's own tab resumes hosting after a refresh (see the
       room-resume effect below), and "watching the host" is a strange
       thing to tell someone about themselves. */
    setRoomMsg(role === "host" ? `Room ${code} is open — share the code.` : `Joined ${code} — watching the host.`);
    store.set(K.roomLink(meta.id), code);
  };

  /* the Dashboard's "Join room" button creates a throwaway session just to
     land here in, then hands us the code it was for via this prop — this
     runs that same join once on mount instead of making someone type the
     code again right after they just typed it. onAutoJoinDone clears it on
     the parent's end, so revisiting this session later never auto-rejoins. */
  useEffect(() => {
    if (!autoJoinCode) return;
    setJoinCode(autoJoinCode);
    setRoomOpen(true);
    joinRoom(autoJoinCode);
    onAutoJoinDone?.();
  }, []); // eslint-disable-line

  /* ================= room resume (survives a refresh) =================
     `room` is plain React state — gone the instant this component
     remounts, which used to mean an ordinary page refresh looked
     exactly like "never was in a room": a host's own share panel
     reverted to "Share this chart" even though the room was still
     alive server-side (which is also how it could go on quietly
     accepting new joins while the host's own UI insisted nothing was
     shared — the room never actually closed, only the host's local
     memory of it did), and a viewer got bounced to the dashboard
     entirely (see the matching breadcrumb check in App.jsx, which is
     what gets this component mounted again at all for a transient,
     never-persisted joined-room session). joinRoom already does
     everything a resume needs — it re-derives whatever role this
     account already holds in the room, so a host stays host and a
     viewer stays viewer — this just supplies the code that would
     otherwise have to be typed in by hand. Skipped when autoJoinCode
     is set: that's this exact scenario already, one effect above. */
  useEffect(() => {
    if (autoJoinCode) return;
    (async () => {
      const code = await store.get(K.roomLink(meta.id));
      if (!code) return;
      const existing = await data.roomGet(code);
      if (!existing) { store.del(K.roomLink(meta.id)); return; } // really did end — stop pretending otherwise
      joinRoom(code);
    })();
  }, []); // eslint-disable-line

  /* A non-host's tab actually closing (not just refreshing — the
     resume effect above re-adds them fresh the instant a refresh's
     next load runs) is otherwise invisible to the room: nothing here
     ever calls leaveRoom for them, so their name sat in the host's
     participant list forever with no way to tell "gone for now" from
     "gone for good". A real `fetch` can get cancelled mid-flight the
     moment the page starts unloading — see roomLeaveBeacon — which is
     exactly when this needs to fire.
     Never for the host: their own participants entry is also where
     their role lives (see isHost/canTrade above), so removing it
     would silently demote a host who just closed a tab to "viewer"
     the next time they opened the room back up. Ending a room for
     everyone stays a deliberate act — the Close button — never a side
     effect of a tab closing. */
  useEffect(() => {
    if (!room || isHost) return;
    const code = room.code, handle = account.handle;
    const onUnload = () => data.roomLeaveBeacon(code, handle);
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [room?.code, isHost, account.handle]);

  const leaveRoom = async () => {
    if (room && API_ENABLED) {
      await data.roomPatch(room.code, [{ path: ["participants", account.handle], remove: true }]);
    }
    setRoom(null); setRoomMsg(""); setChatOpen(false);
    store.del(K.roomLink(meta.id));
    onExit(); // guest-only button (see RoomPanel) — nothing here left to watch, back to the dashboard
  };
  /* host-only: ends the room for everyone and wipes the kv row — chat
     messages live inside that same doc, so they're gone with it */
  const closeRoom = async () => {
    if (!room || !isHost) return;
    await data.roomDelete(room.code);
    setRoom(null); setRoomMsg("Room closed."); setChatOpen(false);
    store.del(K.roomLink(meta.id));
  };
  /* host-only: removes a guest from the room outright. Sharing is
     view-only (see canControl above) — there's no lesser action like
     a demotion to offer, only "still here" or "not". The kicked
     guest's own client notices on its next poll (see the room poll
     effect's own-participant check) and leaves on its own; nothing
     server-side needs to force their socket closed for that. */
  const kickParticipant = async (who) => {
    if (!isHost || who === account.handle) return;
    const merged = await data.roomPatch(room.code, [
      { path: ["participants", who], remove: true },
      { path: ["updatedBy"], value: account.handle }, { path: ["updatedAt"], value: Date.now() },
    ]);
    if (merged) setRoom(merged);
  };
  const sendChat = async () => {
    const text = chatText.trim();
    if (!text || !room || chatBusy) return;
    setChatBusy(true);
    setChatText("");
    try {
      const msg = { id: uid(), from: account.handle, avatar: account.avatar || null,
        text: censor(text.slice(0, 500)), ts: Date.now() };
      const merged = await data.roomPatch(room.code, [
        { path: ["messages"], append: [msg] },
        { path: ["updatedBy"], value: account.handle }, { path: ["updatedAt"], value: Date.now() },
      ]);
      if (merged) {
        chatSeenRef.current = merged.messages?.length || 0;
        setRoom(merged);
      }
    } finally {
      setChatBusy(false);
    }
  };

  /* ================= hotkeys =================
     Drawing-tool shortcuts (T/R/H/L/B/F/M, Cmd+Z, Delete-to-remove-a-
     drawing) are gone — the library's own left toolbar owns drawing now,
     with its own shortcuts. What's left is transport and the help modal. */
  useEffect(() => {
    const onKey = (e) => {
      const tg = document.activeElement?.tagName;
      if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (e.key === " ") { e.preventDefault(); if (canControl) setPlaying((p) => !p); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (canControl) stepForward(); return; }
      if (k === "?") { setHelpOpen(true); return; }
      /* Plain "f", not the library's own Shift+F — this only reaches
         the page when focus is here rather than inside the chart's
         iframe (keydown doesn't cross that boundary), so the header
         button below is the reliable path; this is just the bonus. */
      if (k === "f") { toggleFullscreen(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canControl, stepForward, toggleFullscreen]);

  useEffect(() => {
    const away = (e) => { if (!e.target.closest?.("[data-pop]")) { setRoomOpen(false); setChatOpen(false); setProfileOpen(false); setSessionsOpen(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  /* transient (joined-room) sessions never get saved and disappear the
     moment you leave them, so they don't belong in a "switch to" list */
  const switchableSessions = sessions.filter((s) => !s.transient);

  return (
    <div ref={pageRef} className="sim-page" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* ================= top bar ================= */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", minHeight: 56,
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
            <span className="hide-sm">Dashboard</span>
          </span>
        </button>
        <div className="vsep" style={{ height: 24 }} />

        {/* fixed for the life of the session — chosen once on the "New
            session" form and never a <select> here any more, so there's
            no path left, host or guest, for the pair to change under a
            trade or a room mid-session. */}
        <span title="The market is set when a session is created and can't be changed here"
          style={{ fontWeight: 600, fontSize: 13.5 }}>
          {SYMBOLS.find((s) => s.id === symbol)?.label || symbol}
        </span>

        <span className="num" style={{ fontSize: 18, fontWeight: 600 }}>{fmtPrice(price)}</span>
        <span className="num sm" style={{ fontWeight: 500, color: chg >= 0 ? "var(--up)" : "var(--down)" }}>
          {chg >= 0 ? "+" : "−"}{fmtPrice(Math.abs(chg))} ({chgPct >= 0 ? "+" : "−"}{Math.abs(chgPct).toFixed(2)}%)
        </span>
        <span className="sm mut hide-sm">{cur ? fmtClock(cur.t, interval) + " UTC" : ""}</span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="sm" style={{ color: saveState === "failed" ? "var(--down)" : "var(--dim)" }}>
            {meta.transient ? "Viewing a room — not saved"
              : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : "Saved"}
          </span>
          <span data-pop className="hide-sm" style={{ position: "relative" }}>
            <button onClick={() => setSessionsOpen((o) => { if (!o) { setRoomOpen(false); setChatOpen(false); setProfileOpen(false); } return !o; })}
              title="Switch session" aria-label="Switch session"
              style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 6,
                background: "transparent", border: "1px solid transparent", borderRadius: 9,
                padding: "4px 8px", cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
              <span>
                <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(equity + unreal)}</div>
                <div className="sm mut" style={{ fontSize: 11 }}>
                  {stats.count ? fmtR(stats.totalR) : "no trades"}
                </div>
              </span>
              <Svg s={13} style={{ color: "var(--muted)" }}>{Ic.chev}</Svg>
            </button>

            {sessionsOpen && (
              <div className="card" data-pop style={{ position: "absolute", right: 0, top: 46, zIndex: 60,
                width: 268, padding: 6, maxHeight: 380, overflowY: "auto" }}>
                <div className="cap" style={{ padding: "8px 10px 6px" }}>
                  Sessions — balance shown is this one
                </div>
                {switchableSessions.length === 0 ? (
                  <div className="sm mut" style={{ padding: "6px 10px 10px" }}>No saved sessions yet.</div>
                ) : switchableSessions.map((s) => {
                  const isCurrent = s.id === meta.id;
                  const sym = SYMBOLS.find((x) => x.id === s.symbol);
                  const st = s.stats || {};
                  return (
                    <button key={s.id} className={"btn ghost " + (isCurrent ? "on" : "")}
                      style={{ width: "100%", justifyContent: "space-between", padding: "8px 10px", textAlign: "left", gap: 8 }}
                      onClick={() => { setSessionsOpen(false); if (!isCurrent) onNav?.("sim", s.id); }}>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name}
                        </div>
                        <div className="sm" style={{ fontSize: 11, opacity: isCurrent ? 0.85 : undefined,
                          color: isCurrent ? "inherit" : "var(--muted)" }}>
                          {sym?.label || s.symbol} · {INTERVALS.find((i) => i.id === s.interval)?.label}
                        </div>
                      </span>
                      <span className="num sm" style={{ flexShrink: 0, fontWeight: 600,
                        color: isCurrent ? "inherit" : !st.count ? "var(--dim)" : st.net > 0 ? "var(--up)" : st.net < 0 ? "var(--down)" : "var(--muted)" }}>
                        {st.count ? fmtSigned(st.net) : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </span>
          <span data-pop style={{ position: "relative" }}>
            <button className={"btn ghost " + (roomOpen ? "on" : "")}
              onClick={() => setRoomOpen((o) => { if (!o) { setChatOpen(false); setProfileOpen(false); setSessionsOpen(false); } return !o; })}
              title="Live room" aria-label="Live room" style={{ padding: "6px 9px" }}>
              <Svg s={15}>{Ic.users}</Svg>
            </button>
            {roomOpen && <RoomPanel {...{ room, isHost, account, joinCode, setJoinCode, roomMsg, wsLive, hostRoom, joinRoom, leaveRoom, closeRoom, kickParticipant, onClose: () => setRoomOpen(false) }} />}
          </span>
          {room && (
            <span data-pop style={{ position: "relative" }}>
              <button className={"btn ghost " + (chatOpen ? "on" : "")}
                onClick={() => setChatOpen((o) => { if (!o) { setRoomOpen(false); setProfileOpen(false); setSessionsOpen(false); } return !o; })}
                title="Room chat" aria-label="Room chat" style={{ padding: "6px 9px", position: "relative" }}>
                <Svg s={15}>{Ic.chat}</Svg>
                {chatUnread > 0 && !chatOpen && (
                  <span className="num" style={{ position: "absolute", top: -4, right: -4, minWidth: 15, height: 15,
                    borderRadius: 999, background: "var(--down)", color: "#fff", fontSize: 9.5, fontWeight: 700,
                    display: "grid", placeItems: "center", padding: "0 3px", lineHeight: 1 }}>
                    {chatUnread > 9 ? "9+" : chatUnread}
                  </span>
                )}
              </button>
              {chatOpen && (
                <ChatPanel room={room} account={account} messages={room.messages || []}
                  chatText={chatText} setChatText={setChatText} onSend={sendChat} busy={chatBusy}
                  onClose={() => setChatOpen(false)} />
              )}
            </span>
          )}
          {room && <span className="pill b live">● {room.code}</span>}
          {/* used to anchor the right edge of the now-removed timeframe
              strip below the chart; the chart's own header carries
              timeframe switching now (see handleIntervalChanged), so
              this rides along up here instead. */}
          <button className="btn ghost" style={{ padding: "6px 9px", fontSize: 12.5 }}
            onClick={() => setHelpOpen(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</button>
          <button className="btn ghost" onClick={onToggleTheme} style={{ padding: "6px 9px" }} aria-label="Toggle theme">
            <Svg s={15}>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
          </button>
          {/* the floating replay bar (bottom of the chart) already carries
              its own play/pause, so this slot is free for the same account
              menu the landing page header uses, rather than a redundant
              second play/pause control */}
          <span data-pop style={{ position: "relative" }}>
            <button onClick={() => setProfileOpen((o) => { if (!o) { setRoomOpen(false); setChatOpen(false); setSessionsOpen(false); } return !o; })} aria-label="Account menu"
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                background: "transparent", border: "1px solid var(--border)", borderRadius: 999,
                padding: "4px 10px 4px 4px", fontFamily: "inherit", color: "var(--ink)" }}>
              <Avatar value={account?.avatar} handle={account?.handle} size={26} />
              <span className="sm hide-sm" style={{ fontWeight: 600, maxWidth: 110, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account?.name || account?.handle}</span>
              <Svg s={13} style={{ color: "var(--muted)" }}>{Ic.chev}</Svg>
            </button>

            {profileOpen && (
              <div className="card" data-pop style={{ position: "absolute", right: 0, top: 46, zIndex: 60, width: 232, padding: 6 }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{account?.name || account?.handle}</div>
                  <div className="sm mut" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {account?.email || "@" + account?.handle}
                  </div>
                </div>
                {[["dashboard", "Dashboard"], ["journal", "Journal"],
                  ["analytics", "Analytics"], ["settings", "Settings"]].map(([id, label]) => (
                  <button key={id} className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}
                    onClick={() => { setProfileOpen(false); onNav?.(id); }}>{label}</button>
                ))}
                <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
                <button className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", color: "var(--down)" }}
                  onClick={() => { setProfileOpen(false); onSignOut?.(); }}>Sign out</button>
              </div>
            )}
          </span>
        </div>
      </header>

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
      {/* Fullscreen drops the ad column entirely rather than just hiding
          it — that's one less thing competing for the extra room, and
          one fewer ad impression billed for a box nobody can see while
          it's not rendered at all — and gives the chart that width back,
          same as the existing narrow-window breakpoint below already
          does for its own reason. */}
      <div className="sim-main" style={{ display: "grid",
        gridTemplateColumns: fullscreen ? "minmax(0,1fr) 292px" : "156px minmax(0,1fr) 292px", gap: 0, flex: 1, minHeight: 0 }}>

        {/* ---- left: ad slot ----
            Market watch (and its watchlist editor) was retired — no live
            ticker polling here any more, so it can't compete with actual
            candle-loading for Twelve Data's shared daily quota, and this
            rail is now entirely the ad's. PIP Affiliates' 120×600
            skyscraper creative, fixed pixel size rather than stretched to
            the rail's ~200px usable width, same as any other ad network:
            they serve that exact box, not a responsive one. */}
        {!fullscreen && (
          <aside className="sim-left" style={{ borderRight: "1px solid var(--border)", background: "var(--surface)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
            padding: 14, overflowY: "auto", minHeight: 0 }}>
            <a href="https://clicks.pipaffiliates.com/c?m=131252&c=1297452" target="_blank" rel="noopener"
              referrerPolicy="no-referrer-when-downgrade" style={{ flexShrink: 0 }}>
              <img src="https://ads.pipaffiliates.com/i/131252?c=1297452" width={120} height={600}
                referrerPolicy="no-referrer-when-downgrade" alt="Advertisement" style={{ display: "block", borderRadius: 8 }} />
            </a>
          </aside>
        )}

        {/* ---- centre: chart ---- */}
        <section className="sim-chart-section" style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
          <div className="sim-chartrow" style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* chart — the tool rail that used to live here (drawing
                tools, colour swatches, clear-drawings) is the library's
                own left toolbar now; its own legend already shows the
                symbol/interval/OHLC, so PipTest doesn't draw a second
                one on top of it any more either. */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
              {!restored ? (
                <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 13 }}>
                  Loading…
                </div>
              ) : (
                <TVAdvancedChart
                  symbol={symbol} interval={IV_TO_TV_RES[interval] || "30"} theme={theme}
                  startMs={chartStartRef.current} canDraw={canControl} sessionName={meta.name}
                  onReady={handleReady} onBar={handleBar} onCursor={handleCursor}
                  onState={handleReplayState} onDrawingsChanged={handleDrawingsChanged}
                  onIntervalChanged={handleIntervalChanged}
                  fullscreen={fullscreen} onToggleFullscreen={toggleFullscreen}
                  height="100%"
                />
              )}
            </div>
          </div>

          {/* the replay transport now floats — rendered near the end of this
              component so it can sit anywhere over the workspace */}

          {/* ---- blotter resize handle ----
              zIndex below the floating replay bar (80) — the bar is
              user-draggable and can end up sitting right over this strip,
              and the bar must always be the one on top when that happens
              (it's the thing being actively interacted with; this strip
              is just part of the static layout underneath). That means
              this strip's own mousedown gets silently blocked in whatever
              small area the bar currently covers — move the bar first to
              resize through that spot — which is the right tradeoff over
              having this thin strip paint over the bar. */}
          <div className="hide-sm" onPointerDown={onBlotterResizeStart} onPointerMove={onBlotterResizeMove}
            onPointerUp={onBlotterResizeEnd} onPointerCancel={onBlotterResizeEnd} title="Drag to resize"
            style={{ height: 7, flexShrink: 0, cursor: "row-resize", position: "relative", zIndex: 5,
              background: "var(--surface)", borderTop: "1px solid var(--border)", touchAction: "none" }}>
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 36, height: 3, borderRadius: 2, background: "var(--border)" }} />
          </div>

          {/* ---- blotter ---- */}
          <div style={{ background: "var(--surface)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 2, padding: "0 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              {[["trades", `Trades (${trades.length})`], ["orders", "Orders"], ["positions", "Positions"], ["notes", "Notes"]].map(([id, l]) => (
                <button key={id} className={"tab " + (tab === id ? "on" : "")} onClick={() => setTab(id)}>{l}</button>
              ))}
            </div>
            <div className="scroll" style={{ height: blotterH, overflowY: "auto" }}>
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

              {tab === "orders" && (displayTrade?.status === "watching"
                ? <SingleRow trade={displayTrade} symbol={symbol} kind="order" onCancel={cancelTrade} readOnly={!canTrade} />
                : <Empty title="No working orders" body={canTrade ? "Arm a setup to place a resting order at your entry price." : "Nothing working right now."} />)}

              {tab === "positions" && (displayTrade?.status === "open"
                ? <SingleRow trade={displayTrade} symbol={symbol} kind="position" unreal={unreal} onClose={closeNow} onBE={moveStopToBE} readOnly={!canTrade} />
                : <Empty title="No open position" />)}

              {tab === "notes" && (
                <div style={{ padding: 14 }}>
                  <textarea className="in" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder={"What are you watching for in this session?\n\nBullish market structure\nLiquidity sweep of the lows\nWaiting for a break and retest"} />
                </div>
              )}
            </div>
          </div>

          {/* ================= floating replay bar =================
              Positioned (and clamped) relative to this section, not the
              viewport — it's meant to float "over the chart", and a
              viewport-relative position drifted onto the blotter/right
              panel/resize handle depending on window size and whatever
              spot was last saved. Confining it to this section's own box
              means it can only ever end up over the chart/blotter, never
              outside the workspace it's meant to sit in. */}
          <FloatingBar
            pos={barPos}
            onPos={setBarPos}
            collapsed={barCollapsed}
            onToggleCollapse={() => setBarCollapsed((c) => !c)}
            minWidth={280}
            fitContent
            label="Replay"
          >
            <div style={{ padding: "6px 10px" }}>
              {/* the free-drag scrubber is gone — it needed a bar count
                  up front, which nothing here has any more now that the
                  datafeed pages history itself rather than PipTest
                  fetching a bounded array of it up front (see
                  TRADINGVIEW.md). Replay is forward-only by design: no
                  rewinding once you've seen how a bar played out — see
                  stepForward's own note on why. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 4 }}>
                <span className={playing ? "live" : ""} title={playing ? "Playing" : "Paused"}
                  style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                    background: playing ? "var(--up)" : "var(--dim)" }} />

                <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
                  <button className="btn pri" style={{ padding: "4px 11px" }} disabled={!canControl}
                    onClick={() => setPlaying((p) => !p)} title="Play / pause (space)">
                    <Svg s={13}>{playing ? Ic.pause : Ic.play}</Svg>
                  </button>
                  <button className="btn ghost" style={{ padding: "4px 7px" }} disabled={!canControl}
                    onClick={stepForward} title="Step forward (→)"><Svg s={13}>{Ic.fwd}</Svg></button>
                </div>

                <select className="in" value={stepId} disabled={!canControl}
                  onChange={(e) => setStepId(e.target.value)}
                  title="Time per step — how far Next/Play move the replay"
                  style={{ width: 66, padding: "4px 6px", fontSize: 12.5, flexShrink: 0 }}>
                  {INTERVALS.map((iv) => <option key={iv.id} value={iv.id}>{iv.label}</option>)}
                </select>

                <span className="num" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {cur ? fmtClock(cur.t, interval) : ""}
                </span>
              </div>
            </div>
          </FloatingBar>
        </section>

        {/* ---- right: order ticket ---- */}
        <aside className="sim-right" style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto", minHeight: 0 }}>
          <div style={{ padding: 14 }}>
            <div className="cap" style={{ marginBottom: 12 }}>Setup</div>

            {!canTrade ? (
              displayTrade ? (
                <OpenTicket trade={displayTrade} price={price} unreal={unreal} readOnly />
              ) : (
                <div className="sm mut" style={{ lineHeight: 1.6, padding: "6px 2px" }}>
                  You're viewing this session — only the host trades here. Their setup will show up
                  here live once they arm one.
                </div>
              )
            ) : trade ? (
              <OpenTicket trade={trade} price={price} unreal={unreal} onClose={closeNow} onBE={moveStopToBE}
                onCancel={cancelTrade} />
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

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      <style>{`
        .sim-right { scrollbar-width: thin; }
        @media (max-width: 1200px) {
          .sim-main { grid-template-columns: minmax(0,1fr) 280px !important; }
          .sim-left { display: none !important; }
        }
        @media (max-width: 900px) {
          /* The desktop layout is a fixed 100vh window where the chart and
             order-ticket sit side by side, each scrolling internally —
             that's the right model with room to spare, but collapsing it
             to one column via grid-template-columns alone (the old rule
             here) doesn't turn it into a stack: .sim-main and the chart
             section still tried to *fill* that same fixed height, so a
             phone-width chart, blotter and order ticket all got crushed
             into one short box and drawn on top of each other instead of
             stacking. Mobile gets a genuinely different model instead: the
             whole page scrolls normally, the chart gets one deliberate
             viewport-relative height, and the blotter/order-ticket flow
             below it at their natural height like any other web page. */
          .sim-page { height: auto !important; min-height: 100vh; overflow: visible !important; }
          .sim-main { grid-template-columns: 1fr !important; flex: none !important; min-height: 0 !important; }
          .sim-right { border-left: none !important; border-top: 1px solid var(--border); }
          .sim-chart-section { display: block !important; }
          .sim-chartrow { height: 50vh !important; flex: none !important; }
          /* .hide-sm itself is defined globally in ui.jsx now — every
             page's markup can rely on it, not just this one */
        }
      `}</style>
    </div>
  );
}

/* ---------- pieces ---------- */
function OpenTicket({ trade, price, unreal, onClose, onBE, onCancel, readOnly }) {
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
      {!readOnly && (
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
      )}
      {readOnly && (
        <div className="sm mut" style={{ marginTop: 12, lineHeight: 1.5 }}>
          The host's setup — you're watching, not trading.
        </div>
      )}
    </>
  );
}

function SingleRow({ trade, symbol, kind, unreal, onClose, onBE, onCancel, readOnly }) {
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
            {readOnly ? null : kind === "order"
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

function RoomPanel({ room, isHost, account, joinCode, setJoinCode, roomMsg, wsLive, hostRoom, joinRoom, leaveRoom, closeRoom, kickParticipant, onClose }) {
  return (
    <div className="card" data-pop style={{ position: "absolute", right: 0, top: 36, zIndex: 60, padding: 16, width: 300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="cap">Live room</span>
        <button className="btn ghost" style={{ padding: "2px 7px" }} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {!room ? (
        <>
          <button className="btn pri" style={{ width: "100%", marginBottom: 12 }} onClick={() => hostRoom()}>Share this chart</button>
          <Field label="Join with a code">
            <div style={{ display: "flex", gap: 6 }}>
              <input className="in" value={joinCode} maxLength={6} placeholder="ABC123"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
              <button className="btn" onClick={() => joinRoom()}>Join</button>
            </div>
          </Field>
        </>
      ) : (
        <>
          {/* code + live-sync status get their own block, full width —
              this used to sit beside the Close/Leave buttons in one
              row and collide with them the moment the panel wasn't
              comfortably wider than both put together. */}
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10,
            padding: "11px 14px", marginBottom: 12 }}>
            <div className="num" style={{ fontSize: 23, fontWeight: 700, letterSpacing: ".09em" }}>{room.code}</div>
            <div className="sm mut" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              hosted by {room.host}
              <span title={wsLive ? "Real-time sync connected" : "Falling back to periodic sync"}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5,
                  color: wsLive ? "var(--up)" : "var(--dim)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 4, background: "currentColor" }} />
                {wsLive ? "live" : "syncing…"}
              </span>
            </div>
          </div>

          {/* one action, not two — a host closing ends it for everyone
              on purpose (the Close button); a host "leaving" their own
              room isn't a real option here (see canTrade/isHost above:
              it's their participant entry that makes them the host at
              all), so only a guest ever sees Leave. */}
          {isHost
            ? <button className="btn" style={{ width: "100%", marginBottom: 14, color: "var(--down)", borderColor: "color-mix(in srgb, var(--down) 40%, var(--border))" }}
                onClick={closeRoom}>Close room</button>
            : <button className="btn" style={{ width: "100%", marginBottom: 14 }} onClick={leaveRoom}>Leave room</button>}

          <div className="cap" style={{ marginBottom: 8 }}>
            Participants · {Object.keys(room.participants || {}).length}
          </div>
          <div style={{ display: "grid", gap: 2, marginBottom: 14 }}>
            {Object.entries(room.participants || {}).map(([who, info]) => (
              <div key={who} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <Avatar value={info.avatar} handle={who} size={24} />
                <span className="sm" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {who}{who === account.handle ? " (you)" : ""}
                </span>
                {info.role === "host" ? (
                  <span className="pill b">host</span>
                ) : isHost ? (
                  <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 11.5, color: "var(--down)" }}
                    onClick={() => kickParticipant(who)}>Kick</button>
                ) : (
                  <span className="pill n">viewer</span>
                )}
              </div>
            ))}
          </div>

          <div className="sm mut" style={{ lineHeight: 1.55 }}>
            Sharing is view-only — guests watch live, but only you can trade or drive playback.
            {isHost ? " Closing the room ends it for everyone and clears the chat." : ""}
          </div>
        </>
      )}
      {roomMsg && <div className="sm" style={{ color: "var(--brand)", marginTop: 12, lineHeight: 1.5 }}>{roomMsg}</div>}
    </div>
  );
}

function ChatPanel({ room, account, messages, chatText, setChatText, onSend, busy, onClose }) {
  const listRef = useRef(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className="card" data-pop style={{ position: "absolute", right: 0, top: 36, zIndex: 60,
      width: 300, height: 380, display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <span className="cap">Room chat · {room.code}</span>
        <button className="btn ghost" style={{ padding: "2px 7px" }} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div ref={listRef} className="scroll" style={{ flex: 1, overflowY: "auto", padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 10 }}>
        {!messages.length && (
          <div className="sm mut" style={{ textAlign: "center", marginTop: 26, lineHeight: 1.6, padding: "0 10px" }}>
            No messages yet — say hi. Chat is temporary and clears when the room closes.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.from === account.handle;
          return (
            <div key={m.id} style={{ display: "flex", gap: 6, alignItems: "flex-end",
              flexDirection: mine ? "row-reverse" : "row" }}>
              {!mine && <Avatar value={m.avatar} handle={m.from} size={20} />}
              <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                {!mine && <span className="sm mut" style={{ marginBottom: 2, fontSize: 11 }}>{m.from}</span>}
                <span style={{ padding: "7px 10px", borderRadius: 12, fontSize: 13, lineHeight: 1.4,
                  wordBreak: "break-word", background: mine ? "var(--brand)" : "var(--surface3)",
                  color: mine ? "var(--brandInk)" : "var(--ink)" }}>
                  {censor(m.text)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSend(); }}
        style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
        <input className="in" value={chatText} maxLength={500} placeholder="Message the room…" autoComplete="off"
          onChange={(e) => setChatText(e.target.value)} disabled={busy} />
        <button className="btn pri" type="submit" disabled={busy || !chatText.trim()} style={{ padding: "8px 12px", flexShrink: 0 }}>
          Send
        </button>
      </form>
    </div>
  );
}

function ShortcutHelp({ open, onClose }) {
  const rows = [
    ["Space", "Play / pause replay"], ["→", "Step one bar forward"],
    ["F", "Toggle fullscreen"], ["?", "This panel"],
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
