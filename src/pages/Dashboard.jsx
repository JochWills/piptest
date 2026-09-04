import React, { useState, useMemo } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Field, Stat, Empty, Modal, ConfirmDialog, Svg, Ic } from "../components/ui.jsx";
import { SYMBOLS, INTERVALS } from "../theme.js";
import { computeStats, fmtSigned, fmtMoney, fmtShort, fmtR, uid, START_BALANCE, CHALLENGE_PRESETS } from "../lib/trading.js";

export function Spark({ curve, h = 40, w = 240 }) {
  if (!curve || curve.length < 2) {
    return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" /></svg>;
  }
  const lo = Math.min(...curve), hi = Math.max(...curve), span = hi - lo || 1;
  const y = (v) => h - 3 - ((v - lo) / span) * (h - 6);
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * w},${y(v)}`).join(" ");
  const up = curve[curve.length - 1] >= curve[0];
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity=".2" />
        <stop offset="100%" stopColor={up ? "var(--up)" : "var(--down)"} stopOpacity="0" />
      </linearGradient></defs>
      <line x1="0" y1={y(curve[0])} x2={w} y2={y(curve[0])} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Dashboard({ sessions, trades, onOpen, onCreate, onDelete, onNav, onJoinRoom, loading }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", symbol: "BTCUSDT", interval: "30m", startBalance: String(START_BALANCE),
    date: "2025-03-13", time: "10:00", challenge: "none", random: false,
  });

  /* ---------- join room ----------
     A "join a room" entry point that doesn't require already being inside
     a simulator session first — previously the only way in was to open
     (or create) a session of your own, then find the room panel there. */
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinErr, setJoinErr] = useState("");

  /* session pending deletion — holds the whole session (not just an id)
     so the confirm dialog can still show its name after the click that
     opened it, without a second lookup */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const submitJoin = () => {
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length !== 6) { setJoinErr(`Codes are 6 characters — "${code}" is ${code.length}.`); return; }
    setJoinOpen(false); setJoinCodeInput(""); setJoinErr("");
    onJoinRoom(code);
  };

  const agg = useMemo(() => computeStats(trades), [trades]);
  /* a joined room's throwaway session (see App.jsx's joinRoomFromDashboard)
     never gets saved and disappears the moment it's left — it shouldn't
     ever flash into view here as if it were a real saved session */
  const savedSessions = useMemo(() => sessions.filter((s) => !s.transient), [sessions]);

  const create = () => {
    let startMs;
    if (form.random) {
      /* a random weekday moment in the last two years, so you can't
         recognise the chart from the date alone */
      const now = Date.now();
      startMs = now - Math.floor(Math.random() * 700 + 30) * 86400000;
      startMs -= startMs % 3600000;
    } else {
      startMs = Date.parse(`${form.date}T${form.time}:00Z`);
    }
    if (!startMs || Number.isNaN(startMs)) return;
    /* Clamped rather than rejected outright — a stray character or an
       emptied field shouldn't block creating the session, it should just
       fall back to something sane. Floored at 100: a starting balance of
       0 (or negative) makes every risk-% calculation downstream divide
       by nothing meaningful. */
    const startBalance = Math.max(100, Math.round(Number(form.startBalance)) || START_BALANCE);
    const rules = CHALLENGE_PRESETS.find((c) => c.id === form.challenge) || CHALLENGE_PRESETS[0];
    onCreate({
      id: uid(),
      name: form.name.trim() || (form.random ? `Blind ${SYMBOLS.find((s) => s.id === form.symbol)?.label}` : `${form.symbol} ${form.interval}`),
      symbol: form.symbol, interval: form.interval, startMs, startBalance,
      blind: form.random,
      challenge: rules.id === "none" ? null : { id: rules.id, label: rules.label, daily: rules.daily, total: rules.total, target: rules.target },
      createdAt: Date.now(),
    });
    setOpen(false);
    setForm((f) => ({ ...f, name: "" }));
  };

  return (
    <div>
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        sub="Your saved replay sessions and how they add up."
        actions={<>
          <button className="btn" onClick={() => setJoinOpen(true)}><Svg s={14}>{Ic.users}</Svg>Join room</button>
          <button className="btn pri" onClick={() => setOpen(true)}><Svg s={14}>{Ic.plus}</Svg>New session</button>
        </>}
      />

      {/* headline */}
      <Card style={{ padding: 20, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="cap" style={{ marginBottom: 6 }}>Net across all sessions</div>
            {loading ? (
              <span className="skel" style={{ width: 130, height: 32 }} />
            ) : (
              <div className="num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em",
                color: agg.count ? (agg.net > 0 ? "var(--up)" : agg.net < 0 ? "var(--down)" : "var(--ink)") : "var(--dim)" }}>
                {agg.count ? fmtSigned(agg.net) : "$0.00"}
              </div>
            )}
            <div className="sm mut" style={{ marginTop: 4 }}>
              {loading
                ? <span className="skel" style={{ width: 140, height: 12 }} />
                : (agg.count ? `${fmtR(agg.totalR)} over ${agg.count} trades` : "No trades recorded yet")}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200, maxWidth: 460 }}>
            <div className="cap" style={{ marginBottom: 6 }}>Equity curve</div>
            {loading
              ? <span className="skel" style={{ display: "block", width: "100%", height: 54 }} />
              : <Spark curve={agg.curve} h={54} />}
          </div>
        </div>
      </Card>

      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", marginBottom: 26 }}>
        <Stat label="Sessions" value={savedSessions.length} loading={loading} />
        <Stat label="Trades" value={agg.count} loading={loading} />
        <Stat label="Win rate" value={agg.count ? `${agg.winRate.toFixed(1)}%` : "—"} sub={`${agg.wins}W / ${agg.losses}L${agg.flat ? ` / ${agg.flat} flat` : ""}`} loading={loading} />
        <Stat label="Profit factor" value={agg.profitFactor == null ? "—" : agg.profitFactor.toFixed(2)} loading={loading} />
        <Stat label="Avg R" value={agg.count ? fmtR(agg.avgR) : "—"} sub="per trade" loading={loading} />
        <Stat label="Max drawdown" value={agg.count ? fmtMoney(agg.maxDD) : "—"}
          sub={agg.count ? `${agg.maxDDPct.toFixed(1)}%` : ""} tone={agg.maxDD > 0 ? "down" : undefined} loading={loading} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="cap">Saved sessions</span>
        {savedSessions.length > 0 && <span className="pill n">{savedSessions.length}</span>}
      </div>

      {loading ? (
        /* sessions haven't come back yet — this is not the same thing as
           "you have none", so don't show the empty state (it would read
           as a real, if very sad, answer) while it's still unknown. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={{ padding: 16 }}>
              <span className="skel" style={{ display: "block", width: "55%", height: 14.5, marginBottom: 8 }} />
              <span className="skel" style={{ display: "block", width: "75%", height: 12 }} />
            </Card>
          ))}
        </div>
      ) : savedSessions.length === 0 ? (
        <Card>
          <Empty
            title="No sessions yet"
            body="A session is one market, one timeframe and a start date. Create one and PipTest loads the real history so you can replay it."
            action={<button className="btn pri" onClick={() => setOpen(true)}>Create your first session</button>}
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {savedSessions.map((s) => {
            const st = s.stats || {};
            const sym = SYMBOLS.find((x) => x.id === s.symbol);
            return (
              <Card key={s.id} style={{ padding: 16, cursor: "pointer" }} onClick={() => onOpen(s.id)}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                    </div>
                    <div className="sm mut" style={{ marginTop: 3 }}>
                      {sym?.label || s.symbol} · {INTERVALS.find((i) => i.id === s.interval)?.label} ·{" "}
                      {s.blind ? "blind start" : fmtShort(s.startMs)}
                    </div>
                  </div>
                  <button className="btn ghost" style={{ padding: "3px 8px", fontSize: 12 }}
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}>
                    <Svg s={13}>{Ic.trash}</Svg>
                  </button>
                </div>

                {s.challenge && (
                  <div style={{ marginTop: 10 }}>
                    <span className={"pill " + (st.challengeStatus === "failed" ? "r" : st.challengeStatus === "passed" ? "g" : "b")}>
                      {st.challengeStatus === "failed" ? "Challenge failed" : st.challengeStatus === "passed" ? "Challenge passed" : "Challenge active"}
                    </span>
                  </div>
                )}

                <div style={{ margin: "13px 0 10px" }}><Spark curve={st.curve} h={44} /></div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="num" style={{ fontSize: 18, fontWeight: 700,
                    color: !st.count ? "var(--dim)" : st.net > 0 ? "var(--up)" : st.net < 0 ? "var(--down)" : "var(--muted)" }}>
                    {st.count ? fmtSigned(st.net) : "—"}
                  </span>
                  <span className="sm mut">
                    {st.count ? `${st.count} trades · ${st.winRate.toFixed(0)}% win` : "Not started"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- new session ---------- */}
      <Modal open={open} onClose={() => setOpen(false)} title="New replay session" width={560}>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Session name" hint="Optional — something you'll recognise in the list.">
            <input className="in" value={form.name} placeholder="London open sweep"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>

          {/* Timeframe used to be picked here too, but the chart itself already
             has a full interval switcher once the session opens (see Simulator's
             switchInterval) — asking for it again up front was a redundant
             decision with no lasting effect, so this just starts every session
             on form.interval's default and leaves the real choice to the chart. */}
          <Field label="Market">
            <select className="in" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}>
              {SYMBOLS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer",
            padding: 12, border: "1px solid var(--border)", borderRadius: 9, background: "var(--surface2)" }}>
            <input type="checkbox" checked={form.random} style={{ marginTop: 2 }}
              onChange={(e) => setForm({ ...form, random: e.target.checked })} />
            <span>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>Blind start</div>
              <div className="sm mut" style={{ marginTop: 3, lineHeight: 1.55 }}>
                Drop into a random date so you can't recognise the move from memory. The honest way to test a setup.
              </div>
            </span>
          </label>

          {!form.random && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Start date (UTC)">
                <input className="in" type="date" value={form.date} min="2020-01-01"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Start time">
                <input className="in" type="time" value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </Field>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Starting balance" hint="Simulated — fixed for the life of this session.">
              <div style={{ position: "relative" }}>
                <span aria-hidden style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                  color: "var(--muted)", fontSize: 13, pointerEvents: "none" }}>$</span>
                <input className="in" type="number" min="100" step="100" value={form.startBalance}
                  style={{ paddingLeft: 22 }}
                  onChange={(e) => setForm({ ...form, startBalance: e.target.value })} />
              </div>
            </Field>
            <Field label="Challenge rules" hint="Apply prop-firm style limits to this session.">
              <select className="in" value={form.challenge} onChange={(e) => setForm({ ...form, challenge: e.target.value })}>
                {CHALLENGE_PRESETS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: "flex", gap: 9, marginTop: 4 }}>
            <button className="btn pri" onClick={create}>Create and open</button>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={joinOpen} onClose={() => { setJoinOpen(false); setJoinErr(""); }} title="Join a room" width={380}>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Room code" hint="Ask whoever's hosting for their 6-character code.">
            <input className="in" value={joinCodeInput} maxLength={6} placeholder="ABC123"
              style={{ textTransform: "uppercase", letterSpacing: 1 }} autoFocus
              onChange={(e) => { setJoinCodeInput(e.target.value); setJoinErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitJoin()} />
          </Field>
          {joinErr && <p className="sm" style={{ color: "var(--down)" }}>{joinErr}</p>}
          <div style={{ display: "flex", gap: 9 }}>
            <button className="btn pri" onClick={submitJoin} disabled={!joinCodeInput.trim()}>Join</button>
            <button className="btn" onClick={() => { setJoinOpen(false); setJoinErr(""); }}>Cancel</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete session?"
        body={deleteTarget && <>Delete <b style={{ color: "var(--ink)" }}>"{deleteTarget.name}"</b>? This can't be undone.</>}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { onDelete(deleteTarget.id); setDeleteTarget(null); }}
      />
    </div>
  );
}
