import React, { useState, useEffect } from "react";
import Logo from "../components/Logo.jsx";
import { Card, Field } from "../components/ui.jsx";
import { api, API_ENABLED } from "../lib/api.js";

/* ============================================================
   Reset — the page a password-reset link opens

   The token is checked before the form appears, so a stale link
   says so immediately rather than after someone has typed a new
   password twice.
   ============================================================ */

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];

export default function Reset({ token, onDone, onBack }) {
  const [state, setState] = useState("checking");   // checking | ready | bad | done
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!API_ENABLED) { setState("bad"); return; }
      try {
        const r = await api.checkReset(token);
        if (r.valid) { setEmail(r.email || ""); setState("ready"); }
        else setState("bad");
      } catch (e) { setState("bad"); }
    })();
  }, [token]);

  const submit = async () => {
    if (pw.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (pw !== confirm) { setErr("Those two passwords don't match."); return; }
    setErr(""); setBusy(true);
    try {
      await api.resetPassword({ token, password: pw });
      setState("done");
    } catch (e) {
      setErr(e?.message || "Couldn't reset your password.");
      if (e?.code === "invalid_token") setState("bad");
    } finally { setBusy(false); }
  };

  const st = strength(pw);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <Logo size={34} />
          </button>
        </div>

        <Card style={{ padding: 28 }}>
          {state === "checking" && <p className="sm mut">Checking your link…</p>}

          {state === "bad" && (
            <>
              <h2 style={{ fontSize: 20, marginBottom: 8 }}>That link has expired</h2>
              <p className="sm mut" style={{ lineHeight: 1.65, marginBottom: 20 }}>
                Reset links work once and last an hour. Ask for a new one and it'll be in your
                inbox in a moment.
              </p>
              <button className="btn pri" style={{ width: "100%", padding: 11 }} onClick={onBack}>
                Back to sign in
              </button>
            </>
          )}

          {state === "done" && (
            <>
              <h2 style={{ fontSize: 20, marginBottom: 8 }}>Password updated</h2>
              <p className="sm mut" style={{ lineHeight: 1.65, marginBottom: 20 }}>
                You've been signed out everywhere else as a precaution. Sign in with your new password.
              </p>
              <button className="btn pri" style={{ width: "100%", padding: 11 }} onClick={onDone}>
                Sign in
              </button>
            </>
          )}

          {state === "ready" && (
            <>
              <h2 style={{ fontSize: 20, marginBottom: 6 }}>Choose a new password</h2>
              <p className="sm mut" style={{ marginBottom: 22, lineHeight: 1.6 }}>
                {email ? <>For the account ending <b style={{ color: "var(--ink)" }}>{email}</b>.</> : "Pick something you'll remember."}
              </p>

              <div style={{ display: "grid", gap: 14 }}>
                <Field label="New password">
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="in" type={show ? "text" : "password"} value={pw}
                      autoComplete="new-password" placeholder="At least 8 characters"
                      onChange={(e) => setPw(e.target.value)} />
                    <button className="btn" type="button" style={{ padding: "0 11px", fontSize: 12 }}
                      onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
                  </div>
                </Field>

                {pw.length > 0 && (
                  <div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} style={{
                          flex: 1, height: 3, borderRadius: 2,
                          background: i < st ? (st <= 1 ? "var(--down)" : st === 2 ? "#F59E0B" : "var(--up)") : "var(--surface3)",
                        }} />
                      ))}
                    </div>
                    <span className="sm mut" style={{ fontSize: 11.5 }}>{LABELS[st]}</span>
                  </div>
                )}

                <Field label="Confirm password">
                  <input className="in" type={show ? "text" : "password"} value={confirm}
                    autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()} />
                </Field>
              </div>

              {err && (
                <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
                  borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 16, lineHeight: 1.55 }}>{err}</div>
              )}

              <button className="btn pri" style={{ width: "100%", marginTop: 18, padding: 11 }}
                disabled={busy || !pw || !confirm} onClick={submit}>
                {busy ? "Saving…" : "Set new password"}
              </button>

              <p className="sm mut" style={{ marginTop: 14, lineHeight: 1.6 }}>
                This signs you out on every device, including any you're already using.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
