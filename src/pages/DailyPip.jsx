import React, { useEffect, useRef, useState } from "react";
import TVAdvancedChart from "../tv/TVAdvancedChart.jsx";
import { IV_TO_TV_RES } from "../tv/marketFeed.js";
import { barMsOf } from "../theme.js";
import { PageHead } from "../components/Shell.jsx";
import { Card, Field, Svg, Ic } from "../components/ui.jsx";
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

   Lives inside Shell (sidebar nav), same as Dashboard/Journal/
   Analytics/Settings. Layout is a persistent two-column split: today's
   leaderboard sits on the right the whole time (visible before you've
   even opened the challenge, and live-updating once you have), while
   the left column carries whatever's relevant right now — a prompt to
   open the challenge, the live countdown/chart/ticket, or today's
   result once you've already played.

   Arming a setup or entering at market both end the countdown and
   start the reveal immediately — there's no reason to make someone
   who already committed a trade sit and watch a clock they can no
   longer act on.

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
      /* Doesn't auto-start the countdown on arrival any more — "ready"
         is a plain prompt, and the clock only starts once the player
         actually opens the challenge (see openChallenge below). */
      setPhase(d.attempt ? "already-played" : "ready");
    }).catch((e) => { setErrMsg(e?.message || "Couldn't load today's Pip."); setPhase("error"); });
  };
  useEffect(load, []);

  const openChallenge = () => {
    if (phase !== "ready") return;
    setPhase("arming");
  };

  /* ---------- live price, from the chart sitting at the challenge's
     start point — TVAdvancedChart reports this via onCursor as soon as
     it loads, well before any bar is actually revealed by playback, the
     same way Simulator's own price ticker gets its very first value.
     onCursor hands back a TV-shaped bar ({time,open,high,low,close}),
     not the {t,o,h,l,c} shape the rest of this file (and trading.js)
     uses — converted here the same way Simulator's own toNative does. */
  const [cur, setCur] = useState(null);
  const handleCursor = (ms, bar) => {
    if (bar) setCur({ t: bar.time, o: bar.open, h: bar.high, l: bar.low, c: bar.close });
  };
  const price = cur?.c ?? null;

  /* ---------- setup form (arming phase) ---------- */
  const [form, setForm] = useState({ dir: "long", entry: "", stop: "", target: "", riskPct: "1.0" });
  const [formErr, setFormErr] = useState("");
  const [armedTrade, setArmedTrade] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_S);
  const armedTradeRef = useRef(null);
  useEffect(() => { armedTradeRef.current = armedTrade; }, [armedTrade]);
  const countdownDoneRef = useRef(false);

  const entryVal = parseFloat(form.entry) || price || 0;
  const setupErrors = form.stop
    ? validateSetup({ dir: form.dir, entry: entryVal, stop: form.stop, target: form.target, riskPct: form.riskPct, equity: EQUITY, price })
    : [];

  const arm = (atMarket) => {
    if (phase !== "arming" || countdownDoneRef.current) return;
    const e = atMarket ? price : entryVal;
    const errs = validateSetup({ dir: form.dir, entry: e, stop: form.stop, target: form.target, riskPct: form.riskPct, equity: EQUITY, price });
    if (errs.length) { setFormErr(errs[0]); return; }
    setFormErr("");
    const t = buildSetup({
      ...form, entry: e, equity: EQUITY,
      symbol: today.challenge.symbol, interval: today.challenge.interval,
      note: "", atMarket, ts: today.challenge.startMs,
    });
    /* Stops the clock and starts the reveal right away — see
       startReveal below — rather than leaving the trade "armed" for
       the rest of a countdown nobody can still act on. */
    countdownDoneRef.current = true;
    setArmedTrade(t);
    startReveal(t);
  };

  /* ---------- chart + reveal ---------- */
  const chartCtlRef = useRef(null);
  const revealTradeRef = useRef(null);
  const barsRef = useRef(0);
  const lastBarRef = useRef(null);
  const submittedRef = useRef(false);
  const [result, setResult] = useState(null); // { traded, dir, entry, exit, stop, target, r, pnl, reason }
  const [boardVersion, setBoardVersion] = useState(0); // bumped after a submit lands, so the leaderboard panel refetches

  const startReveal = (trade) => {
    setPhase("revealing");
    const ctl = chartCtlRef.current;
    revealTradeRef.current = trade ?? null;
    barsRef.current = 0;
    if (!ctl) { finishAttempt(trade ?? null, null, null); return; }
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
      startReveal(armedTradeRef.current);
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
    /* Awaited, not fired-and-forgotten: this is what stops the
       leaderboard panel's own refetch (bumped below) racing ahead of
       this exact attempt actually being recorded — otherwise it could
       refresh a beat before the just-submitted result was in it. */
    try {
      const res = await api.dailyPipSubmit(body);
      setToday((t) => ({ ...t, attempt: res.attempt, streak: res.streak }));
      setBoardVersion((v) => v + 1);
    } catch (e) {
      // still show the result locally even if the POST failed — the
      // server call is what makes it official/leaderboard-visible,
      // but the player's own screen shouldn't just hang on a network blip
    }
    setPhase("result");
  };

  const streakBadge = today && today !== "error" && (
    <div className="btn" style={{ cursor: "default" }}>
      <Svg s={14}>{Ic.bolt}</Svg>
      {today.streak?.current > 0 ? `${today.streak.current}-day streak` : "No streak yet"}
    </div>
  );

  return (
    <div>
      <PageHead
        eyebrow="Daily challenge"
        title="The Daily Pip"
        sub="One shared chart. Every trader, every day. No rewinds, one shot."
        actions={streakBadge}
      />

      {phase === "loading" && (
        <div style={{ padding: "70px 0", display: "grid", placeItems: "center" }}><span className="spinner" /></div>
      )}

      {phase === "ineligible" && (
        <Card style={{ padding: 24, maxWidth: 460, margin: "30px auto", textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Needs an account</div>
          <div className="sm mut" style={{ lineHeight: 1.6 }}>
            The Daily Pip needs a shared leaderboard and a server-enforced one-attempt-a-day
            limit, so it only works with the API configured — not in local-only mode.
          </div>
        </Card>
      )}

      {phase === "error" && (
        <Card style={{ padding: 24, maxWidth: 460, margin: "30px auto", textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Couldn't load today's Pip</div>
          <div className="sm mut" style={{ marginBottom: 14 }}>{errMsg}</div>
          <button className="btn pri" onClick={load}>Try again</button>
        </Card>
      )}

      {today && today !== "error" && phase !== "loading" && (
        <div className="dailypip-grid">
          <div>
            {phase === "ready" && (
              <Card style={{ padding: 28 }}>
                <div className="cap" style={{ marginBottom: 8 }}>Today's challenge</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
                  {today.challenge.symbol} — one shared chart, dates hidden
                </div>
                <div className="sm mut" style={{ lineHeight: 1.6, marginBottom: 22, maxWidth: 480 }}>
                  Once you open it, you'll have 3 minutes to place one trade — arm a setup or
                  enter at market. Arming a trade (or the clock running out) starts the chart
                  playing forward automatically to the result. No rewinds, one attempt a day.
                </div>
                <button className="btn pri" style={{ padding: "10px 22px" }} onClick={openChallenge}>
                  <Svg s={14}>{Ic.play}</Svg>Open today's Daily Pip
                </button>
              </Card>
            )}

            {(phase === "arming" || phase === "revealing") && (
              <>
                <Card className="dailypip-chart" style={{ padding: 0, marginBottom: 16 }}>
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
                    /* canDraw defaults to true — gives the left drawing-tool
                       rail and the header's own resolution dropdown together
                       (see TVAdvancedChart's disabled_features comment: the
                       two travel as a pair). Switching resolution there just
                       re-realigns the datafeed at the same cursor moment —
                       same mechanism that already feeds `price` via onCursor
                       — so it works in both "arming" and "revealing" with no
                       extra wiring here; the reveal's own step size (set once
                       in startReveal, below) stays anchored to the
                       challenge's real interval regardless of what
                       resolution the chart is displaying. `go_to_date` stays
                       disabled unconditionally in TVAdvancedChart either
                       way, so this doesn't reopen the hidden-dates hole. */
                    hideDates
                    onReady={(apiObj) => { chartCtlRef.current = apiObj; }}
                    onCursor={handleCursor}
                    onBar={handleBar}
                    height="100%"
                  />
                </Card>

                <Card style={{ padding: 18 }}>
                  {phase === "revealing" ? (
                    <div className="sm mut" style={{ lineHeight: 1.6 }}>
                      {armedTrade
                        ? `${armedTrade.dir === "long" ? "Long" : "Short"} ${fmtPrice(armedTrade.entry)}, stop ${fmtPrice(armedTrade.stop)}${armedTrade.target != null ? `, target ${fmtPrice(armedTrade.target)}` : ""} — watching for it to resolve.`
                        : "Time ran out with nothing armed — playing forward a short window."}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["long", "short"].map((d) => (
                            <button key={d} onClick={() => setForm((f) => ({ ...f, dir: d }))}
                              className={"btn " + (form.dir === d ? (d === "long" ? "buy" : "sell") : "")}
                              style={{ width: 68 }}>{d === "long" ? "Long" : "Short"}</button>
                          ))}
                        </div>
                        <div style={{ width: 130 }}>
                          <Field label="Entry">
                            <input className="in" value={form.entry} placeholder={price ? `market ${fmtPrice(price)}` : "required"}
                              onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))} />
                          </Field>
                        </div>
                        <div style={{ width: 130 }}>
                          <Field label="Stop loss">
                            <input className="in" value={form.stop} placeholder="—"
                              onChange={(e) => setForm((f) => ({ ...f, stop: e.target.value }))} />
                          </Field>
                        </div>
                        <div style={{ width: 130 }}>
                          <Field label="Take profit">
                            <input className="in" value={form.target} placeholder="optional"
                              onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} />
                          </Field>
                        </div>
                        <div style={{ width: 100 }}>
                          <Field label="Risk %">
                            <input className="in" type="number" min="0.01" max="100" step="0.1" value={form.riskPct}
                              onChange={(e) => setForm((f) => ({ ...f, riskPct: e.target.value }))} />
                          </Field>
                        </div>
                        <button className="btn pri" style={{ padding: "0 16px", height: 36 }}
                          disabled={!form.stop || setupErrors.length > 0} onClick={() => arm(false)}>
                          <Svg s={14}>{Ic.plus}</Svg>Arm setup
                        </button>
                        <button className="btn" style={{ padding: "0 16px", height: 36 }}
                          disabled={!form.stop || !price || setupErrors.length > 0} onClick={() => arm(true)}>
                          Enter at market
                        </button>
                      </div>
                      {form.entry === "" && price && form.stop && setupErrors.length === 0 && (
                        <div className="sm mut" style={{ margin: "12px 0 0" }}>Entry blank — using {fmtPrice(price)}.</div>
                      )}
                      {(setupErrors.length > 0 || formErr) && (
                        <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", borderRadius: 8,
                          padding: "9px 11px", margin: "12px 0 0" }}>
                          {(setupErrors.length ? setupErrors : [formErr]).map((m, i) => (
                            <div key={i} style={{ fontSize: 12, color: "var(--down)", lineHeight: 1.55 }}>{m}</div>
                          ))}
                        </div>
                      )}
                      <div className="sm mut" style={{ marginTop: 12, lineHeight: 1.5 }}>
                        Arming a setup or entering at market stops the clock and plays the chart
                        forward right away — no rewind, one shot.
                      </div>
                    </>
                  )}
                </Card>
              </>
            )}

            {(phase === "result" || phase === "already-played") && (
              <AttemptSummary
                today={today}
                attempt={phase === "result" ? result : today.attempt}
                justPlayed={phase === "result"}
              />
            )}
          </div>

          <LeaderboardPanel today={today} version={boardVersion} />
        </div>
      )}
    </div>
  );
}

/* ---------- persistent leaderboard, right column ---------- */
function LeaderboardPanel({ today, version }) {
  const [board, setBoard] = useState(null); // { entries, you } | "error" | null
  useEffect(() => {
    let alive = true;
    setBoard(null);
    api.dailyPipLeaderboard(today.challenge.challengeDate)
      .then((d) => { if (alive) setBoard(d); })
      .catch(() => { if (alive) setBoard("error"); });
    return () => { alive = false; };
  }, [today.challenge.challengeDate, version]);

  return (
    <Card style={{ padding: 18 }}>
      <div className="cap" style={{ marginBottom: 12 }}>Today's leaderboard</div>
      {board === null && <span className="spinner" />}
      {board === "error" && <div className="sm mut">Couldn't load the leaderboard.</div>}
      {board && board !== "error" && (
        <div style={{ display: "grid", gap: 6, maxHeight: 500, overflowY: "auto" }}>
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
    </Card>
  );
}

/* ---------- your result, left column ---------- */
function AttemptSummary({ today, attempt, justPlayed }) {
  const tone = !attempt.traded ? "mut" : attempt.r > 0 ? "up" : attempt.r < 0 ? "down" : "mut";
  return (
    <Card style={{ padding: 24 }}>
      <div className="cap" style={{ marginBottom: 6 }}>
        {today.challenge.symbol} · {today.challenge.challengeDate}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }} className={"num " + tone}>
        {attempt.traded ? fmtR(attempt.r) : "No trade placed"}
      </div>
      {attempt.traded && (
        <div className="sm mut" style={{ marginBottom: 12 }}>
          {attempt.dir === "long" ? "Long" : "Short"} {fmtPrice(attempt.entry)} → {fmtPrice(attempt.exitPrice)}
          {" "}({attempt.reason}) · {fmtMoney(attempt.pnl)}
        </div>
      )}
      <div className="sm mut">
        {justPlayed
          ? (today.streak?.current > 0 ? `${today.streak.current}-day streak — nice.` : "First one recorded — come back tomorrow.")
          : "You've already played today's Pip — come back tomorrow for a new one."}
      </div>
    </Card>
  );
}
