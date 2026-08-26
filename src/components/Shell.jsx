import React from "react";
import Logo, { LogoMark } from "./Logo.jsx";
import { Svg, Ic } from "./ui.jsx";
import Avatar from "./Avatar.jsx";

/* ============================================================
   Shell — sidebar on desktop, bottom bar on mobile

   Layout lives in CSS classes, not inline styles. An inline
   style outranks a stylesheet rule, so any layout set inline
   here could not be overridden by the mobile media query — which
   is exactly why the sidebar previously stayed a half-width
   column on a phone.
   ============================================================ */

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Ic.grid },
  { id: "simulator", label: "Simulator", icon: Ic.play },
  { id: "journal",   label: "Journal",   icon: Ic.book },
  { id: "analytics", label: "Analytics", icon: Ic.chart },
  { id: "settings",  label: "Settings",  icon: Ic.gear },
];

export default function Shell({ page, onNav, onHome, account, theme, onToggleTheme, onSignOut, children, wide }) {
  return (
    <div className="shell">
      {/* ---------- compact top bar, phones only ---------- */}
      <header className="shell-top">
        <button className="shell-topbrand" onClick={onHome} aria-label="PipTest home">
          <Logo size={26} />
        </button>
        <div className="shell-topright">
          <button className="btn ghost shell-iconbtn" onClick={onToggleTheme} aria-label="Toggle theme">
            <Svg s={16}>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
          </button>
          <button className="btn ghost shell-iconbtn" onClick={onSignOut} aria-label="Sign out">
            <Svg s={16}>{Ic.logout}</Svg>
          </button>
          <Avatar value={account?.avatar} handle={account?.handle || ""} size={28} />
        </div>
      </header>

      {/* ---------- sidebar / bottom bar ---------- */}
      <aside className="shell-side">
        <button className="shell-brand" onClick={onHome} aria-label="PipTest home">
          <Logo size={28} />
        </button>

        <nav className="shell-nav">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => onNav(n.id)}
              className={"shell-navbtn" + (page === n.id ? " on" : "")}>
              <span className="shell-navicon"><Svg s={15}>{n.icon}</Svg></span>
              <span className="shell-navlabel">{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="shell-foot">
          <div className="shell-user">
            <Avatar value={account?.avatar} handle={account?.handle || ""} size={28} />
            <span className="shell-userinfo">
              <span className="shell-username">{account?.name || "Guest"}</span>
              <span className="shell-userplan">
                {account?.role === "admin" ? "Admin" : account?.plan === "free" ? "Free plan" : account?.plan}
              </span>
            </span>
          </div>
          <button className="btn ghost shell-home" onClick={onHome}>← Home page</button>
          <div className="shell-footbtns">
            <button className="btn ghost" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
              <Svg s={15}>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
            </button>
            <button className="btn ghost" onClick={onSignOut} title="Sign out" aria-label="Sign out">
              <Svg s={15}>{Ic.logout}</Svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="shell-main">
        <div className={"shell-inner" + (wide ? " wide" : "")}>{children}</div>
      </main>
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, actions }) {
  return (
    <div className="pagehead">
      <div>
        {eyebrow && <span className="cap">{eyebrow}</span>}
        <h2 style={{ margin: eyebrow ? "6px 0 0" : 0, fontSize: 26 }}>{title}</h2>
        {sub && <p className="sm mut" style={{ marginTop: 6 }}>{sub}</p>}
      </div>
      {actions && <div className="pagehead-actions">{actions}</div>}
    </div>
  );
}
