import React, { useState } from "react";
import Logo from "../components/Logo.jsx";
import { Card, Field, Svg, Ic } from "../components/ui.jsx";

/* ============================================================
   Auth

   Local-only for now: an account is a display name plus a
   handle kept in this browser. When a real backend lands, this
   is the one screen that changes — everything downstream reads
   the account object, not the auth mechanism.
   ============================================================ */

export default function Auth({ mode = "signup", onDone, onBack, onSwitch }) {
  const isSignup = mode === "signup";
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    const h = handle.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 18);
    if (!h) { setErr("Pick a handle — it's how you appear in shared rooms."); return; }
    if (isSignup && !name.trim()) { setErr("What should we call you?"); return; }
    onDone({
      name: name.trim() || h,
      handle: h,
      email: email.trim(),
      plan: "free",
      createdAt: Date.now(),
    });
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <Logo size={34} />
          </button>
        </div>

        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 22, marginBottom: 6 }}>{isSignup ? "Create your account" : "Welcome back"}</h2>
          <p className="sm mut" style={{ marginBottom: 22, lineHeight: 1.6 }}>
            {isSignup
              ? "No card, no trial timer. Your sessions save to this browser."
              : "Enter the handle you set up with."}
          </p>

          <div style={{ display: "grid", gap: 14 }}>
            {isSignup && (
              <Field label="Display name">
                <input className="in" value={name} placeholder="Josh" onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Handle" hint={isSignup ? "Letters, numbers and underscores. Shown to others in shared rooms." : undefined}>
              <input className="in" value={handle} placeholder="josh_pe" maxLength={18}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </Field>
            {isSignup && (
              <Field label="Email" hint="Optional for now — used later for saving across devices.">
                <input className="in" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
              </Field>
            )}
          </div>

          {err && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "9px 11px", fontSize: 13, marginTop: 14 }}>{err}</div>
          )}

          <button className="btn pri" style={{ width: "100%", marginTop: 18, padding: 11 }} onClick={submit}>
            {isSignup ? "Create account" : "Continue"}
          </button>

          <div className="sm mut" style={{ textAlign: "center", marginTop: 16 }}>
            {isSignup ? "Already have an account? " : "New here? "}
            <span className="link" onClick={onSwitch}>{isSignup ? "Sign in" : "Create one"}</span>
          </div>
        </Card>

        <div className="sm mut" style={{ textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          Accounts are stored in this browser for now.<br />Clearing site data will clear your sessions.
        </div>
      </div>
    </div>
  );
}
