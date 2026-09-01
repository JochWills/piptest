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

export default function TVAdvancedChart({
  symbol = "BTCUSDT",
  interval = "30",
  theme = "dark",
  startMs,
  onReady,          // (api) => void
  onBar,            // (bar) => void  — every bar the replay reveals
  onCursor,         // (ms, bar) => void
  onDrawingsChanged,// () => void     — for room sync
  onState,          // (state) => void — { playing, atEnd, speed, covered, earliest }; fires when the
                     // replay controller's own state changes, including reaching the end of data on its own
  height = 520,
}) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const apiRef = useRef(null);
  const status = useLibrary();
  const [err, setErr] = useState("");

  const cbs = useRef({ onBar, onCursor, onDrawingsChanged, onReady, onState });
  cbs.current = { onBar, onCursor, onDrawingsChanged, onReady, onState };

  useEffect(() => {
    if (status !== "ready" || !boxRef.current) return;
    let dead = false;

    const { datafeed, control } = createDatafeed({
      cursorMs: startMs ?? Date.now(),
      onCursor: (ms, bar) => cbs.current.onCursor && cbs.current.onCursor(ms, bar),
    });

    const replay = createReplayController({
      control,
      onBar: (bar) => cbs.current.onBar && cbs.current.onBar(bar),
      onState: (s) => cbs.current.onState && cbs.current.onState(s),
    });
    replay.setMarket(symbol, interval);

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
         would let a user step past the cursor and see the future. */
      disabled_features: [
        "header_symbol_search",
        "header_compare",
        "go_to_date",
        "timeframes_toolbar",
      ],
      /* left toolbar shown by default — PipTest no longer has its own
         drawing-tool rail (§5, TRADINGVIEW.md), so this is now the only
         way to draw at all. */
      enabled_features: [
        "seconds_resolution",
        "use_localstorage_for_settings",
        "chart_property_page_trading",
      ],
      overrides: {
        "paneProperties.background": theme === "dark" ? "#171A21" : "#FFFFFF",
        "paneProperties.backgroundType": "solid",
        "mainSeriesProperties.candleStyle.upColor": theme === "dark" ? "#22C55E" : "#16A34A",
        "mainSeriesProperties.candleStyle.downColor": theme === "dark" ? "#EF4444" : "#DC2626",
        "mainSeriesProperties.candleStyle.borderUpColor": theme === "dark" ? "#22C55E" : "#16A34A",
        "mainSeriesProperties.candleStyle.borderDownColor": theme === "dark" ? "#EF4444" : "#DC2626",
        "mainSeriesProperties.candleStyle.wickUpColor": theme === "dark" ? "#22C55E" : "#16A34A",
        "mainSeriesProperties.candleStyle.wickDownColor": theme === "dark" ? "#EF4444" : "#DC2626",
      },
    });

    widgetRef.current = widget;

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
      });
      chart.onSymbolChanged().subscribe(null, () => {
        replay.setMarket(bareSymbol(), chart.resolution());
      });
      /* drawing changes drive room sync */
      widget.subscribe("drawing_event", () => cbs.current.onDrawingsChanged && cbs.current.onDrawingsChanged());
      widget.subscribe("study_event", () => cbs.current.onDrawingsChanged && cbs.current.onDrawingsChanged());

      const api = {
        widget, chart, replay, control, feed,

        /* --- trade visualisation (entry / stop / target zones) --- */
        drawZone({ id, price, color, text }) {
          return chart.createShape({ time: Math.floor(control.cursorMs / 1000), price },
            { shape: "horizontal_line", disableSelection: true, disableSave: true,
              overrides: { linecolor: color, linewidth: 1, linestyle: 2, showLabel: true, text } });
        },
        removeShape(sid) { try { chart.removeEntity(sid); } catch (e) {} },
        clearShapes() { try { chart.removeAllShapes(); } catch (e) {} },

        /* --- layout snapshot: drawings + indicators + settings --- */
        save() { return new Promise((res) => widget.save((s) => res(s))); },
        load(snapshot) { try { widget.load(snapshot); } catch (e) {} },

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
  }, [status, symbol, interval, startMs]); // eslint-disable-line

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
  return <div ref={boxRef} style={{ width: "100%", height }} />;
}

const Frame = ({ children, height }) => (
  <div style={{
    height, display: "grid", placeItems: "center", padding: 24,
    border: "1px solid var(--border, #262B34)", borderRadius: 10,
    color: "var(--muted, #98A2B3)", fontSize: 13,
  }}>{children}</div>
);
