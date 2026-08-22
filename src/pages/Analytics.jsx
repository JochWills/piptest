import React, { useMemo, useState } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Stat, Empty, Svg, Ic } from "../components/ui.jsx";
import { SYMBOLS } from "../theme.js";
import {
  computeStats, groupBy, byTag, rHistogram, sessionOf, dayOf,
  fmtSigned, fmtR, fmtMoney, START_BALANCE,
} from "../lib/trading.js";

/* ============================================================
   Analytics — which of your setups is actually working
   ============================================================ */

export default function Analytics({ trades }) {
  const [range, setRange] = useState("all");

  const scoped = useMemo(() => {
    if (range === "all") return trades;
    const days = range === "30" ? 30 : 90;
    const cut = Date.now() - days * 86400000;
    return trades.filter((t) => (t.closedAt || 0) >= cut);
  }, [trades, range]);

  const st = useMemo(() => computeStats(scoped), [scoped]);
  const hist = useMemo(() => rHistogram(scoped), [scoped]);
  const bySession = useMemo(() => groupBy(scoped, (t) => sessionOf(t.openedTs || t.closedTs)), [scoped]);
  const byDay = useMemo(() => {
    const order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const g = groupBy(scoped, (t) => dayOf(t.openedTs || t.closedTs));
    return order.map((d) => g.find((x) => x.key === d) || { key: d, n: 0, net: 0, winRate: 0, avgR: 0, totalR: 0 });
  }, [scoped]);
  const tagRows = useMemo(() => byTag(scoped), [scoped]);
  const bySymbol = useMemo(() => groupBy(scoped, (t) => t.symbol).sort((a, b) => b.totalR - a.totalR), [scoped]);
  const byDir = useMemo(() => groupBy(scoped, (t) => t.dir), [scoped]);

  if (!trades.length) {
    return (
      <div>
        <PageHead eyebrow="Performance" title="Analytics" />
        <Card><Empty title="Nothing to analyse yet"
          body="Once you've closed a few trades, this page breaks them down by session, day, market and setup tag — so you can see which edge is real and which one you just like." /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow="Performance"
        title="Analytics"
        sub="Where your R is actually coming from."
        actions={
          <div style={{ display: "flex", gap: 4 }}>
            {[["all", "All time"], ["90", "90 days"], ["30", "30 days"]].map(([id, l]) => (
              <button key={id} className={"btn " + (range === id ? "on" : "")} onClick={() => setRange(id)}>{l}</button>
            ))}
          </div>
        }
      />

      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", marginBottom: 16 }}>
        <Stat label="Trades" value={st.count} sub={`${st.wins}W / ${st.losses}L${st.flat ? ` / ${st.flat} flat` : ""}`} />
        <Stat label="Total R" value={fmtR(st.totalR)} tone={st.totalR > 0 ? "up" : st.totalR < 0 ? "down" : undefined} />
        <Stat label="Expectancy" value={fmtR(st.avgR)} sub="R per trade" />
        <Stat label="Win rate" value={`${st.winRate.toFixed(1)}%`} />
        <Stat label="Profit factor" value={st.profitFactor == null ? "—" : st.profitFactor.toFixed(2)} />
        <Stat label="Max drawdown" value={fmtMoney(st.maxDD)} sub={`${st.maxDDPct.toFixed(1)}%`} tone={st.maxDD > 0 ? "down" : undefined} />
        <Stat label="Best run" value={`${st.bestStreak}W`} sub={`worst ${st.worstStreak}L`} />
      </div>

      {/* equity */}
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <span className="cap">Equity curve</span>
          <span className="sm mut">
            Start {fmtMoney(START_BALANCE)} → {fmtMoney(st.equity)} ({fmtSigned(st.net)})
          </span>
        </div>
        <EquityChart curve={st.curve} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>R distribution</div>
          <Histogram hist={hist} />
          <div className="sm mut" style={{ marginTop: 12, lineHeight: 1.6 }}>
            A healthy book has losses clustered near −1R and a right tail past +2R. Losses beyond −1R
            mean stops aren't holding.
          </div>
        </Card>

        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>By setup tag</div>
          {tagRows.length === 0
            ? <div className="sm mut" style={{ padding: "16px 0" }}>No tags yet. Tag trades in the Journal to see which setups carry your account.</div>
            : <Breakdown rows={tagRows} />}
        </Card>

        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>By session</div>
          <Breakdown rows={bySession} />
        </Card>

        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>By day of week</div>
          <Breakdown rows={byDay.filter((d) => d.n > 0)} />
        </Card>

        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>By market</div>
          <Breakdown rows={bySymbol.map((r) => ({ ...r, key: SYMBOLS.find((s) => s.id === r.key)?.label || r.key }))} />
        </Card>

        <Card style={{ padding: 18 }}>
          <div className="cap" style={{ marginBottom: 14 }}>Long vs short</div>
          <Breakdown rows={byDir.map((r) => ({ ...r, key: r.key === "long" ? "Long" : "Short" }))} />
        </Card>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */
function EquityChart({ curve, height = 180 }) {
  if (!curve || curve.length < 2) return <div className="sm mut" style={{ height, display: "grid", placeItems: "center" }}>Not enough trades yet</div>;
  const W = 900, H = height, pad = 10;
  const lo = Math.min(...curve, START_BALANCE), hi = Math.max(...curve, START_BALANCE);
  const span = hi - lo || 1;
  const x = (i) => (i / (curve.length - 1)) * W;
  const y = (v) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const line = curve.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const up = curve[curve.length - 1] >= START_BALANCE;
  const col = up ? "var(--up)" : "var(--down)";
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={col} stopOpacity=".22" /><stop offset="100%" stopColor={col} stopOpacity="0" />
      </linearGradient></defs>
      <line x1="0" y1={y(START_BALANCE)} x2={W} y2={y(START_BALANCE)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#eqg)" />
      <polyline points={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Histogram({ hist }) {
  const all = [{ label: "<−3", n: hist.under, neg: true },
    ...hist.bins.map((b) => ({ label: `${b.lo}`, n: b.n, neg: b.lo < 0 })),
    { label: "3+", n: hist.over, neg: false }];
  const max = Math.max(1, ...all.map((b) => b.n));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130 }}>
        {all.map((b, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span className="sm mut" style={{ fontSize: 10.5, opacity: b.n ? 1 : 0 }}>{b.n}</span>
            <div style={{
              width: "100%", height: `${(b.n / max) * 96}px`, minHeight: b.n ? 3 : 0,
              background: b.neg ? "var(--down)" : "var(--up)", opacity: b.n ? 0.85 : 0.12, borderRadius: 3,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
        {all.map((b, i) => (
          <span key={i} className="mono" style={{ flex: 1, textAlign: "center", fontSize: 9.5, color: "var(--dim)" }}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function Breakdown({ rows }) {
  if (!rows.length) return <div className="sm mut" style={{ padding: "16px 0" }}>No data in this range.</div>;
  const max = Math.max(...rows.map((r) => Math.abs(r.totalR)), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((r) => (
        <div key={r.key}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</span>
            <span className="sm mut" style={{ flexShrink: 0 }}>
              {r.n} · {r.winRate.toFixed(0)}% ·{" "}
              <b style={{ color: r.totalR > 0 ? "var(--up)" : r.totalR < 0 ? "var(--down)" : "var(--muted)" }}>{fmtR(r.totalR)}</b>
            </span>
          </div>
          <div style={{ height: 6, background: "var(--surface3)", borderRadius: 3, overflow: "hidden", display: "flex" }}>
            <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
              {r.totalR < 0 && <div style={{ width: `${(Math.abs(r.totalR) / max) * 100}%`, background: "var(--down)", borderRadius: 3 }} />}
            </div>
            <div style={{ width: "50%" }}>
              {r.totalR > 0 && <div style={{ width: `${(r.totalR / max) * 100}%`, background: "var(--up)", borderRadius: 3 }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
