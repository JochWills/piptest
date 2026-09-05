import React, { useEffect, useRef, useState, useCallback } from "react";
import { createDatafeed } from "./datafeed.js";
import { createReplayController } from "./replayController.js";
import { feed } from "./marketFeed.js";

/* ============================================================
   TVAdvancedChart

   Mounts TradingView Advanced Charts and hands back a controller.
   The library must be self-hosted — see TRADINGVIEW.md. It is not
   on npm or any CDN, so this component reports a clear message
   rather than a blank frame when the files are missing.
   ============================================================ */

const LIBRARY_PATH = "/charting_library/";
const SCRIPT = `${LIBRARY_PATH}charting_library.standalone.js`;

function useLibrary() {
  const [status, setStatus] = useState(() => (window.TradingView?.widget ? "ready" : "loading"));
  useEffect(() => {
    if (window.TradingView?.widget) { setStatus("ready"); return; }
    let dead = false;
    const el = document.createElement("script");
    el.src = SCRIPT; el.async = true;
    el.onload = () => !dead && setStatus(window.TradingView?.widget ? "ready" : "missing");
    el.onerror = () => !dead && setStatus("missing");
    document.head.appendChild(el);
    return () => { dead = true; };
  }, []);
  return status;
}

/* Returns `incoming` with every viewport-carrying field replaced by
   the equivalent from `mine` — the chart's timeScale (m_barSpacing is
   zoom, m_rightOffset is scroll position) and each pane's axis state
   and stretch. Those are the fields that make widget.load() move the
   view; everything else in a snapshot (drawings, indicators, styling)
   is what a room sync actually wants to apply. Anything missing on
   either side is simply left alone, so an unexpected snapshot shape
   degrades to "applies as-is" rather than throwing. */
function keepLocalViewport(incoming, mine) {
  if (!incoming || !Array.isArray(incoming.charts) || !mine || !Array.isArray(mine.charts)) return incoming;
  return {
    ...incoming,
    charts: incoming.charts.map((c, i) => {
      const m = mine.charts[i];
      if (!m) return c;
      const out = { ...c };
      if (m.timeScale) out.timeScale = m.timeScale;
      if (Array.isArray(c.panes) && Array.isArray(m.panes)) {
        out.panes = c.panes.map((pane, j) => {
          const mp = m.panes[j];
          if (!mp) return pane;
          const p = { ...pane };
          if (mp.leftAxisesState) p.leftAxisesState = mp.leftAxisesState;
          if (mp.rightAxisesState) p.rightAxisesState = mp.rightAxisesState;
          if (mp.overlayPriceScales) p.overlayPriceScales = mp.overlayPriceScales;
          if (mp.priceScaleRatio !== undefined) p.priceScaleRatio = mp.priceScaleRatio;
          if (mp.stretchFactor !== undefined) p.stretchFactor = mp.stretchFactor;
          return p;
        });
      }
      return out;
    }),
  };
}

/* Returns `snapshot` with every hand-drawn shape removed from every
   pane, leaving indicators, panes, styling and the series itself.

   Drawings get their own sync channel (getDrawings/applyDrawings
   below) precisely so they DON'T have to travel inside a layout
   snapshot — applying one of those means widget.load(), which tears
   the whole chart down and rebuilds it. Leaving drawings in as well
   would undo the point twice over: every pen stroke would change the
   snapshot and trigger that rebuild, and each drawing would then
   exist twice on the receiving chart (once restored by the load, once
   mirrored). Stripped here, a snapshot only changes when something
   structural does — adding an indicator — so a room-mate's chart
   stops reloading during ordinary drawing work entirely. */
function stripDrawings(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.charts)) return snapshot;
  return {
    ...snapshot,
    charts: snapshot.charts.map((c) => {
      if (!Array.isArray(c.panes)) return c;
      return {
        ...c,
        panes: c.panes.map((pane) => {
          if (!Array.isArray(pane.sources)) return pane;
          return { ...pane, sources: pane.sources.filter((s) => !String(s?.type || "").startsWith("LineTool")) };
        }),
      };
    }),
  };
}

/* Collapses duplicate `study_Volume` sources in every pane down to
   one. Self-heals a session whose saved snapshot already accumulated
   several — see the `create_volume_indicator_by_default` note by the
   widget constructor below for how that happened. Scoped to Volume
   specifically, not "any duplicate study": collapsing same-type
   duplicates in general would delete a second EMA or RSI someone
   actually added on purpose with different settings, which this bug
   never touched. */
function dedupeVolume(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.charts)) return snapshot;
  return {
    ...snapshot,
    charts: snapshot.charts.map((c) => {
      if (!Array.isArray(c.panes)) return c;
      return {
        ...c,
        panes: c.panes.map((pane) => {
          if (!Array.isArray(pane.sources)) return pane;
          let seenVolume = false;
          const sources = pane.sources.filter((s) => {
            if (s?.type !== "study_Volume") return true;
            if (seenVolume) return false;
            seenVolume = true;
            return true;
          });
          return sources.length === pane.sources.length ? pane : { ...pane, sources };
        }),
      };
    }),
  };
}

export default function TVAdvancedChart({
  symbol = "BTCUSDT",
  interval = "30",
  theme = "dark",
  startMs,
  onReady,          // (api) => void
  onBar,            // (bar) => void  — every bar the replay reveals
  onCursor,         // (ms, bar) => void
  onDrawingsChanged,// () => void     — for room sync
  onState,          // (state) => void — { playing, atEnd, stepMs, covered, earliest }; fires when the
                     // replay controller's own state changes, including reaching the end of data on its own
  onIntervalChanged,// (tvResolution) => void — the chart's own native resolution control changed the
                     // timeframe directly (PipTest has no button row of its own for this any more);
                     // a raw TV resolution string ("60", not "1h") since the caller already knows how
                     // to map that back, same as the interval/startMs props coming in the other way
  canDraw = true,   // false for a room viewer — hides the drawing toolbar entirely rather than
                     // just disabling PipTest's own UI around it, since drawing is now the library's
  sessionName,      // shown as a plain label in the chart's own header — see the headerReady block
                     // below. Read once at mount; PipTest has no way to rename a session mid-play,
                     // so there's nothing to keep this in sync with after that.
  height = 520,
}) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const apiRef = useRef(null);
  const status = useLibrary();
  const [err, setErr] = useState("");

  const cbs = useRef({ onBar, onCursor, onDrawingsChanged, onReady, onState, onIntervalChanged });
  cbs.current = { onBar, onCursor, onDrawingsChanged, onReady, onState, onIntervalChanged };

  useEffect(() => {
    if (status !== "ready" || !boxRef.current) return;
    let dead = false;
    let loadGen = 0; // see api.load() below

    /* `dead` already guards onChartReady below against a stale widget's
       late callback — it needs to guard these three too. datafeed/replay
       run their own async work (realign's data fetch, a jumpTo's bar
       lookup) that nothing cancels just because this effect's cleanup
       tore the widget down; a torn-down instance's callback can still
       land after a newer mount has taken over (e.g. the room-sync fixup
       remount right after a fresh join — see the room poll effect in
       Simulator.jsx) and silently overwrite the new one's correct state
       with its own stale result if allowed through. */
    const { datafeed, control } = createDatafeed({
      cursorMs: startMs ?? Date.now(),
      onCursor: (ms, bar) => !dead && cbs.current.onCursor && cbs.current.onCursor(ms, bar),
    });

    const replay = createReplayController({
      control,
      onBar: (bar, stepRes) => !dead && cbs.current.onBar && cbs.current.onBar(bar, stepRes),
      onState: (s) => !dead && cbs.current.onState && cbs.current.onState(s),
    });
    replay.setMarket(symbol, interval);

    /* Applied both at widget construction (below) AND again after every
       widget.load() (see the api.load() reapply, further down). A saved
       session's own snapshot carries its own paneProperties/candle colors
       from whenever it was last saved — often from before this palette
       existed, or from the dark theme's own 'gradient' background default
       (see ChartPropertiesOverrides in charting_library.d.ts) rather than
       our flat #161A21 — and widget.load() restores that verbatim,
       silently undoing the constructor's overrides. Reasserting these
       right after every load() is what actually pins the color for good,
       instead of only fixing it for a chart with nothing saved yet. */
    const chartOverrides = {
      "paneProperties.background": theme === "dark" ? "#161A21" : "#FFFFFF",
      "paneProperties.backgroundType": "solid",
      "mainSeriesProperties.candleStyle.upColor": theme === "dark" ? "#22C55E" : "#16A34A",
      "mainSeriesProperties.candleStyle.downColor": theme === "dark" ? "#EF4444" : "#DC2626",
      "mainSeriesProperties.candleStyle.borderUpColor": theme === "dark" ? "#22C55E" : "#16A34A",
      "mainSeriesProperties.candleStyle.borderDownColor": theme === "dark" ? "#EF4444" : "#DC2626",
      "mainSeriesProperties.candleStyle.wickUpColor": theme === "dark" ? "#22C55E" : "#16A34A",
      "mainSeriesProperties.candleStyle.wickDownColor": theme === "dark" ? "#EF4444" : "#DC2626",
    };

    const widget = new window.TradingView.widget({
      container: boxRef.current,
      library_path: LIBRARY_PATH,
      datafeed,
      symbol,
      interval,
      locale: "en",
      timezone: "Etc/UTC",
      autosize: true,
      theme: theme === "dark" ? "dark" : "light",
      /* Replay is ours, so hide the library's own timeframe-jumping UI that
         would let a user step past the cursor and see the future. A room
         viewer (canDraw false) also loses the left toolbar entirely — it's
         the library's own drawing tools now (§5, TRADINGVIEW.md), so
         hiding it is the only way to actually stop a viewer drawing,
         same as PipTest disabling its own tool rail used to. */
      disabled_features: [
        "header_symbol_search",
        "header_compare",
        "go_to_date",
        "timeframes_toolbar",
        /* The library's own fullscreen button puts only its own iframe into
           the browser's native fullscreen — PipTest's replay bar, trade
           ticket and everything else living outside that iframe would just
           disappear behind it, with no z-index able to bring them back (a
           fullscreened element sits in the browser's top layer, above the
           page's entire normal stacking context). Simulator.jsx has its own
           fullscreen toggle instead, scoped to the whole workspace — see
           its toggleFullscreen — so this one, which can't be fixed, is
           hidden rather than left as a second control that quietly breaks
           the UI. */
        "header_fullscreen_button",
        /* The library adds its own Volume study on every widget mount by
           default — its own "_once" bookkeeping for not repeating that is
           scoped to the browser's localStorage, which has nothing to do
           with PipTest's own saved layout coming back from the server a
           moment later via api.load(). Every reopen mounted a fresh
           widget (one new auto-added Volume) on top of whatever the
           saved snapshot already had (which already included one from
           last time) — the visible "another Volume every time I reopen
           this session" bug. The saved layout is the single source of
           truth for what's on the chart; nothing needs the library to
           add its own guess on top of that. (dedupeVolume in load(),
           below, is the other half of this fix — it's what un-stacks a
           session that already accumulated several before this line
           existed.) */
        "create_volume_indicator_by_default",
        /* header_resolutions travels with left_toolbar here rather than
           living its own life: a room viewer isn't meant to be able to
           steer the shared chart at all, and letting them switch their
           own local resolution here would be exactly that, just through
           a different control than the one already locked down. */
        ...(canDraw ? [] : ["left_toolbar", "header_resolutions"]),
      ],
      enabled_features: [
        "seconds_resolution",
        "use_localstorage_for_settings",
        "chart_property_page_trading",
      ],
      loading_screen: {
        backgroundColor: theme === "dark" ? "#161A21" : "#FFFFFF",
        foregroundColor: theme === "dark" ? "#161A21" : "#FFFFFF",
      },
      overrides: chartOverrides,
    });

    widgetRef.current = widget;

    /* PipTest's own header used to carry the session name; now that
       timeframe switching lives in the library's own toolbar (see
       Simulator's handleIntervalChanged), the name rides along there
       too rather than being the one thing left behind in a bar that
       otherwise only ever showed market info. createButton's a plain
       HTMLElement handle, not a React node — styled by hand here to
       read as a label, not one of the library's own icon buttons, and
       inert (no click handler) since it's not standing in for the
       session-switcher shortcut the old spot doubled as. Cleanup is
       just "the whole widget goes away" (below) — nothing extra to
       remove on its own. */
    if (sessionName) {
      widget.headerReady().then(() => {
        if (dead) return;
        const btn = widget.createButton({ align: "right" });
        btn.textContent = sessionName;
        btn.title = sessionName;
        btn.style.cursor = "default";
        btn.style.opacity = "1";
        btn.style.fontWeight = "600";
        btn.style.maxWidth = "180px";
        btn.style.overflow = "hidden";
        btn.style.textOverflow = "ellipsis";
        btn.style.whiteSpace = "nowrap";
        /* align: "right" drops it in at the *end* of the right-hand
           row — after settings/fullscreen/screenshot, right at the
           bar's outer edge — and the library exposes nothing finer
           than that. The toolbar row is a flex container of
           [separator, group] pairs either side of one flexible
           spacer (class starting "fill-") that's what actually
           divides "left-aligned" from "right-aligned"; everything
           after it is the icon cluster, ending with ours. Moving our
           own [separator, group] pair to right after that spacer
           — instead of trying to reorder around library-internal
           siblings some other way — puts it before the icon cluster
           while leaving their own separator with them, so there's
           still a clean divider on each side of it. Every class name
           here is the library's own generated one and could change
           with a version bump; if the lookup ever comes up empty this
           just leaves the label at the end of the bar rather than
           throwing. */
        try {
          const group = btn.parentElement.parentElement;
          const row = group.parentElement;
          const fill = row.querySelector('[class*="fill-"]');
          const ourSeparator = group.previousElementSibling;
          if (fill && ourSeparator) {
            row.insertBefore(ourSeparator, fill.nextSibling);
            row.insertBefore(group, ourSeparator.nextSibling);
          }
        } catch (e) {}
      });
    }

    widget.onChartReady(() => {
      if (dead) return;
      const chart = widget.activeChart();

      /* keep the replay engine pointed at whatever the user switches to.
         Symbols now come from two exchanges (BINANCE for crypto, PIPTEST
         for the Twelve Data-backed forex/index markets — see datafeed.js),
         so strip whichever prefix is present rather than assuming one. */
      const bareSymbol = () => chart.symbol().split(":").pop();
      chart.onIntervalChanged().subscribe(null, (res) => {
        replay.setMarket(bareSymbol(), res);
        /* fires for every resolution change, including the one Simulator
           itself triggers via chart.setResolution — either to commit a
           switch that started here, or to snap back after the caller
           declined one. Simulator's own handler no-ops on the second
           case (its interval-unchanged guard), so this doesn't loop or
           re-prompt. */
        if (!dead) cbs.current.onIntervalChanged && cbs.current.onIntervalChanged(res);
      });
      chart.onSymbolChanged().subscribe(null, () => {
        replay.setMarket(bareSymbol(), chart.resolution());
      });
      /* Drawing and indicator changes drive room sync, but down two
         completely different paths now (drawing-level mirror vs.
         layout snapshot), so the caller needs to know which just
         happened — see stripDrawings above. */
      widget.subscribe("drawing_event", () => cbs.current.onDrawingsChanged && cbs.current.onDrawingsChanged("drawing"));
      widget.subscribe("study_event", () => cbs.current.onDrawingsChanged && cbs.current.onDrawingsChanged("study"));

      /* Shapes PipTest draws itself (entry/stop/target zones) — they're
         derived from trade state that each side already has, so they
         must never be picked up as "the user drew this" and mirrored
         to a room, or a viewer would get two of each. */
      const ownShapes = new Set();
      /* host's entity id -> our local entity id for the copy of it.
         Keying on the AUTHOR's id, rather than on the drawing's
         contents, is what lets a shape the host drags be updated in
         place here (setPoints) instead of being deleted and recreated
         on every mouse-move frame. PENDING marks a create that's
         in-flight, so a second sync arriving mid-create doesn't make
         a duplicate. */
      const mirrored = new Map();
      const PENDING = "__pending__";

      /* The actual fix for a viewer being able to edit a mirrored
         drawing. createMultipointShape's own disableSelection option
         is not enough on its own — verified directly against a real
         shape: one created with only that option still answers
         isUserEditEnabled() true. Selection and edit are separate
         switches here, so both get set explicitly through the
         documented per-shape API, on every shape this mirror ever
         touches. */
      function lockDown(shape) {
        try { shape.setSelectionEnabled(false); } catch (e) {}
        try { shape.setUserEditEnabled(false); } catch (e) {}
      }

      const api = {
        widget, chart, replay, control, feed,

        /* --- trade visualisation (entry / stop / target zones) ---
           createShape resolves asynchronously (Promise<EntityId>, per
           charting_library.d.ts) — it does NOT hand back an id
           synchronously. Treating its return value as if it were
           already the id (the bug this replaced) meant removeShape
           was later called with the pending Promise object itself,
           chart.removeEntity() silently failed on it, and the line
           stayed on the chart until something else tore the whole
           chart down (a refresh, a market/session switch). A handle
           that resolves in place — and remembers a removal that
           arrives before creation finishes — fixes that, and as a
           side effect fixes ownShapes too: it was previously being
           filled with Promises that could never match a real shape
           id, so getDrawings() below never actually recognised these
           as "ours" and would have offered to mirror them into a room
           as if a viewer had hand-drawn them. */
        drawZone({ price, color, text }) {
          const handle = { id: null, dead: false };
          chart.createShape({ time: Math.floor(control.cursorMs / 1000), price },
            { shape: "horizontal_line", disableSelection: true, disableSave: true,
              overrides: { linecolor: color, linewidth: 1, linestyle: 2, showLabel: true, text } })
            .then((sid) => {
              if (sid == null) return;
              if (handle.dead) { try { chart.removeEntity(sid); } catch (e) {} return; }
              handle.id = sid;
              ownShapes.add(sid);
            })
            .catch(() => {});
          return handle;
        },
        removeShape(handle) {
          if (!handle) return;
          handle.dead = true;
          if (handle.id != null) { ownShapes.delete(handle.id); try { chart.removeEntity(handle.id); } catch (e) {} }
        },
        clearShapes() { ownShapes.clear(); mirrored.clear(); try { chart.removeAllShapes(); } catch (e) {} },

        /* --- layout snapshot: indicators + panes + settings ---
           NOT drawings, it turns out — confirmed empirically that a
           saved snapshot never contains a hand-drawn shape at all, no
           matter how it's captured/restored. This is a pre-existing
           gap that predates rooms entirely (a solo session loses its
           drawings across a plain page reload too) — every reference
           to "load a layout" in this file and Simulator.jsx means
           "indicators/panes/settings", not drawings, until that's
           fixed separately. charting_library.d.ts has a real
           getLineToolsState()/applyLineToolsState() pair for exactly
           this, but they need the `saveload_separate_drawings_storage`
           featureset AND (per testing) a real save_load_adapter
           actually wired up before they return anything — a
           genuinely bigger, separate piece of work, not attempted
           here. */
        save() { return new Promise((res) => widget.save((s) => res(s))); },

        /* ---- drawing sync, without touching the chart itself ----

           What a room actually needs to share is the drawings, and
           routing those through a layout snapshot was the whole
           problem: widget.load() is a full teardown-and-rebuild of
           the chart (series destroyed, bars re-requested, panes
           reconstructed), so every stroke the host made reloaded the
           viewer's chart from scratch. Splicing the local viewport
           into the incoming snapshot fixed WHERE it landed but not
           the rebuild itself, which is the visible flash.

           So don't send a snapshot for drawings at all. Read the
           shapes out one by one here, send that list, and let the
           receiver add/move/remove individual shapes on its live
           chart. Nothing is torn down, so there is nothing to flash:
           the view cannot move because it is never rebuilt. */
        getDrawings() {
          let all = [];
          try { all = chart.getAllShapes() || []; } catch (e) { return []; }
          const out = [];
          /* Copies of someone else's drawings are not ours to
             re-publish — only the host can ever draw in a room today
             (sharing is view-only), but this still guards against
             re-broadcasting a mirrored shape back as if newly drawn,
             which would otherwise add another copy on every round
             trip. */
          const mirrorIds = new Set(mirrored.values());
          for (const { id, name } of all) {
            if (ownShapes.has(id) || mirrorIds.has(id)) continue;
            try {
              const shape = chart.getShapeById(id);
              if (!shape) continue;
              const points = shape.getPoints().map((p) => ({ time: p.time, price: p.price }));
              if (!points.length) continue;
              /* getProperties/setProperties are a documented round
                 trip, so the styling travels without having to know
                 which override keys each of the ~90 tool types uses.
                 JSON-cycled because whatever ends up here is going
                 into a room document over the wire regardless. */
              let props = null;
              try { props = JSON.parse(JSON.stringify(shape.getProperties())); } catch (e) {}
              out.push({ key: String(id), name, points, props });
            } catch (e) { /* a shape mid-creation can't be read yet — next event catches it */ }
          }
          return out;
        },

        applyDrawings(list) {
          if (!Array.isArray(list)) return;
          const seen = new Set();

          for (const d of list) {
            if (!d || !d.key || !Array.isArray(d.points) || !d.points.length) continue;
            seen.add(d.key);
            const existing = mirrored.get(d.key);
            if (existing === PENDING) continue; // its create will land with the current points

            if (existing != null) {
              /* Update in place — this is the path a host dragging a
                 line takes, and it's why the key is the host's id. */
              try {
                const shape = chart.getShapeById(existing);
                if (shape) {
                  shape.setPoints(d.points);
                  if (d.props) { try { shape.setProperties(d.props); } catch (e) {} }
                  lockDown(shape);
                  continue;
                }
              } catch (e) { /* gone from under us — fall through and recreate */ }
              /* Recreating without clearing the old one first is how a
                 failed update turns into a permanent duplicate: the
                 shape is still on the chart, we've just stopped
                 tracking it, so nothing will ever remove it again. */
              try { chart.removeEntity(existing); } catch (e) {}
              mirrored.delete(d.key);
            }

            mirrored.set(d.key, PENDING);
            let creating;
            try {
              creating = chart.createMultipointShape(d.points, {
                shape: d.name,
                /* A mirror is not the viewer's own work: it stays out
                   of their objects tree, and disableSave keeps it out
                   of their own saved session layout — otherwise a
                   viewer would quietly inherit the host's drawings
                   permanently.

                   disableSelection alone turned out NOT to be enough
                   to stop a viewer editing it — confirmed directly: a
                   shape created with only this option still reports
                   isUserEditEnabled() true. Selection and edit are
                   apparently separate switches in this library, so
                   lockDown() below calls both explicitly right after
                   creation, which is the only place actually verified
                   to close it. */
                /* deliberately NOT `lock: true` — a locked drawing
                   refuses setPoints without reporting failure, which
                   would quietly freeze every mirror at wherever it was
                   first created. */
                disableSelection: true, disableSave: true, disableUndo: true,
                showInObjectsTree: false,
              });
            } catch (e) { mirrored.delete(d.key); continue; }

            Promise.resolve(creating).then((newId) => {
              if (dead) return;
              if (newId == null) { mirrored.delete(d.key); return; }
              /* the host may have deleted it while this was in flight */
              if (mirrored.get(d.key) !== PENDING) { try { chart.removeEntity(newId); } catch (e) {} return; }
              mirrored.set(d.key, newId);
              try {
                const shape = chart.getShapeById(newId);
                if (d.props) { try { shape.setProperties(d.props); } catch (e) {} }
                lockDown(shape);
              } catch (e) {}
            }).catch(() => { mirrored.delete(d.key); });
          }

          for (const [key, id] of Array.from(mirrored)) {
            if (seen.has(key)) continue;
            if (id === PENDING) { mirrored.delete(key); continue; }
            mirrored.delete(key);
            try { chart.removeEntity(id); } catch (e) {}
          }
        },

        /* What a room gets: the structural snapshot with drawings
           taken out, plus the drawings as their own list. Distinct
           from save() above, which stays whole because a solo
           session restoring itself genuinely does want everything
           back in one go. */
        async saveShared() {
          const layout = await new Promise((res) => widget.save((s) => res(s)));
          return { layout: stripDrawings(layout), drawings: api.getDrawings() };
        },
        /* The viewport is stored INSIDE the snapshot itself — the
           chart's `timeScale` (m_barSpacing = zoom, m_rightOffset =
           scroll) and each pane's axis state. So loading a room-mate's
           snapshot verbatim drags your view to wherever THEY were
           looking, which is exactly what a viewer sees as the chart
           jumping sideways every time a drawing syncs across.

           Letting it move and then yanking it back afterwards is what
           produced the visible "jumps to the side and snaps back" — so
           don't let it move at all: splice OUR OWN current values for
           those specific fields into the incoming snapshot first, and
           everything else (drawings, indicators, styling) applies with
           the view left exactly where it was. The old capture/restore
           stays underneath as a safety net for anything that still
           slips through; when the splice does its job those calls are
           no-ops, restoring a range that never changed. `loadGen`
           guards against a second load() landing mid-flight and
           fighting this one over which view wins. */
        load(rawSnapshot) {
          const snapshot = dedupeVolume(rawSnapshot);
          const gen = ++loadGen;
          let range = null;
          try { range = chart.getVisibleRange(); } catch (e) {}

          const apply = (toApply) => {
            if (dead || gen !== loadGen) return;
            /* widget.load() resolves once the restore actually lands —
               reasserting overrides before that finishes would just get
               overwritten by the load itself. Reassert once it settles
               (and, defensively, once more synchronously in case this
               build's load() doesn't actually return a thenable). */
            const reassert = () => { if (!dead && gen === loadGen) { try { chart.applyOverrides(chartOverrides); } catch (e) {} } };
            try {
              const p = widget.load(toApply);
              if (p && typeof p.then === "function") p.then(reassert).catch(() => {});
            } catch (e) {}
            reassert();
            /* getVisibleRange() can come back {from:0,to:0} (or otherwise
               degenerate) if the chart hasn't actually painted a real
               range yet — restoring that verbatim is how a load() ends
               up snapping the view to 1 Jan 1970 instead of leaving it
               alone. Only restore something that looks like an actual
               span of real calendar time. */
            if (range && Number.isFinite(range.from) && Number.isFinite(range.to)
                && range.from > 0 && range.to > range.from) {
              const restore = () => {
                if (dead || gen !== loadGen) return;
                /* setVisibleRange can reject asynchronously (a real,
                   observed uncaught error from the library's own
                   internals when a second call landed while an
                   earlier one on the same chart was still in flight)
                   — a synchronous try/catch alone doesn't catch that,
                   so this also swallows the rejection explicitly. */
                try { Promise.resolve(chart.setVisibleRange(range)).catch(() => {}); } catch (e) {}
              };
              restore();
              if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
              [100, 300, 800, 1500].forEach((t) => setTimeout(restore, t));
            }
          };

          /* our own snapshot is the only place the local viewport
             values exist in the same shape the incoming one uses, so
             take one to splice from; if that fails for any reason,
             fall back to applying theirs as-is rather than dropping
             the drawing update entirely. */
          try {
            widget.save((mine) => apply(keepLocalViewport(snapshot, mine)));
          } catch (e) {
            apply(snapshot);
          }
        },

        setTheme(next) { try { widget.changeTheme(next === "dark" ? "Dark" : "Light"); } catch (e) {} },
        remove() { try { widget.remove(); } catch (e) {} },
      };

      apiRef.current = api;
      cbs.current.onReady && cbs.current.onReady(api);
    });

    return () => {
      dead = true;
      try { widget.remove(); } catch (e) {}
      widgetRef.current = null; apiRef.current = null;
    };
  }, [status, symbol, interval, startMs, canDraw]); // eslint-disable-line

  useEffect(() => { apiRef.current && apiRef.current.setTheme(theme); }, [theme]);

  if (status === "loading") {
    return <Frame height={height}>Loading chart library…</Frame>;
  }
  if (status === "missing") {
    return (
      <Frame height={height}>
        <div style={{ maxWidth: 460, textAlign: "center", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Advanced Charts isn't installed yet</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            TradingView doesn't distribute this library publicly, so it can't be fetched from a CDN.
            Request access, then copy the package into <code>public/charting_library/</code>.
            See TRADINGVIEW.md for the steps.
          </div>
        </div>
      </Frame>
    );
  }
  return <div ref={boxRef} style={{ width: "100%", height, background: theme === "dark" ? "#161A21" : "#FFFFFF" }} />;
}

const Frame = ({ children, height }) => (
  <div style={{
    height, display: "grid", placeItems: "center", padding: 24,
    border: "1px solid var(--border, #262B34)", borderRadius: 10,
    color: "var(--muted, #98A2B3)", fontSize: 13,
  }}>{children}</div>
);
