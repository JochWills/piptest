import React, { useState } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Field, Svg, Ic, Modal } from "../components/ui.jsx";
import { DEFAULT_TAGS } from "../theme.js";
import { SHARED_ENABLED } from "../lib/store.js";

export default function Settings({ account, onSaveAccount, tags, onSaveTags, onWipe, sessions, trades }) {
  const [name, setName] = useState(account.name || "");
  const [handle, setHandle] = useState(account.handle || "");
  const [newTag, setNewTag] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveProfile = () => {
    const h = handle.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 18);
    if (!h) return;
    onSaveAccount({ ...account, name: name.trim() || h, handle: h });
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t || tags.includes(t)) { setNewTag(""); return; }
    onSaveTags([...tags, t]); setNewTag("");
  };

  return (
    <div>
      <PageHead eyebrow="Account" title="Settings" />

      <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
        <Card style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Profile</h3>
          <p className="sm mut" style={{ marginBottom: 16 }}>Your handle is what others see in shared rooms.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Display name">
              <input className="in" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Handle">
              <input className="in" value={handle} maxLength={18} onChange={(e) => setHandle(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button className="btn pri" onClick={saveProfile}>Save profile</button>
            {saved && <span className="sm" style={{ color: "var(--up)" }}>Saved</span>}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Setup tags</h3>
          <p className="sm mut" style={{ marginBottom: 16 }}>
            Tag trades as you take them, then find out in Analytics which setup is actually carrying your account.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {tags.map((t) => (
              <span key={t} className="pill n" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px" }}>
                {t}
                <button onClick={() => onSaveTags(tags.filter((x) => x !== t))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", padding: 0, fontSize: 13 }}
                  aria-label={`Remove ${t}`}>✕</button>
              </span>
            ))}
            {tags.length === 0 && <span className="sm mut">No tags. Add one below.</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="in" style={{ maxWidth: 260 }} value={newTag} placeholder="Add a tag…"
              onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
            <button className="btn" onClick={addTag}>Add</button>
            {tags.length !== DEFAULT_TAGS.length && (
              <button className="btn ghost" onClick={() => onSaveTags(DEFAULT_TAGS)}>Reset to defaults</button>
            )}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Live rooms</h3>
          <p className="sm mut" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            {SHARED_ENABLED
              ? "The sync service is connected. You can host rooms and share your chart."
              : "Rooms need the sync service. Set VITE_API_URL on the site and redeploy — see TRADINGVIEW.md and the README."}
          </p>
          <span className={"pill " + (SHARED_ENABLED ? "g" : "n")}>
            {SHARED_ENABLED ? "Connected" : "Not configured"}
          </span>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Usage</h3>
          <p className="sm mut" style={{ marginBottom: 16, lineHeight: 1.6 }}>
            PipTest is free while it's in early access — everything is unlocked.
          </p>
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            {[["Sessions", sessions.length], ["Trades logged", trades.length], ["Setup tags", tags.length]].map(([l, v]) => (
              <div key={l}>
                <div className="cap" style={{ marginBottom: 4 }}>{l}</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 20, borderColor: "color-mix(in srgb, var(--down) 40%, var(--border))" }}>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>Danger zone</h3>
          <p className="sm mut" style={{ marginBottom: 14, lineHeight: 1.6 }}>
            Sessions, trades and drawings are stored in this browser. Wiping removes all of it and cannot be undone.
          </p>
          <button className="btn" style={{ color: "var(--down)", borderColor: "var(--down)" }}
            onClick={() => setConfirmWipe(true)}>Delete all data</button>
        </Card>
      </div>

      <Modal open={confirmWipe} onClose={() => setConfirmWipe(false)} title="Delete everything?" width={440}>
        <p className="sm mut" style={{ lineHeight: 1.7, marginBottom: 18 }}>
          This removes {sessions.length} session{sessions.length === 1 ? "" : "s"}, {trades.length} trade
          {trades.length === 1 ? "" : "s"}, every drawing and your profile. There's no undo and no backup.
        </p>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn" style={{ background: "var(--down)", color: "#fff", borderColor: "var(--down)" }}
            onClick={() => { onWipe(); setConfirmWipe(false); }}>Yes, delete everything</button>
          <button className="btn" onClick={() => setConfirmWipe(false)}>Keep my data</button>
        </div>
      </Modal>
    </div>
  );
}
