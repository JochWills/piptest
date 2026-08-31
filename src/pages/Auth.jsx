import React, { useState } from "react";
import Logo from "../components/Logo.jsx";
import { Card, Field } from "../components/ui.jsx";
import { api, API_ENABLED } from "../lib/api.js";

/* ============================================================
   Auth — real accounts

   Validation mirrors the server's rules so mistakes are caught
   before a round trip, but the server re-checks everything: a
   client-side rule is a courtesy, never a control.
   ============================================================ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_RE = /^[a-zA-Z0-9_]{3,18}$/;

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

export default function Auth({ mode = "signup", onSignedIn, onBack, onSwitch, doLogin, doRegister }) {
  const isSignup = mode === "signup";
  const [forgot, setForgot] = useState(false);   // the "email me a link" panel
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const st = strength(password);

  const validate = () => {
    if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (isSignup) {
      if (!name.trim()) return "What should we call you?";
      if (!HANDLE_RE.test(handle.trim())) return "Handle must be 3–18 characters: letters, numbers or underscores.";
    }
    return "";
  };

  const submit = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(""); setBusy(true);
    try {
      const user = isSignup
        ? await doRegister({ email: email.trim(), password, name: name.trim(), handle: handle.trim() })
        : await doLogin({ email: email.trim(), password });
      onSignedIn(user);
    } catch (e) {
      setErr(e?.message || "Something went wrong. Try again.");
    } finally { setBusy(false); }
  };

  /* suggest a handle from the name, but let it be overridden */
  const onName = (v) => {
    setName(v);
    if (!handle || handle === suggest(name)) setHandle(suggest(v));
  };
  const suggest = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 430 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            aria-label="Back to the home page">
            <Logo size={34} />
          </button>
        </div>

        {forgot ? (
          <ForgotPanel initialEmail={email} onBack={() => setForgot(false)} />
        ) : (
        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 22, marginBottom: 6 }}>{isSignup ? "Create your account" : "Welcome back"}</h2>
          <p className="sm mut" style={{ marginBottom: 22, lineHeight: 1.6 }}>
            {isSignup
              ? "Completely free, always. Your sessions follow you to any device."
              : "Sign in to pick up where you left off."}
          </p>

          {!API_ENABLED && (
            <div style={{ background: "var(--brandSoft)", border: "1px solid var(--brand)", borderRadius: 8,
              padding: "10px 12px", marginBottom: 18, fontSize: 12.5, color: "var(--brand)", lineHeight: 1.55 }}>
              This build has no API configured, so accounts run locally in this browser only.
              Set VITE_API_URL and redeploy to enable real sign-in.
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            {isSignup && (
              <Field label="Display name">
                <input className="in" value={name} placeholder="John Doe" autoComplete="name"
                  onChange={(e) => onName(e.target.value)} />
              </Field>
            )}

            <Field label="Email">
              <input className="in" type="email" value={email} placeholder="you@example.com"
                autoComplete="email" onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()} />
            </Field>

            {isSignup && (
              <Field label="Handle" hint="How you appear to others in shared rooms.">
                <input className="in" value={handle} placeholder="john_doe" maxLength={18}
                  autoComplete="username" onChange={(e) => setHandle(e.target.value)} />
              </Field>
            )}

            <Field label="Password">
              <div style={{ display: "flex", gap: 6 }}>
                <input className="in" type={show ? "text" : "password"} value={password}
                  placeholder={isSignup ? "At least 8 characters" : ""}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
                <button className="btn" style={{ padding: "0 11px", fontSize: 12 }}
                  onClick={() => setShow((s) => !s)} type="button"
                  aria-label={show ? "Hide password" : "Show password"}>
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            {!isSignup && API_ENABLED && (
              <div style={{ textAlign: "right", marginTop: -6 }}>
                <span className="link sm" onClick={() => setForgot(true)}>Forgot your password?</span>
              </div>
            )}

            {isSignup && password.length > 0 && (
              <div>
                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i < st
                        ? (st <= 1 ? "var(--down)" : st === 2 ? "#F59E0B" : "var(--up)")
                        : "var(--surface3)",
                    }} />
                  ))}
                </div>
                <span className="sm mut" style={{ fontSize: 11.5 }}>{LABELS[st]}</span>
              </div>
            )}
          </div>

          {err && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 16, lineHeight: 1.55 }}>
              {err}
            </div>
          )}

          <button className="btn pri" style={{ width: "100%", marginTop: 18, padding: 11 }}
            disabled={busy} onClick={submit}>
            {busy ? "One moment…" : isSignup ? "Create account" : "Sign in"}
          </button>

          <div className="sm mut" style={{ textAlign: "center", marginTop: 16 }}>
            {isSignup ? "Already have an account? " : "New here? "}
            <span className="link" onClick={onSwitch}>{isSignup ? "Sign in" : "Create one"}</span>
          </div>
        </Card>
        )}

        {isSignup && (
          <p className="sm mut" style={{ textAlign: "center", marginTop: 18, lineHeight: 1.6, maxWidth: 380, margin: "18px auto 0" }}>
            By creating an account you accept that PipTest is a practice tool — simulated results
            are not a prediction of live performance.
          </p>
        )}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------
   ForgotPanel

   The confirmation reads the same whether or not the address is
   registered, because the server behaves the same way. Saying
   "no such account" would turn this into a way to discover who
   has one.
   ------------------------------------------------------------ */
function ForgotPanel({ initialEmail, onBack }) {
  const [email, setEmail] = useState(initialEmail || "");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) { setErr("Enter a valid email address."); return; }
    setErr(""); setBusy(true);
    try { await api.forgot({ email: email.trim() }); setSent(true); }
    catch (e) { setErr(e?.message || "Couldn't send that right now. Try again shortly."); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{ padding: 28 }}>
      {sent ? (
        <>
          <h2 style={{ fontSize: 21, marginBottom: 8 }}>Check your inbox</h2>
          <p className="sm mut" style={{ lineHeight: 1.7, marginBottom: 20 }}>
            If <b style={{ color: "var(--ink)" }}>{email.trim()}</b> has an account, a reset link
            is on its way. It works once and expires in an hour. Check your spam folder if it
            hasn't arrived in a couple of minutes.
          </p>
          <button className="btn" style={{ width: "100%" }} onClick={onBack}>Back to sign in</button>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 21, marginBottom: 6 }}>Reset your password</h2>
          <p className="sm mut" style={{ marginBottom: 20, lineHeight: 1.6 }}>
            Enter your email and we'll send a link to set a new one.
          </p>
          <Field label="Email">
            <input className="in" type="email" value={email} autoComplete="email"
              placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </Field>
          {err && (
            <div style={{ background: "var(--downSoft)", border: "1px solid var(--down)", color: "var(--down)",
              borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 14 }}>{err}</div>
          )}
          <button className="btn pri" style={{ width: "100%", marginTop: 18, padding: 11 }}
            disabled={busy || !email} onClick={submit}>
            {busy ? "Sending…" : "Email me a reset link"}
          </button>
          <div className="sm mut" style={{ textAlign: "center", marginTop: 16 }}>
            <span className="link" onClick={onBack}>Back to sign in</span>
          </div>
        </>
      )}
    </Card>
  );
}
