import React from "react";
import Logo, { LogoMark } from "./Logo.jsx";
import { Svg, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Ic.grid },
  { id: "simulator", label: "Simulator", icon: Ic.play },
  { id: "journal",   label: "Journal",   icon: Ic.book },
  { id: "analytics", label: "Analytics", icon: Ic.chart },
  { id: "settings",  label: "Settings",  icon: Ic.gear },
];

export default function Shell({ page, onNav, onHome, account, theme, onToggleTheme, onSignOut, children, wide }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside className="shell-side" style={{
        width: 216, flexShrink: 0, borderRight: "1px solid var(--border)",
        background: "var(--surface)", padding: "16px 12px",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
      }}>
        {/* the logo goes home, the way a logo does everywhere else */}
        <button onClick={onHome} title="Back to the PipTest home page"
          style={{ background: "none", border: "none", padding: "2px 6px 20px", cursor: "pointer", textAlign: "left" }}>
          <Logo size={28} />
        </button>

        <nav style={{ display: "grid", gap: 2 }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => onNav(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "9px 11px", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 13.5, fontWeight: 500, textAlign: "left",
                border: "1px solid " + (page === n.id ? "var(--border)" : "transparent"),
                background: page === n.id ? "var(--surface3)" : "transparent",
                color: page === n.id ? "var(--ink)" : "var(--muted)",
              }}>
              <span style={{ color: page === n.id ? "var(--brand)" : "inherit", display: "flex" }}>
                <Svg s={15}>{n.icon}</Svg>
              </span>
              {n.label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 4px 10px" }}>
            <Avatar value={account?.avatar} handle={account?.handle || ""} size={28} />
            <span style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {account?.name || "Guest"}
              </div>
              <div className="sm mut" style={{ fontSize: 11.5 }}>
                {account?.role === "admin" ? "Admin" : account?.plan === "free" ? "Free plan" : account?.plan}
              </div>
            </span>
          </div>
          <button className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "7px 9px", marginBottom: 6, fontSize: 12.5 }}
            onClick={onHome}>← Home page</button>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost" style={{ flex: 1, padding: "6px 8px" }} onClick={onToggleTheme}
              title="Toggle theme" aria-label="Toggle theme">
              <Svg s={15}>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
            </button>
            <button className="btn ghost" style={{ flex: 1, padding: "6px 8px" }} onClick={onSignOut}
              title="Sign out" aria-label="Sign out">
              <Svg s={15}>{Ic.logout}</Svg>
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: wide ? "none" : 1240, margin: "0 auto", padding: wide ? 0 : "24px 24px 60px" }}>
          {children}
        </div>
      </main>

      <style>{`
        @media (max-width: 860px) {
          .shell-side { position: fixed; bottom: 0; top: auto; left: 0; right: 0;
            width: 100%; height: auto; flex-direction: row; align-items: center;
            border-right: none; border-top: 1px solid var(--border); padding: 6px 8px; z-index: 90; }
          .shell-side > button:first-child, .shell-side > div:last-child { display: none; }
          .shell-side nav { display: flex; width: 100%; justify-content: space-around; }
          .shell-side nav button { flex-direction: column; gap: 3px; font-size: 10.5px; padding: 6px 4px; }
          main { padding-bottom: 66px; }
        }
      `}</style>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
      <div>
        {eyebrow && <span className="cap">{eyebrow}</span>}
        <h2 style={{ margin: eyebrow ? "6px 0 0" : 0, fontSize: 26 }}>{title}</h2>
        {sub && <p className="sm mut" style={{ marginTop: 6 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
