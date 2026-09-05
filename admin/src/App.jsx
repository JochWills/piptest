import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api, setToken, refresh, API_ENABLED } from "./api.js";
import Avatar from "./Avatar.jsx";

/* ============================================================
   Piptest Console

   Deliberately its own app on its own origin. The code that
   lists every user never ships to a visitor's browser, and the
   API re-checks the admin role on every request regardless.
   ============================================================ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box}
body{margin:0}
:root{
  --bg:#0B0D11; --surface:#151920; --surface2:#1B2029; --surface3:#232935;
  --border:#232935; --ink:#EAEDF2; --muted:#98A2B3; --dim:#5F6875;
  --brand:#2563EB; --brandSoft:#12203C; --logoInk:#F4F7FC; --logoBlue:#1370FD;
  --up:#22C55E; --upSoft:#0F2A1B; --down:#EF4444; --downSoft:#2C1416;
  --amber:#F59E0B;
}
.ad{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:14px;min-height:100vh;-webkit-font-smoothing:antialiased}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums}
h1,h2,h3{margin:0;letter-spacing:-.02em}
.cap{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.sm{font-size:12.5px}
.mut{color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:11px}
.btn{font-family:inherit;font-size:13px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:8px;padding:8px 13px;cursor:pointer;
  transition:background .12s,border-color .12s,opacity .12s;white-space:nowrap}
.btn:hover:not(:disabled){background:var(--surface3)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.btn.pri{background:var(--brand);color:#fff;border-color:var(--brand);font-weight:600}
.btn.pri:hover:not(:disabled){filter:brightness(1.08);background:var(--brand)}
.btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}
.btn.ghost:hover:not(:disabled){background:var(--surface3);color:var(--ink)}
.btn.danger{color:var(--down);border-color:color-mix(in srgb,var(--down) 45%,transparent);background:var(--downSoft)}
.btn.sm{padding:4px 9px;font-size:12px}
.in{font-family:inherit;font-size:13.5px;width:100%;background:var(--bg);color:var(--ink);
  border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-variant-numeric:tabular-nums}
.in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brandSoft)}
.in::placeholder{color:var(--dim)}
.pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;display:inline-block;white-space:nowrap}
.pill.b{background:var(--brandSoft);color:var(--brand)}
.pill.g{background:var(--upSoft);color:var(--up)}
.pill.r{background:var(--downSoft);color:var(--down)}
.pill.n{background:var(--surface3);color:var(--muted)}
.pill.a{background:#3A2A08;color:var(--amber)}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;padding:10px 12px;border-bottom:1px solid var(--border);white-space:nowrap}
.tbl td{padding:11px 12px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr:hover{background:var(--surface2)}
.tab{font-family:inherit;font-size:13.5px;font-weight:500;padding:10px 14px;background:none;border:none;
  border-bottom:2px solid transparent;color:var(--muted);cursor:pointer}
.tab:hover{color:var(--ink)}
.tab.on{color:var(--brand);border-bottom-color:var(--brand)}
.stats{display:grid;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:11px;overflow:hidden}
.stat{background:var(--surface);padding:14px 16px}
.scroll::-webkit-scrollbar{width:9px;height:9px}
.scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:5px}
@keyframes spin{to{transform:rotate(360deg)}}
.spin{animation:spin 1s linear infinite}
`;

const Mark = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <path d="M32 4.5 L54.5 17.6 v26.8 L32 59.5 L9.5 44.4 V17.6 Z" stroke="var(--brand)" strokeWidth="4.5" strokeLinejoin="round" />
    <line x1="20.5" y1="24" x2="20.5" y2="47" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
    <rect x="17.4" y="30" width="6.2" height="12.5" rx="1.6" fill="var(--ink)" />
    <line x1="32" y1="17" x2="32" y2="50" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" />
    <rect x="28.6" y="23.5" width="6.8" height="19" rx="1.7" fill="var(--brand)" />
    <line x1="43.5" y1="14" x2="43.5" y2="42" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
    <rect x="40.4" y="18.5" width="6.2" height="19" rx="1.6" fill="var(--ink)" />
  </svg>
);

const fmtDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "—");
const fmtWhen = (v) => (v ? new Date(v).toLocaleString() : "—");
const ago = (v) => {
  if (!v) return "never";
  const d = (Date.now() - new Date(v).getTime()) / 86400000;
  if (d < 1 / 24) return "just now";
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 30) return `${Math.round(d)}d ago`;
  return fmtDate(v);
};

const EVENT = {
  register: ["signed up", "g"],
  login: ["signed in", "n"],
  login_failed: ["failed sign-in", "a"],
  password_changed: ["changed password", "b"],
  admin_update_user: ["admin edited a user", "b"],
  admin_delete_user: ["admin deleted a user", "r"],
  refresh_reuse_detected: ["token reuse — sessions revoked", "r"],
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    (async () => {
      if (API_ENABLED) {
        const user = await refresh();
        if (user && user.role === "admin") setMe(user);
      }
      setBooting(false);
    })();
  }, []);

  const signOut = async () => {
    try { await api.logout(); } catch (e) {}
    setToken(null); setMe(null);
  };

  if (booting) return <Shell><Center>Loading…</Center></Shell>;
  if (!me) return <Shell><Login onIn={setMe} /></Shell>;

  return (
    <Shell>
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 20px", height: 60,
        borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 20 }}>
        <Mark />
        <img src="/wordmark-dark.png" srcSet="/wordmark-dark.png 1x, /wordmark-dark@3x.png 3x"
          alt="Piptest" height={17} width={Math.round(17 * 3.9808)} draggable={false} style={{ display: "block" }} />
        <span className="sm mut" style={{ fontWeight: 600 }}>Console</span>
        <span className="pill a">internal</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="sm mut">@{me.handle}</span>
          <a className="btn" href="https://piptest.com" target="_blank" rel="noreferrer">Open site</a>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
          {[["overview", "Overview"], ["users", "Users"], ["activity", "Activity"]].map(([id, l]) => (
            <button key={id} className={"tab " + (tab === id ? "on" : "")} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "users" && <Users me={me} />}
        {tab === "activity" && <Activity />}
      </div>
    </Shell>
  );
}

const Shell = ({ children }) => <div className="ad"><style>{CSS}</style>{children}</div>;
const Center = ({ children }) => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }}>{children}</div>
);

/* ---------------- login ---------------- */
function Login({ onIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const { user, accessToken } = await api.login({ email: email.trim(), password });
      if (user.role !== "admin") {
        setErr("That account isn't an admin.");
        try { await api.logout(); } catch (e) {}
        return;
      }
      setToken(accessToken);
      onIn(user);
    } catch (e) {
      setErr(e?.message || "Couldn't sign in.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", marginBottom: 22 }}>
          <Mark size={30} />
          <img src="/wordmark-dark.png" srcSet="/wordmark-dark.png 1x, /wordmark-dark@3x.png 3x"
            alt="Piptest" height={21} width={Math.round(21 * 3.9808)} draggable={false} style={{ display: "block" }} />
          <span className="sm mut" style={{ fontWeight: 600 }}>Console</span>
        </div>
        <div className="card" style={{ padding: 26 }}>
          <h2 style={{ fontSize: 19, marginBottom: 6 }}>Admin sign-in</h2>
          <p className="sm mut" style={{ marginBottom: 20, lineHeight: 1.6 }}>
            Use your Piptest account. Only admin accounts can get in here.
          </p>

          {!API_ENABLED && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }}>
              VITE_API_URL isn't set for this build, so there's nothing to sign in to.
            </div>
          )}

          <div style={{ display: "grid", gap: 13 }}>
            <label>
              <span className="cap" style={{ display: "block", marginBottom: 6 }}>Email</span>
              <input className="in" type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </label>
            <label>
              <span className="cap" style={{ display: "block", marginBottom: 6 }}>Password</span>
              <input className="in" type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </label>
          </div>

          {err && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 15 }}>{err}</div>
          )}

          <button className="btn pri" style={{ width: "100%", marginTop: 18, padding: 11 }}
            disabled={busy || !email || !password} onClick={submit}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- overview ---------------- */
function Overview() {
  const [d, setD] = useState(null);
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setD(await api.overview()); setHealth(await api.health()); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (err) return <div className="card" style={{ padding: 26, color: "var(--down)" }}>{err}</div>;
  if (!d) return <div className="card mut" style={{ padding: 26 }}>Loading…</div>;

  const retention = d.users ? (d.active30 / d.users) * 100 : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Stat label="Total users" value={d.users} sub={d.disabled ? `${d.disabled} disabled` : "none disabled"} />
        <Stat label="Active · 7 days" value={d.active7} sub="signed in" />
        <Stat label="Active · 30 days" value={d.active30} />
        <Stat label="Retention" value={`${retention.toFixed(0)}%`} sub="30d active / total"
          tone={retention >= 40 ? "up" : retention < 15 ? "down" : undefined} />
        <Stat label="Sessions" value={d.sessions} sub="backtests created" />
        <Stat label="Trades" value={d.trades} sub="logged" />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="cap">Signups · last 30 days</span>
          <span className="sm mut">{d.signups.reduce((s, x) => s + x.n, 0)} total</span>
        </div>
        <Bars data={d.signups} />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="cap" style={{ marginBottom: 14 }}>System</div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <Health label="API" ok={!!health?.ok} />
          <Health label="Database" ok={health?.db === "up"} />
          <div>
            <div className="cap" style={{ marginBottom: 5 }}>Storage used</div>
            <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
              {(((d.users * 0.5 + d.sessions * 120 + d.trades * 0.4) / 1024)).toFixed(1)} MB
              <span className="sm mut" style={{ fontWeight: 400 }}> of 500 MB est.</span>
            </div>
          </div>
        </div>
        <p className="sm mut" style={{ marginTop: 14, lineHeight: 1.6 }}>
          Storage is an estimate from row counts — check Supabase → Settings → Usage for the real figure.
        </p>
      </div>

      <OrphanedTrades />
    </div>
  );
}

/* ---------------- orphaned trades ----------------
   Sessions deleted before trades.session_id was tracked left their
   trades behind — invisible in the app itself (nothing points to a
   session that no longer exists), but still counted in Dashboard,
   Journal and Analytics totals for whoever owns them. The server
   backfills session_id for anything it can still match to a session
   that's still around (see migrate() in db.js); what's left here is
   only the genuinely orphaned remainder, with no surviving session to
   belong to. Purge is a real DELETE with no undo, so it's typed-confirm
   like the account-delete panel below, not a single click. */
function OrphanedTrades() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    try { setD(await api.orphanedTrades()); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const purge = async () => {
    setBusy(true);
    try {
      const r = await api.purgeOrphanedTrades();
      setDone(r.deleted);
      setConfirmText("");
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err) return <div className="card" style={{ padding: 20, color: "var(--down)" }}>{err}</div>;
  if (!d) return null;

  if (d.count === 0) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="cap" style={{ marginBottom: 6 }}>Orphaned trades</div>
        <p className="sm mut">
          None found{done != null ? ` — ${done} cleaned up just now.` : ". Every trade belongs to a session that still exists."}
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 20, borderColor: "color-mix(in srgb,var(--down) 40%,var(--border))" }}>
      <div className="cap" style={{ marginBottom: 8, color: "var(--down)" }}>Orphaned trades</div>
      <p className="sm mut" style={{ lineHeight: 1.6, marginBottom: 12 }}>
        <b style={{ color: "var(--ink)" }}>{d.count}</b> trade{d.count === 1 ? "" : "s"}
        {" "}({d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(2)} combined P/L) left over from sessions that have
        since been deleted — they still count toward the owning account's Dashboard, Journal and
        Analytics totals since there's no session left to exclude them by. There's no undo. Type{" "}
        <b style={{ color: "var(--ink)" }}>DELETE</b> to remove them.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="in" style={{ maxWidth: 200 }} value={confirmText}
          placeholder="DELETE" onChange={(e) => setConfirmText(e.target.value)} />
        <button className="btn danger" disabled={busy || confirmText !== "DELETE"} onClick={purge}>
          Delete {d.count} trade{d.count === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

const Health = ({ label, ok }) => (
  <div>
    <div className="cap" style={{ marginBottom: 5 }}>{label}</div>
    <span className={"pill " + (ok ? "g" : "r")}>{ok ? "up" : "down"}</span>
  </div>
);

const Stat = ({ label, value, sub, tone }) => (
  <div className="stat">
    <div className="cap" style={{ marginBottom: 6 }}>{label}</div>
    <div className="num" style={{ fontSize: 22, fontWeight: 700,
      color: tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--ink)" }}>{value ?? "—"}</div>
    {sub && <div className="sm mut" style={{ marginTop: 3 }}>{sub}</div>}
  </div>
);

function Bars({ data }) {
  const max = Math.max(1, ...data.map((x) => x.n));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
        {data.map((x) => (
          <div key={x.day} title={`${x.day}: ${x.n}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ height: `${(x.n / max) * 100}%`, minHeight: x.n ? 4 : 2,
              background: x.n ? "var(--brand)" : "var(--surface3)", borderRadius: 3 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span className="sm mut" style={{ fontSize: 11 }}>{data[0]?.day}</span>
        <span className="sm mut" style={{ fontSize: 11 }}>{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

/* ---------------- users ---------------- */
function Users({ me }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(null);
  const PER = 25;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api.users({ q, limit: PER, offset: page * PER });
      setRows(d.users); setTotal(d.total);
    } finally { setBusy(false); }
  }, [q, page]);

  useEffect(() => { const t = setTimeout(load, q ? 280 : 0); return () => clearTimeout(t); }, [load, q]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input className="in" style={{ maxWidth: 320 }} placeholder="Search email, handle or name…"
          value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <span className="sm mut">{total} account{total === 1 ? "" : "s"}</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="scroll" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>{["User", "Email", "Role", "Status", "Sessions", "Trades", "Joined", "Last seen", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar value={u.avatar} handle={u.handle} size={26} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div className="sm mut" style={{ fontSize: 11.5 }}>@{u.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mut" style={{ fontSize: 12.5 }}>{u.email}</td>
                  <td><span className={"pill " + (u.role === "admin" ? "b" : "n")}>{u.role}</span></td>
                  <td><span className={"pill " + (u.status === "active" ? "g" : "r")}>{u.status}</span></td>
                  <td>{u.sessionCount}</td>
                  <td>{u.tradeCount}</td>
                  <td className="mut" style={{ fontSize: 12 }}>{fmtDate(u.createdAt)}</td>
                  <td className="mut" style={{ fontSize: 12 }}>{ago(u.lastLoginAt)}</td>
                  <td><button className="btn ghost sm" onClick={() => setOpen(u.id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && !busy && (
          <div style={{ padding: 34, textAlign: "center" }} className="mut">No accounts match that search.</div>
        )}
      </div>

      {total > PER && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 16 }}>
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="sm mut">{page * PER + 1}–{Math.min((page + 1) * PER, total)} of {total}</span>
          <button className="btn" disabled={(page + 1) * PER >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {open && <UserDrawer id={open} me={me} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function UserDrawer({ id, me, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const self = d?.user?.id === me.id;

  useEffect(() => { (async () => {
    try { setD(await api.user(id)); } catch (e) { setErr(e.message); }
  })(); }, [id]);

  const patch = async (body) => {
    setBusy(true);
    try { const r = await api.patchUser(id, body); setD((x) => ({ ...x, user: r.user })); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const destroy = async () => {
    setBusy(true);
    try { await api.deleteUser(id); onChanged(); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const u = d?.user;
  const t = d?.trades;
  const winRate = t && t.n ? (t.wins / t.n) * 100 : 0;

  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,8,12,.6)", display: "flex", justifyContent: "flex-end" }}>
      <div className="scroll" style={{ width: "min(560px,100%)", background: "var(--bg)", borderLeft: "1px solid var(--border)", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg)" }}>
          <h3 style={{ fontSize: 16 }}>{u ? `@${u.handle}` : "Loading…"}</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>

        {err && <div style={{ margin: 20, padding: "10px 12px", borderRadius: 8, background: "var(--downSoft)",
          border: "1px solid var(--down)", color: "var(--down)", fontSize: 12.5 }}>{err}</div>}

        {u && (
          <div style={{ padding: 20, display: "grid", gap: 18 }}>
            <div className="card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Avatar value={u.avatar} handle={u.handle} size={46} />
              <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{u.name}</div>
              <div className="sm mut" style={{ marginTop: 3 }}>{u.email}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <span className={"pill " + (u.role === "admin" ? "b" : "n")}>{u.role}</span>
                <span className={"pill " + (u.status === "active" ? "g" : "r")}>{u.status}</span>
                <span className="pill n">{u.plan}</span>
              </div>
              <div className="sm mut" style={{ marginTop: 12, lineHeight: 1.7 }}>
                Joined {fmtDate(u.createdAt)}<br />
                Last seen {ago(u.lastLoginAt)}
              </div>
              </div>
            </div>

            <div className="stats" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
              <Stat label="Sessions" value={d.sessions.length} />
              <Stat label="Trades" value={t?.n ?? 0} />
              <Stat label="Win rate" value={t?.n ? `${winRate.toFixed(0)}%` : "—"} />
              <Stat label="Total R" value={t?.n ? (t.total_r >= 0 ? "+" : "") + Number(t.total_r).toFixed(1) : "—"}
                tone={t?.total_r > 0 ? "up" : t?.total_r < 0 ? "down" : undefined} />
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="cap" style={{ marginBottom: 12 }}>Manage</div>
              {self ? (
                <p className="sm mut" style={{ lineHeight: 1.6 }}>
                  This is your own account. Role, status and deletion are locked here so you can't
                  lock yourself out of the console.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" disabled={busy}
                      onClick={() => patch({ role: u.role === "admin" ? "user" : "admin" })}>
                      {u.role === "admin" ? "Remove admin" : "Make admin"}
                    </button>
                    <button className="btn" disabled={busy}
                      onClick={() => patch({ status: u.status === "active" ? "disabled" : "active" })}>
                      {u.status === "active" ? "Disable account" : "Re-enable account"}
                    </button>
                  </div>
                  <p className="sm mut" style={{ lineHeight: 1.6 }}>
                    Disabling signs them out everywhere immediately and blocks sign-in.
                  </p>
                </div>
              )}
            </div>

            {d.sessions.length > 0 && (
              <div className="card" style={{ overflow: "hidden" }}>
                <div className="cap" style={{ padding: "14px 16px 10px" }}>Recent sessions</div>
                <table className="tbl">
                  <thead><tr>{["Name", "Market", "Trades", "Updated"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d.sessions.slice(0, 8).map((s) => (
                      <tr key={s.id}>
                        <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</td>
                        <td className="mut">{s.symbol} · {s.interval}</td>
                        <td>{s.stats?.count ?? 0}</td>
                        <td className="mut" style={{ fontSize: 12 }}>{ago(s.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {d.events.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <div className="cap" style={{ marginBottom: 12 }}>Recent activity</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {d.events.slice(0, 8).map((e, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={"pill " + (EVENT[e.type]?.[1] || "n")}>{EVENT[e.type]?.[0] || e.type}</span>
                      <span className="sm mut">{ago(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!self && (
              <div className="card" style={{ padding: 16, borderColor: "color-mix(in srgb,var(--down) 40%,var(--border))" }}>
                <div className="cap" style={{ marginBottom: 8, color: "var(--down)" }}>Delete account</div>
                <p className="sm mut" style={{ lineHeight: 1.6, marginBottom: 12 }}>
                  Removes the account and every session and trade with it. There's no undo and no backup
                  on the free plan. Type <b style={{ color: "var(--ink)" }}>{u.handle}</b> to confirm.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="in" style={{ maxWidth: 200 }} value={confirmText}
                    placeholder={u.handle} onChange={(e) => setConfirmText(e.target.value)} />
                  <button className="btn danger" disabled={busy || confirmText !== u.handle} onClick={destroy}>
                    Delete permanently
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- activity ---------------- */
function Activity() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try { setEvents((await api.events(120)).events); } finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const shown = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "security") return events.filter((e) => ["login_failed", "refresh_reuse_detected", "password_changed"].includes(e.type));
    if (filter === "signups") return events.filter((e) => e.type === "register");
    return events.filter((e) => e.type.startsWith("admin_"));
  }, [events, filter]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {[["all", "Everything"], ["signups", "Signups"], ["security", "Security"], ["admin", "Admin actions"]].map(([id, l]) => (
          <button key={id} className={"btn " + (filter === id ? "pri" : "")} onClick={() => setFilter(id)}>{l}</button>
        ))}
        <button className="btn" style={{ marginLeft: "auto" }} onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead><tr>{["When", "Who", "Event", "Detail"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="mut" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtWhen(e.created_at)}</td>
                <td>{e.handle ? `@${e.handle}` : <span className="mut">—</span>}</td>
                <td><span className={"pill " + (EVENT[e.type]?.[1] || "n")}>{EVENT[e.type]?.[0] || e.type}</span></td>
                <td className="mut" style={{ fontSize: 12, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div style={{ padding: 34, textAlign: "center" }} className="mut">Nothing here yet.</div>}
      </div>

      <p className="sm mut" style={{ marginTop: 14, lineHeight: 1.6 }}>
        Repeated failed sign-ins from one account are worth a look. Token-reuse events mean a refresh
        token was replayed — that account's sessions were revoked automatically.
      </p>
    </div>
  );
}
