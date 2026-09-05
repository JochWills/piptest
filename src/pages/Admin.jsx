import React, { useState, useEffect, useCallback, useMemo } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Stat, Empty, Modal, Field, Svg, Ic } from "../components/ui.jsx";
import { api } from "../lib/api.js";
import { fmtMoney, fmtShort } from "../lib/trading.js";

/* ============================================================
   Admin

   Read-mostly view of who's using Piptest. Every endpoint behind
   it re-checks the admin role server-side — hiding the nav item
   is presentation, not security.
   ============================================================ */

const EVENT_LABEL = {
  register: "signed up",
  login: "signed in",
  login_failed: "failed sign-in",
  password_changed: "changed password",
  admin_update_user: "updated a user",
  refresh_reuse_detected: "refresh token reuse — sessions revoked",
};
const EVENT_TONE = {
  register: "g", login_failed: "r", refresh_reuse_detected: "r", admin_update_user: "b",
};

export default function Admin({ me }) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [events, setEvents] = useState([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const PER = 25;

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const [o, u, e] = await Promise.all([
        api.adminOverview(),
        api.adminUsers({ q, limit: PER, offset: page * PER }),
        api.adminEvents(60),
      ]);
      setOverview(o); setUsers(u.users); setTotal(u.total); setEvents(e.events);
    } catch (ex) {
      setErr(ex?.status === 403 ? "You don't have admin access." : ex?.message || "Couldn't load admin data.");
    } finally { setBusy(false); }
  }, [q, page]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const save = async (id, patch) => {
    try {
      const { user } = await api.adminPatchUser(id, patch);
      setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...user } : u)));
      setEditing(null);
      load();
    } catch (ex) { alert(ex?.message || "Update failed."); }
  };

  if (err) {
    return (
      <div>
        <PageHead eyebrow="Internal" title="Admin" />
        <Card><Empty title="Not available" body={err} /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow="Internal"
        title="Admin"
        sub="Accounts, activity and usage across Piptest."
        actions={<button className="btn" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>}
      />

      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
        {[["overview", "Overview"], ["users", `Users${total ? ` (${total})` : ""}`], ["activity", "Activity"]].map(([id, l]) => (
          <button key={id} className={"tab " + (tab === id ? "on" : "")} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid-stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", marginBottom: 16 }}>
            <Stat label="Total users" value={overview?.users ?? "—"} sub={overview?.disabled ? `${overview.disabled} disabled` : "none disabled"} />
            <Stat label="Active (7d)" value={overview?.active7 ?? "—"} sub="signed in" />
            <Stat label="Active (30d)" value={overview?.active30 ?? "—"} />
            <Stat label="Sessions created" value={overview?.sessions ?? "—"} />
            <Stat label="Trades logged" value={overview?.trades ?? "—"} />
            <Stat label="Retention" value={
              overview && overview.users ? `${((overview.active30 / overview.users) * 100).toFixed(0)}%` : "—"
            } sub="30d active / total" />
          </div>

          <Card style={{ padding: 18 }}>
            <div className="cap" style={{ marginBottom: 14 }}>Signups, last 30 days</div>
            <SignupChart data={overview?.signups || []} />
          </Card>
        </>
      )}

      {tab === "users" && (
        <>
          <Card style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ position: "relative", maxWidth: 340 }}>
              <span style={{ position: "absolute", left: 10, top: 10, color: "var(--dim)" }}><Svg s={15}>{Ic.search}</Svg></span>
              <input className="in" style={{ paddingLeft: 32 }} placeholder="Search email, handle or name…"
                value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            </div>
          </Card>

          <Card style={{ overflow: "hidden" }}>
            <div className="scroll" style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>{["User", "Email", "Role", "Status", "Sessions", "Trades", "Joined", "Last seen", ""].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div className="sm mut" style={{ fontSize: 11.5 }}>@{u.handle}</div>
                      </td>
                      <td className="mut" style={{ fontSize: 12.5 }}>{u.email}</td>
                      <td><span className={"pill " + (u.role === "admin" ? "b" : "n")}>{u.role}</span></td>
                      <td><span className={"pill " + (u.status === "active" ? "g" : "r")}>{u.status}</span></td>
                      <td>{u.sessionCount}</td>
                      <td>{u.tradeCount}</td>
                      <td className="mut" style={{ fontSize: 12 }}>{u.createdAt ? fmtShort(new Date(u.createdAt).getTime()) : "—"}</td>
                      <td className="mut" style={{ fontSize: 12 }}>{u.lastLoginAt ? fmtShort(new Date(u.lastLoginAt).getTime()) : "never"}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: "3px 9px", fontSize: 12 }}
                          onClick={() => setEditing(u)}>Manage</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!users.length && !busy && <Empty title="No users match that search" />}
          </Card>

          {total > PER && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 16 }}>
              <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="sm mut">{page * PER + 1}–{Math.min((page + 1) * PER, total)} of {total}</span>
              <button className="btn" disabled={(page + 1) * PER >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {tab === "activity" && (
        <Card style={{ overflow: "hidden" }}>
          {events.length === 0 ? <Empty title="Nothing logged yet" /> : (
            <table className="tbl">
              <thead><tr>{["When", "Who", "Event", "Detail"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="mut" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td>{e.handle ? `@${e.handle}` : <span className="mut">—</span>}</td>
                    <td><span className={"pill " + (EVENT_TONE[e.type] || "n")}>{EVENT_LABEL[e.type] || e.type}</span></td>
                    <td className="mut" style={{ fontSize: 12 }}>
                      {e.meta && Object.keys(e.meta).length ? JSON.stringify(e.meta).slice(0, 90) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <UserModal user={editing} me={me} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
}

function UserModal({ user, me, onClose, onSave }) {
  const [role, setRole] = useState("user");
  const [status, setStatus] = useState("active");
  useEffect(() => { if (user) { setRole(user.role); setStatus(user.status); } }, [user]);
  if (!user) return null;
  const self = user.id === me?.id;

  return (
    <Modal open={!!user} onClose={onClose} title={`Manage @${user.handle}`} width={460}>
      <div className="grid-stats" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <Stat label="Sessions" value={user.sessionCount} />
        <Stat label="Trades" value={user.tradeCount} />
        <Stat label="Joined" value={user.createdAt ? fmtShort(new Date(user.createdAt).getTime()) : "—"} />
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Role">
          <select className="in" value={role} disabled={self} onChange={(e) => setRole(e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Status" hint="Disabling revokes every active session immediately.">
          <select className="in" value={status} disabled={self} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
      </div>

      {self && (
        <div className="sm mut" style={{ marginTop: 14, lineHeight: 1.6 }}>
          This is your own account — role and status are locked so you can't accidentally lock yourself out.
        </div>
      )}

      <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
        <button className="btn pri" disabled={self} onClick={() => onSave(user.id, { role, status })}>Save changes</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function SignupChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 130 }}>
        {data.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.n} signup${d.n === 1 ? "" : "s"}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{
              height: `${(d.n / max) * 100}%`, minHeight: d.n ? 4 : 2,
              background: d.n ? "var(--brand)" : "var(--surface3)",
              borderRadius: 3, opacity: d.n ? 0.9 : 1,
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span className="sm mut" style={{ fontSize: 11 }}>{data[0]?.day || ""}</span>
        <span className="sm mut" style={{ fontSize: 11 }}>{total} in 30 days</span>
        <span className="sm mut" style={{ fontSize: 11 }}>{data[data.length - 1]?.day || ""}</span>
      </div>
    </div>
  );
}
