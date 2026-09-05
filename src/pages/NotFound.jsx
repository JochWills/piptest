import React from "react";
import Logo from "../components/Logo.jsx";
import { Card } from "../components/ui.jsx";

/* ============================================================
   NotFound — whatever the hash route didn't match

   Eager-loaded alongside Auth/Reset/Legal (see the import comment in
   App.jsx) rather than lazy — a bad or stale link is exactly the
   moment a loading spinner before the "nothing here" message would
   feel worst, and this is small enough that it costs nothing to keep
   in the main bundle.
   ============================================================ */

/* A little broken price line rather than a generic "404" graphic — it
   trends normally, then the data just stops mid-candle and the line
   trails off dashed, which is a more on-brand way to say "there's
   nothing charted at this address" than an icon would be. */
function BrokenChart() {
  return (
    <svg width="180" height="56" viewBox="0 0 180 56" fill="none" aria-hidden="true" style={{ margin: "0 auto 6px", display: "block" }}>
      <polyline points="4,40 24,30 44,36 64,18 84,24 100,12"
        stroke="var(--down)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="100" cy="12" r="3" fill="var(--down)" />
      <polyline points="100,12 176,12" stroke="var(--border)" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" />
    </svg>
  );
}

export default function NotFound({ account, onHome, onDashboard }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <button onClick={onHome} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 24 }}
          aria-label="Back to the home page">
          <Logo size={34} />
        </button>

        <Card style={{ padding: 34 }}>
          <BrokenChart />
          <div className="mono" style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, marginBottom: 10 }}>404</div>
          <h2 style={{ fontSize: 21, marginBottom: 10 }}>Page not found</h2>
          <p className="sm mut" style={{ lineHeight: 1.65, marginBottom: 26 }}>
            The link's either old or mistyped — whatever it pointed to isn't here.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn pri" onClick={onHome}>Back to the homepage</button>
            {account && <button className="btn" onClick={onDashboard}>Your dashboard</button>}
          </div>
        </Card>
      </div>
    </div>
  );
}
