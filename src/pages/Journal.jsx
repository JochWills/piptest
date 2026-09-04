import React, { useState, useMemo } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Field, Empty, Modal, Svg, Ic, Stat } from "../components/ui.jsx";
import { SYMBOLS } from "../theme.js";
import { computeStats, fmtPrice, fmtSigned, fmtR, fmtClock, fmtShort, sessionOf } from "../lib/trading.js";

/* ============================================================
   Journal — the whole book, filterable, with notes
   ============================================================ */

export default function Journal({ trades, onUpdateTrade, onExport }) {
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("all");
  const [res, setRes] = useState("all");
  const [sym, setSym] = useState("all");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (dir !== "all" && t.dir !== dir) return false;
      if (sym !== "all" && t.symbol !== sym) return false;
      if (res === "win" && !(t.pnl > 0)) return false;
      if (res === "loss" && !(t.pnl < 0)) return false;
      if (res === "flat" && t.pnl !== 0) return false;
      if (q) {
        const hay = `${t.symbol} ${t.note} ${t.reason}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => (b.closedTs || b.closedAt || 0) - (a.closedTs || a.closedAt || 0));
  }, [trades, q, dir, res, sym]);

  const st = useMemo(() => computeStats(filtered), [filtered]);
  const symbolsUsed = useMemo(() => [...new Set(trades.map((t) => t.symbol))], [trades]);

  return (
    <div>
      <PageHead
        eyebrow="Trade log"
        title="Journal"
        sub="Every closed trade, with what you were thinking at the time."
        actions={trades.length > 0 && <button className="btn" onClick={onExport}>Export CSV</button>}
      />

      {trades.length === 0 ? (
        <Card><Empty title="Nothing logged yet"
          body="Trades appear here automatically the moment they close in the simulator — entry, stop, target, R and exit reason all recorded." /></Card>
      ) : (
        <>
          {/* filters */}
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 200px", position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: 10, color: "var(--dim)" }}><Svg s={15}>{Ic.search}</Svg></span>
                <input className="in" style={{ paddingLeft: 32 }} placeholder="Search notes, markets…"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="in" style={{ width: "auto" }} value={sym} onChange={(e) => setSym(e.target.value)}>
                <option value="all">All markets</option>
                {symbolsUsed.map((s) => <option key={s} value={s}>{SYMBOLS.find((x) => x.id === s)?.label || s}</option>)}
              </select>
              <select className="in" style={{ width: "auto" }} value={dir} onChange={(e) => setDir(e.target.value)}>
                <option value="all">Long & short</option><option value="long">Long only</option><option value="short">Short only</option>
              </select>
              <select className="in" style={{ width: "auto" }} value={res} onChange={(e) => setRes(e.target.value)}>
                <option value="all">All results</option><option value="win">Winners</option><option value="loss">Losers</option><option value="flat">Breakeven</option>
              </select>
              {(q || dir !== "all" || res !== "all" || sym !== "all") && (
                <button className="btn ghost" onClick={() => { setQ(""); setDir("all"); setRes("all"); setSym("all"); }}>Clear</button>
              )}
            </div>
          </Card>

          <div className="grid-stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", marginBottom: 14 }}>
            <Stat label="Showing" value={filtered.length} sub={filtered.length === trades.length ? "all trades" : `of ${trades.length}`} />
            <Stat label="Net" value={st.count ? fmtSigned(st.net) : "—"} tone={st.net > 0 ? "up" : st.net < 0 ? "down" : undefined} />
            <Stat label="Total R" value={st.count ? fmtR(st.totalR) : "—"} />
            <Stat label="Win rate" value={st.count ? `${st.winRate.toFixed(1)}%` : "—"} sub={`${st.wins}W / ${st.losses}L`} />
            <Stat label="Avg R" value={st.count ? fmtR(st.avgR) : "—"} />
            <Stat label="Profit factor" value={st.profitFactor == null ? "—" : st.profitFactor.toFixed(2)} />
          </div>

          <Card style={{ overflow: "hidden" }}>
            <div className="scroll" style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    {["Closed", "Market", "Side", "Entry", "Exit", "Stop", "R", "P&L", "Exit", "Session", ""].map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td className="mut" style={{ whiteSpace: "nowrap" }}>{fmtShort(t.closedTs || t.closedAt)}</td>
                      <td style={{ fontWeight: 500 }}>{SYMBOLS.find((x) => x.id === t.symbol)?.label || t.symbol}</td>
                      <td style={{ color: t.dir === "long" ? "var(--up)" : "var(--down)", fontWeight: 500 }}>
                        {t.dir === "long" ? "Long" : "Short"}
                      </td>
                      <td>{fmtPrice(t.entry)}</td>
                      <td>{fmtPrice(t.exit)}</td>
                      <td className="mut">{fmtPrice(t.stop)}</td>
                      <td style={{ fontWeight: 600, color: t.pnl > 0 ? "var(--up)" : t.pnl < 0 ? "var(--down)" : "var(--muted)" }}>
                        {fmtR(t.r)}
                      </td>
                      <td style={{ color: t.pnl > 0 ? "var(--up)" : t.pnl < 0 ? "var(--down)" : "var(--muted)" }}>{fmtSigned(t.pnl)}</td>
                      <td className="mut" style={{ fontSize: 12 }}>{t.reason}</td>
                      <td className="mut" style={{ fontSize: 12 }}>{sessionOf(t.openedTs || t.closedTs)}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => setEditing(t)}>
                          {t.note ? "Note" : "Add"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <Empty title="No trades match those filters" />}
          </Card>
        </>
      )}

      <TradeModal trade={editing} onClose={() => setEditing(null)}
        onSave={(patch) => { onUpdateTrade(editing.id, patch); setEditing(null); }} />
    </div>
  );
}

function TradeModal({ trade, onClose, onSave }) {
  const [note, setNote] = useState("");
  React.useEffect(() => {
    if (trade) setNote(trade.note || "");
  }, [trade]);
  if (!trade) return null;

  return (
    <Modal open={!!trade} onClose={onClose} title="Trade review" width={560}>
      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 16 }}>
        <Stat label="Side" value={trade.dir === "long" ? "Long" : "Short"} tone={trade.dir === "long" ? "up" : "down"} />
        <Stat label="R" value={fmtR(trade.r)} tone={trade.pnl > 0 ? "up" : trade.pnl < 0 ? "down" : undefined} />
        <Stat label="P&L" value={fmtSigned(trade.pnl)} tone={trade.pnl > 0 ? "up" : trade.pnl < 0 ? "down" : undefined} />
        <Stat label="Exit" value={trade.reason} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {[["Entry", fmtPrice(trade.entry)], ["Stop", fmtPrice(trade.stop)],
          ["Target", trade.target != null ? fmtPrice(trade.target) : "—"]].map(([l, v]) => (
          <div key={l}>
            <div className="cap" style={{ marginBottom: 3 }}>{l}</div>
            <div className="num" style={{ fontSize: 14 }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="sm mut" style={{ marginBottom: 16 }}>
        Opened {fmtClock(trade.openedTs || trade.closedTs, trade.interval)} · closed {fmtClock(trade.closedTs, trade.interval)} UTC
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label="Notes" hint="What did you see, what did you do, what would you change?">
          <textarea className="in" rows={5} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Entered on the retest after the sweep. Stop was too tight — got wicked out before it ran." />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
        <button className="btn pri" onClick={() => onSave({ note })}>Save review</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
