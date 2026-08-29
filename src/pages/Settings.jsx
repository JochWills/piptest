import React, { useState, useEffect } from "react";
import { PageHead } from "../components/Shell.jsx";
import { Card, Field, Svg, Ic, Modal } from "../components/ui.jsx";
import { DEFAULT_TAGS } from "../theme.js";
import { API_ENABLED } from "../lib/api.js";
import Avatar from "../components/Avatar.jsx";
import { AVATAR_ICONS, AVATAR_COLORS, encodeAvatar, decodeAvatar } from "../lib/avatars.js";

export default function Settings({ account, onSaveAccount, onChangePassword, tags, onSaveTags, onWipe, onSignOut, sessions, trades }) {
  const [name, setName] = useState(account.name || "");
  const [handle, setHandle] = useState(account.handle || "");
  const [newTag, setNewTag] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [saved, setSaved] = useState(false);

  const [profErr, setProfErr] = useState("");
  const saveProfile = async () => {
    const h = handle.trim();
    if (!/^[a-zA-Z0-9_]{3,18}$/.test(h)) {
      setProfErr("Handle must be 3\u201318 characters: letters, numbers or underscores."); return;
    }
    setProfErr("");
    try {
      await onSaveAccount({ name: name.trim() || h, handle: h });
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } catch (e) { setProfErr(e?.message || "Couldn't save your profile."); }
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <Avatar value={account.avatar} handle={account.handle} size={56} />
            <div>
              <button className="btn" onClick={() => setPickerOpen(true)}>Change avatar</button>
              <div className="sm mut" style={{ marginTop: 6 }}>
                {decodeAvatar(account.avatar, account.handle).isDefault
                  ? "Picked for you from your handle — change it any time."
                  : "This is how you appear in shared rooms."}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Display name">
              <input className="in" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Handle">
              <input className="in" value={handle} maxLength={18} onChange={(e) => setHandle(e.target.value)} />
            </Field>
          </div>
          {profErr && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "9px 11px", fontSize: 12.5, marginTop: 12 }}>{profErr}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button className="btn pri" onClick={saveProfile}>Save profile</button>
            {saved && <span className="sm" style={{ color: "var(--up)" }}>Saved</span>}
          </div>
          {account?.email && (
            <p className="sm mut" style={{ marginTop: 14 }}>
              Signed in as {account.email}
              {account.role === "admin" && <span className="pill b" style={{ marginLeft: 8 }}>admin</span>}
            </p>
          )}
        </Card>

        {API_ENABLED && <PasswordCard onChangePassword={onChangePassword} onSignOut={onSignOut} />}

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
            {API_ENABLED
              ? "Connected. You can host rooms and share your chart live."
              : "Rooms need the API. Set VITE_API_URL on the static site and redeploy — see BACKEND.md."}
          </p>
          <span className={"pill " + (API_ENABLED ? "g" : "n")}>
            {API_ENABLED ? "Connected" : "Not configured"}
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

      <AvatarPicker
        open={pickerOpen}
        account={account}
        onClose={() => setPickerOpen(false)}
        onSave={async (value) => { await onSaveAccount({ avatar: value }); setPickerOpen(false); }}
      />

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


/* Changing a password revokes every other session, so the user is
   signed out here too — otherwise this tab holds a token the
   server has already invalidated. */
function PasswordCard({ onChangePassword, onSignOut }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    setErr(""); setBusy(true);
    try {
      await onChangePassword({ current, next });
      setMsg("Password changed. Signing you out of every device…");
      setTimeout(onSignOut, 1600);
    } catch (e) {
      setErr(e?.message || "Couldn't change your password.");
    } finally { setBusy(false); }
  };

  return (
    <Card style={{ padding: 20 }}>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>Password</h3>
      <p className="sm mut" style={{ marginBottom: 16, lineHeight: 1.6 }}>
        Changing this signs you out everywhere, including this tab.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 480 }}>
        <Field label="Current password">
          <input className="in" type="password" value={current} autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <input className="in" type="password" value={next} autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </Field>
      </div>
      {err && <div style={{ color: "var(--down)", fontSize: 12.5, marginTop: 12 }}>{err}</div>}
      {msg && <div style={{ color: "var(--up)", fontSize: 12.5, marginTop: 12 }}>{msg}</div>}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !current || !next} onClick={submit}>
        {busy ? "Changing…" : "Change password"}
      </button>
    </Card>
  );
}


/* ------------------------------------------------------------
   AvatarPicker

   Icon and colour are chosen separately, so 32 icons and 10
   colours give 320 combinations from a list short enough to scan.
   The preview updates as you go, and nothing is saved until you
   confirm.
   ------------------------------------------------------------ */
function AvatarPicker({ open, account, onClose, onSave }) {
  const current = decodeAvatar(account.avatar, account.handle);
  const [icon, setIcon] = useState(current.icon.id);
  const [color, setColor] = useState(current.color.id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const c = decodeAvatar(account.avatar, account.handle);
      setIcon(c.icon.id); setColor(c.color.id);
    }
  }, [open, account.avatar, account.handle]);

  if (!open) return null;
  const preview = encodeAvatar(icon, color);

  return (
    <Modal open={open} onClose={onClose} title="Choose your avatar" width={520}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <Avatar value={preview} size={64} />
        <div>
          <div style={{ fontWeight: 600 }}>{account.name || account.handle}</div>
          <div className="sm mut" style={{ marginTop: 3 }}>@{account.handle}</div>
        </div>
      </div>

      <span className="cap" style={{ display: "block", marginBottom: 9 }}>Colour</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {AVATAR_COLORS.map((c) => (
          <button key={c.id} onClick={() => setColor(c.id)} title={c.name} aria-label={c.name}
            style={{
              width: 30, height: 30, borderRadius: "50%", cursor: "pointer", padding: 0,
              background: c.bg,
              border: color === c.id ? "2px solid var(--ink)" : "2px solid transparent",
              outline: color === c.id ? "2px solid var(--brand)" : "none", outlineOffset: 1,
            }} />
        ))}
      </div>

      <span className="cap" style={{ display: "block", marginBottom: 9 }}>Icon</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(46px,1fr))", gap: 7 }}>
        {AVATAR_ICONS.map((i) => (
          <button key={i.id} onClick={() => setIcon(i.id)} title={i.label} aria-label={i.label}
            style={{
              aspectRatio: "1", display: "grid", placeItems: "center", cursor: "pointer",
              fontSize: 21, lineHeight: 1, borderRadius: 9,
              background: icon === i.id ? "var(--brandSoft)" : "var(--surface2)",
              border: "1px solid " + (icon === i.id ? "var(--brand)" : "var(--border)"),
            }}>{i.char}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: 22 }}>
        <button className="btn pri" disabled={busy}
          onClick={async () => { setBusy(true); await onSave(preview); setBusy(false); }}>
          {busy ? "Saving…" : "Save avatar"}
        </button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
