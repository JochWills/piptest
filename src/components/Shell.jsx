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
  { id: "journal",   label: "Journal",   icon: Ic.book },
  { id: "analytics", label: "Analytics", icon: Ic.chart },
  { id: "dailypip",  label: "Daily Pip", icon: Ic.bolt },
  { id: "settings",  label: "Settings",  icon: Ic.gear },
];

/* The actual twin-lobed fire-emoji silhouette (Twemoji's 1f525.svg,
   two overlapping flame shapes — an outer body and an inner tongue —
   traced at its native 36x36 viewBox), not a CSS-shape approximation.
   Recoloured via gradients per state rather than Twemoji's flat
   two-tone orange/yellow, and given a streak number sitting in the
   lower body the way the reference did. */
const FLAME_OUTER = "M35 19c0-2.062-.367-4.039-1.04-5.868-.46 5.389-3.333 8.157-6.335 6.868-2.812-1.208-.917-5.917-.777-8.164.236-3.809-.012-8.169-6.931-11.794 2.875 5.5.333 8.917-2.333 9.125-2.958.231-5.667-2.542-4.667-7.042-3.238 2.386-3.332 6.402-2.333 9 1.042 2.708-.042 4.958-2.583 5.208-2.84.28-4.418-3.041-2.963-8.333C2.52 10.965 1 14.805 1 19c0 9.389 7.611 17 17 17s17-7.611 17-17z";
const FLAME_INNER = "M28.394 23.999c.148 3.084-2.561 4.293-4.019 3.709-2.106-.843-1.541-2.291-2.083-5.291s-2.625-5.083-5.708-6c2.25 6.333-1.247 8.667-3.08 9.084-1.872.426-3.753-.001-3.968-4.007C7.352 23.668 6 26.676 6 30c0 .368.023.73.055 1.09C9.125 34.124 13.342 36 18 36s8.875-1.876 11.945-4.91c.032-.36.055-.722.055-1.09 0-2.187-.584-4.236-1.606-6.001z";

function FlameIcon({ lit, streak, size = 19 }) {
  const g1 = lit ? "flameOuterLit" : "flameOuterGrey";
  const g2 = lit ? "flameInnerLit" : "flameInnerGrey";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <radialGradient id={g1} cx="42%" cy="28%" r="80%">
          {lit
            ? <><stop offset="0%" stopColor="#FFCB57" /><stop offset="55%" stopColor="#F5761A" /><stop offset="100%" stopColor="#C6350C" /></>
            : <><stop offset="0%" stopColor="#B7BCC4" /><stop offset="100%" stopColor="#666E79" /></>}
        </radialGradient>
        <radialGradient id={g2} cx="45%" cy="30%" r="75%">
          {lit
            ? <><stop offset="0%" stopColor="#FFF6D8" /><stop offset="100%" stopColor="#FDBA3B" /></>
            : <><stop offset="0%" stopColor="#EDEFF2" /><stop offset="100%" stopColor="#9BA1AA" /></>}
        </radialGradient>
      </defs>
      <path fill={`url(#${g1})`} d={FLAME_OUTER} />
      <path fill={`url(#${g2})`} d={FLAME_INNER} />
      <text x="17" y="29.5" textAnchor="middle" fontSize="12.5" fontWeight="800"
        fill={lit ? "#4A1D05" : "#fff"}>{streak}</text>
    </svg>
  );
}

/* The Daily Pip nav icon swaps from the plain bolt to the streak
   flame above once there's a streak to show — grey while today's
   challenge is still unplayed (the streak is real, but as of
   yesterday), full colour once today's own attempt has landed and
   the streak reflects it. `account` already carries all three fields
   straight off the server's own publicUser() (see server/auth.js). */
function DailyPipIcon({ account }) {
  const streak = account?.dailyPipStreak || 0;
  if (streak <= 0) return <Svg s={15}>{Ic.bolt}</Svg>;
  const today = new Date().toISOString().slice(0, 10); // UTC, matching the server's own utcDateKey()
  const playedToday = account?.dailyPipLastDate === today;
  return <FlameIcon lit={playedToday} streak={streak} />;
}

export default function Shell({ page, onNav, onHome, account, theme, onToggleTheme, onSignOut, children, wide }) {
  return (
    <div className="shell">
      {/* ---------- compact top bar, phones only ---------- */}
      <header className="shell-top">
        <button className="shell-topbrand" onClick={onHome} aria-label="Piptest home">
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
        <button className="shell-brand" onClick={onHome} aria-label="Piptest home">
          <Logo size={28} />
        </button>

        <nav className="shell-nav">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => onNav(n.id)}
              className={"shell-navbtn" + (page === n.id ? " on" : "")}>
              <span className="shell-navicon">
                {n.id === "dailypip" ? <DailyPipIcon account={account} /> : <Svg s={15}>{n.icon}</Svg>}
              </span>
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
                {account?.role === "admin" ? "Admin" : account?.plan === "free" ? "User" : account?.plan}
              </span>
            </span>
          </div>
          <div className="shell-footbtns">
            <a className="btn ghost" href="https://discord.gg/gsNa4Vnc9W" target="_blank" rel="noopener noreferrer" title="Join our Discord" aria-label="Join our Discord">
              <Svg s={15}>{Ic.discord}</Svg>
            </a>
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
