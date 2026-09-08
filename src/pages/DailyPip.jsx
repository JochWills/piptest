import React, { useEffect, useRef, useState } from "react";
import TVAdvancedChart from "../tv/TVAdvancedChart.jsx";
import { IV_TO_TV_RES } from "../tv/marketFeed.js";
import { barMsOf } from "../theme.js";
import { Card, Field, Svg, Ic } from "../components/ui.jsx";
import Logo from "../components/Logo.jsx";
import Avatar from "../components/Avatar.jsx";
import { api, API_ENABLED } from "../lib/api.js";
import { validateSetup, buildSetup, runEngine, bookTrade, fmtPrice, fmtMoney, fmtR } from "../lib/trading.js";

/* ============================================================
   DailyPip — "The Daily Pip"

   A separate mode from Simulator, deliberately: one shared historical
   chart per UTC day (server-picked, see server/dailyPip.js), dates
   hidden, one trade, a 3-minute countdown, then an auto-playing
   reveal with no manual controls and no rewind (this component simply
   never calls replay.jumpTo — the only backward-capable primitive in
   the replay controller — so there's nothing to disable). Reuses the
   same chart/replay/trading building blocks Simulator does, but is
   its own page, not a mode flag bolted onto Simulator.jsx.

   Trust boundary, same as the rest of the trade system: the result is
   computed here, client-side, and the server just records it (one
   attempt per user per UTC day, enforced server-side via a unique
   index — see routes.js). Nothing anywhere re-verifies a trade's
   outcome server-side; this doesn't add a new gap, just inherits the
   existing one.
   ============================================================ */

const COUNTDOWN_S = 180;
const NO_TRADE_REVEAL_BARS = 60; // shorter fixed window when nothing was armed at all
const EQUITY = 10000; // arbitrary — R-multiple scoring is invariant to it (R = pnl/riskAmt, both scale with equity together)

export default function DailyPip({ account, theme, onExit }) {
  const [phase, setPhase] = useState("loading");
  // { challenge, attempt, streak, maxRevealBars } from GET /daily-pip/today
  const [today, setToday] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  const load = () => {
    if (!API_ENABLED) { setPhase("ineligible"); return; }
    setPhase("loading");
    api.dailyPipToday().then((d) => {
      setToday(d);
      setPhase(d.attempt ? "already-played" : "arming");
    }).catch((e) => { setErrMsg(e?.message || "Couldn't load today's Pip."); setPhase("error"); });
  };
  useEffect(load, []);

  /* ---------- setup form (arming phase) ---------- */
  const [form, setForm] = useState({ dir: "long", entry: "", stop: "", target: "", riskPct: "1.0" });
  const [formErr, setFormErr] = useState("");
  const [armedTrade, setArmedTrade] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_S);
  const armedTradeRef = useRef(null);
  useEffect(() => { armedTradeRef.current = armedTrade; }, [armedTrade]);
  const countdownDoneRef = useRef(false);

  const entryVal = parseFloat(form.entry) || 0;
  const setupErrors = form.stop
    ? validateSetup({ dir: form.dir, entry: entryVal, stop: form.stop, target: form.target, riskPct: form.riskPct, equity: EQUITY, price: null })
    : [];

  const armSetup = () => {
    if (phase !== "arming" || countdownDoneRef.current) return;
    const errs = validateSetup({ dir: form.dir, entry: entryVal, stop: form.stop, target: form.target, riskPct: form.riskPct, equity: EQUITY, price: null });
    if (errs.length) { setFormErr(errs[0]); return; }
    setFormErr("");
    setArmedTrade(buildSetup({
      ...form, entry: entryVal, equity: EQUITY,
      symbol: today.challenge.symbol, interval: today.challenge.interval,
      note: "", atMarket: false, ts: today.challenge.startMs,
    }));
  };

  /* ---------- chart + reveal ---------- */
  const chartCtlRef = useRef(null);
  const revealTradeRef = useRef(null);
  const barsRef = useRef(0);
  const lastBarRef = useRef(null);
  const submittedRef = useRef(false);
  const [result, setResult] = useState(null); // { traded, dir, entry, exit, stop, target, r, pnl, reason }

  const startReveal = () => {
    setPhase("revealing");
    const ctl = chartCtlRef.current;
    revealTradeRef.current = armedTradeRef.current;
    barsRef.current = 0;
    if (!ctl) { finishAttempt(armedTradeRef.current, null, null); return; }
    ctl.replay.setStep(barMsOf(today.challenge.interval));
    ctl.replay.play();
  };

  useEffect(() => {
    if (phase !== "arming") return;
    setSecondsLeft(COUNTDOWN_S);
    countdownDoneRef.current = false;
    /* The tick only ever updates state — starting the reveal is a real
       side effect (touches refs, calls the chart's replay API), which
       doesn't belong inside a state updater function: React expects
       those to be pure, and can invoke one more than once to check
       that (StrictMode/dev builds) or otherwise not treat it as a
       place to trigger anything. The actual "time's up" trigger is
       the effect below, reacting to secondsLeft reaching 0 instead. */
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "arming" && secondsLeft === 0 && !countdownDoneRef.current) {
      countdownDoneRef.current = true;
      startReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  const handleBar = (rawBar) => {
    if (phase !== "revealing") return;
    barsRef.current += 1;
    const b = { t: rawBar.time * 1000, o: rawBar.open, h: rawBar.high, l: rawBar.low, c: rawBar.close };
    lastBarRef.current = b;
    const t0 = revealTradeRef.current;
    if (t0) {
      const { trade: t1, closed } = runEngine(t0, [b], -1, 0);
      revealTradeRef.current = t1;
      if (closed.length) {
        chartCtlRef.current?.replay.pause();
        finishAttempt(t0, closed[0], closed[0].reason);
        return;
      }
    }
    const cap = revealTradeRef.current ? (today?.maxRevealBars || 400) : NO_TRADE_REVEAL_BARS;
    if (barsRef.current >= cap) {
      chartCtlRef.current?.replay.pause();
      const t = revealTradeRef.current;
      if (t && t.status === "open") {
        finishAttempt(t, bookTrade(t, b.c, "timeout", b.t), "timeout");
      } else if (t && t.status === "watching") {
        finishAttempt(t, null, "unfilled");
      } else {
        finishAttempt(null, null, null);
      }
    }
  };

  const finishAttempt = async (armed, closedRec, reason) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const body = {
      challengeDate: today.challenge.challengeDate,
      traded: !!armed,
      dir: armed?.dir ?? null, qty: armed?.qty ?? null, entry: armed?.entry ?? null,
      exitPrice: closedRec?.exit ?? null, stop: armed?.stop ?? null, target: armed?.target ?? null,
      r: closedRec?.r ?? 0, pnl: closedRec?.pnl ?? 0, reason: reason ?? null,
    };
    setResult(body);
    /* Awaited, not fired-and-forgotten: ResultView fetches the day's
       leaderboard the moment it mounts, and only flipping to "result"
       once the submit has actually landed (or failed) is what stops
       that fetch racing ahead of this exact attempt being recorded —
       otherwise a player could load the board a beat before their own
       just-submitted result was in it. */
    try {
      const res = await api.dailyPipSubmit(body);
      setToday((t) => ({ ...t, attempt: res.attempt, streak: res.streak }));
    } catch (e) {
      // still show the result locally even if the POST failed — the
      // server call is what makes it official/leaderboard-visible,
      // but the player's own screen shouldn't just hang on a network blip
    }
    setPhase("result");
  };

  if (!account) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }}><span className="spinner" /></div>;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={26} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>The Daily Pip</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {today && today !== "error" && (
            <span className="sm mut">
              {today.streak?.current > 0 ? `${today.streak.current}-day streak` : "No streak yet"}
            </span>
          )}
          <Avatar value={account.avatar} handle={account.handle || ""} size={26} />
          <button className="btn ghost" onClick={onExit}>Back to Analytics</button>
        </div>
      </header>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        {phase === "loading" && <span className="spinner" />}

        {phase === "ineligible" && (
          <Card style={{ padding: 24, maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Needs an account</div>
            <div className="sm mut" style={{ lineHeight: 1.6 }}>
              The Daily Pip needs a shared leaderboard and a server-enforced one-attempt-a-day
              limit, so it only works with the API configured — not in local-only mode.
            </div>
          </Card>
        )}

        {phase === "error" && (
          <Card style={{ padding: 24, maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Couldn't load today's Pip</div>
            <div className="sm mut" style={{ marginBottom: 14 }}>{errMsg}</div>
            <button className="btn pri" onClick={load}>Try again</button>
          </Card>
        )}

        {phase === "already-played" && today && today !== "error" && (
          <ResultView today={today} attempt={today.attempt} onExit={onExit} />
        )}

        {(phase === "arming" || phase === "revealing") && today && today !== "error" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 0,
            width: "100%", height: "calc(100vh - 58px)", maxWidth: 1400 }}>
            <div style={{ position: "relative", borderRight: "1px solid var(--border)" }}>
              {phase === "arming" && (
                <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5,
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "6px 12px", fontWeight: 600, fontSize: 15 }} className="num">
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </div>
              )}
              {phase === "revealing" && (
                <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5,
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "6px 12px", fontSize: 13 }} className="mut">
                  Playing out…
                </div>
              )}
              <TVAdvancedChart
                symbol={today.challenge.symbol}
                interval={IV_TO_TV_RES[today.challenge.interval] || "5"}
                theme={theme}
                startMs={today.challenge.startMs}
                canDraw={false}
                hideDates
                onReady={(apiObj) => { chartCtlRef.current = apiObj; }}
                onBar={handleBar}
                height="100%"
              />
            </div>

            <aside style={{ padding: 16, overflowY: "auto" }}>
              <div className="cap" style={{ marginBottom: 12 }}>Setup</div>
              {phase === "revealing" ? (
                <div className="sm mut" style={{ lineHeight: 1.6 }}>
                  {armedTrade
                    ? `${armedTrade.dir === "long" ? "Long" : "Short"} ${fmtPrice(armedTrade.entry)}, stop ${fmtPrice(armedTrade.stop)}${armedTrade.target != null ? `, target ${fmtPrice(armedTrade.target)}` : ""} — watching for it to resolve.`
                    : "Time ran out with nothing armed — playing forward a short window."}
                </div>
              ) : armedTrade ? (
                <>
                  <div className="sm mut" style={{ lineHeight: 1.6, marginBottom: 14 }}>
                    Armed. Sit tight until the countdown ends, or cancel to change it.
                  </div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                    {[["Side", armedTrade.dir === "long" ? "Long" : "Short"],
                      ["Entry", fmtPrice(armedTrade.entry)],
                      ["Stop loss", fmtPrice(armedTrade.stop)],
                      ["Take profit", armedTrade.target != null ? fmtPrice(armedTrade.target) : "—"]]
                      .map(([l, v]) => (
                        <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span className="mut">{l}</span><span className="num" style={{ fontWeight: 600 }}>{v}</span>
                        </div>
                      ))}
                  </div>
                  <button className="btn" style={{ width: "100%" }} onClick={() => setArmedTrade(null)}>Cancel</button>
                </>
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
                      <input className="in" value={form.entry} placeholder="required"
                        onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
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
                  {(setupErrors.length > 0 || formErr) && (
                    <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", borderRadius: 8,
                      padding: "9px 11px", margin: "12px 0" }}>
                      {(setupErrors.length ? setupErrors : [formErr]).map((m, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--down)", lineHeight: 1.55 }}>{m}</div>
                      ))}
                    </div>
                  )}
                  <button className="btn pri" style={{ width: "100%", marginTop: 12, padding: 10 }}
                    disabled={!form.entry || !form.stop || setupErrors.length > 0} onClick={armSetup}>
                    <Svg s={14}>{Ic.plus}</Svg>Arm setup
                  </button>
                  <div className="sm mut" style={{ marginTop: 10, lineHeight: 1.5 }}>
                    No live price yet — this is a limit order. No market entry, no rewind, one shot.
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {phase === "result" && result && today && (
          <ResultView today={today} attempt={result} onExit={onExit} justPlayed />
        )}
      </div>
    </div>
  );
}

/* ---------- result + leaderboard ---------- */
function ResultView({ today, attempt, onExit, justPlayed }) {
  const [board, setBoard] = useState(null); // { entries, you } | "error" | null
  useEffect(() => {
    let alive = true;
    api.dailyPipLeaderboard(today.challenge.challengeDate)
      .then((d) => { if (alive) setBoard(d); })
      .catch(() => { if (alive) setBoard("error"); });
    return () => { alive = false; };
  }, [today.challenge.challengeDate]);

  const tone = !attempt.traded ? "mut" : attempt.r > 0 ? "up" : attempt.r < 0 ? "down" : "mut";

  return (
    <Card style={{ padding: 24, maxWidth: 480, width: "100%" }}>
      <div className="cap" style={{ marginBottom: 6 }}>
        {today.challenge.symbol} · {today.challenge.challengeDate}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }} className={"num " + tone}>
        {attempt.traded ? fmtR(attempt.r) : "No trade placed"}
      </div>
      {attempt.traded && (
        <div className="sm mut" style={{ marginBottom: 16 }}>
          {attempt.dir === "long" ? "Long" : "Short"} {fmtPrice(attempt.entry)} → {fmtPrice(attempt.exitPrice)}
          {" "}({attempt.reason}) · {fmtMoney(attempt.pnl)}
        </div>
      )}
      {justPlayed && (
        <div className="sm mut" style={{ marginBottom: 16 }}>
          {today.streak?.current > 0 ? `${today.streak.current}-day streak — nice.` : "First one recorded — come back tomorrow."}
        </div>
      )}

      <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />

      <div className="cap" style={{ marginBottom: 10 }}>Today's leaderboard</div>
      {board === null && <span className="spinner" />}
      {board === "error" && <div className="sm mut">Couldn't load the leaderboard.</div>}
      {board && board !== "error" && (
        <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {board.entries.length === 0 && <div className="sm mut">No one's played yet today.</div>}
          {board.entries.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13,
              padding: "4px 0", borderBottom: i < board.entries.length - 1 ? "1px solid var(--border)" : "none" }}>
              <span>{i + 1}. {e.handle}</span>
              <span className="num" style={{ fontWeight: 600, color: !e.traded ? "var(--muted)" : e.r > 0 ? "var(--up)" : e.r < 0 ? "var(--down)" : "var(--muted)" }}>
                {e.traded ? fmtR(e.r) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
      {board && board !== "error" && board.you && (
        <div className="sm mut" style={{ marginTop: 10 }}>You're #{board.you.rank} today.</div>
      )}

      <button className="btn" style={{ width: "100%", marginTop: 18 }} onClick={onExit}>Back to Analytics</button>
    </Card>
  );
}
