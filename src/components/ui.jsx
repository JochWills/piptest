import React from "react";

export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; }

.pt {
  background: var(--bg); color: var(--ink);
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 14px; min-height: 100%;
  -webkit-font-smoothing: antialiased;
  transition: background .18s ease, color .18s ease;
}
.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.num  { font-variant-numeric: tabular-nums; }

h1,h2,h3,h4 { margin: 0; letter-spacing: -0.022em; font-weight: 700; }
h1 { font-size: 44px; line-height: 1.08; }
h2 { font-size: 30px; line-height: 1.15; }
h3 { font-size: 20px; }
p  { margin: 0; }
a  { color: inherit; text-decoration: none; }

.cap { font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.sm  { font-size: 12.5px; }
.mut { color: var(--muted); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }

.btn {
  font-family: inherit; font-size: 13.5px; font-weight: 500;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 8px 14px; cursor: pointer; white-space: nowrap;
  transition: background .13s, border-color .13s, color .13s, opacity .13s;
}
.btn:hover:not(:disabled) { background: var(--surface3); }
.btn:disabled { opacity: .4; cursor: not-allowed; }
.btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.btn.pri { background: var(--brand); color: var(--brandInk); border-color: var(--brand); font-weight: 600; }
.btn.pri:hover:not(:disabled) { background: var(--brandHover); border-color: var(--brandHover); }
.btn.ghost { background: transparent; border-color: transparent; color: var(--muted); }
.btn.ghost:hover:not(:disabled) { background: var(--surface3); color: var(--ink); }
.btn.outline { background: transparent; border-color: var(--borderStrong); }
.btn.lg { padding: 12px 22px; font-size: 15px; border-radius: 10px; }
.btn.buy  { color: var(--up);   border-color: color-mix(in srgb, var(--up) 40%, transparent);   background: var(--upSoft); font-weight: 600; }
.btn.sell { color: var(--down); border-color: color-mix(in srgb, var(--down) 40%, transparent); background: var(--downSoft); font-weight: 600; }
.btn.on { background: var(--brand); color: var(--brandInk); border-color: var(--brand); }

.in {
  font-family: inherit; font-size: 13.5px; width: 100%;
  background: var(--bg2); color: var(--ink);
  border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px;
  font-variant-numeric: tabular-nums;
}
.in:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brandSoft); }
.in::placeholder { color: var(--dim); }
textarea.in { resize: vertical; line-height: 1.65; font-family: inherit; }

.pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; display: inline-block; }
.pill.b { background: var(--brandSoft); color: var(--brand); }
.pill.g { background: var(--upSoft);    color: var(--up); }
.pill.r { background: var(--downSoft);  color: var(--down); }
.pill.n { background: var(--surface3);  color: var(--muted); }

.tab { font-family: inherit; font-size: 13.5px; font-weight: 500; padding: 9px 13px;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--muted); cursor: pointer; }
.tab:hover { color: var(--ink); }
.tab.on { color: var(--brand); border-bottom-color: var(--brand); }

.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; font-weight: 500; color: var(--muted); font-size: 12px;
  padding: 9px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.tbl td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tbody tr:hover { background: var(--surface2); }

.scroll::-webkit-scrollbar { width: 9px; height: 9px; }
.scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; }
.scroll::-webkit-scrollbar-track { background: transparent; }

.grid-stats { display: grid; gap: 1px; background: var(--border);
  border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.stat { background: var(--surface); padding: 13px 15px; }

/* Wordmark: both variants ship, CSS picks the one that suits the theme.
   Keyed off data-theme rather than a prop so every logo everywhere follows
   the theme with no plumbing and no swap flicker. */
.wm { user-select: none; display: block; }
.wm-dark { display: none; }
[data-theme="dark"] .wm-light { display: none; }
[data-theme="dark"] .wm-dark  { display: block; }

.link { color: var(--brand); cursor: pointer; }
.link:hover { text-decoration: underline; }

.sep { height: 1px; background: var(--border); }
.vsep { width: 1px; align-self: stretch; background: var(--border); margin: 0 6px; }

.fade-in { animation: fade .3s ease both; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.live { animation: pulse 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .fade-in, .live { animation: none; } }

@media (max-width: 720px) { h1 { font-size: 32px; } h2 { font-size: 24px; } }
`;

export const Card = ({ children, style, className = "", ...r }) => (
  <div className={`card ${className}`} style={style} {...r}>{children}</div>
);

export const Field = ({ label, hint, children }) => (
  <label style={{ display: "block" }}>
    <span className="cap" style={{ display: "block", marginBottom: 6 }}>{label}</span>
    {children}
    {hint && <span className="sm mut" style={{ display: "block", marginTop: 5 }}>{hint}</span>}
  </label>
);

export const Stat = ({ label, value, sub, tone }) => (
  <div className="stat">
    <div className="cap" style={{ marginBottom: 5 }}>{label}</div>
    <div className="num" style={{
      fontSize: 19, fontWeight: 600,
      color: tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--ink)",
    }}>{value}</div>
    {sub && <div className="sm mut" style={{ marginTop: 3 }}>{sub}</div>}
  </div>
);

export const Empty = ({ title, body, action }) => (
  <div style={{ padding: "44px 24px", textAlign: "center" }}>
    <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
    {body && <div className="sm mut" style={{ maxWidth: 380, margin: "0 auto 16px", lineHeight: 1.6 }}>{body}</div>}
    {action}
  </div>
);

export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,8,12,.62)",
        display: "grid", placeItems: "center", padding: 20, backdropFilter: "blur(2px)",
      }}
    >
      <div className="card fade-in" style={{ width: "100%", maxWidth: width, maxHeight: "88vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close" style={{ padding: "4px 9px" }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

export const Ic = {
  play: <path d="M5 3.2l9 4.8-9 4.8z" fill="currentColor" />,
  pause: <><rect x="4.4" y="3.2" width="2.7" height="9.6" rx=".7" fill="currentColor" /><rect x="8.9" y="3.2" width="2.7" height="9.6" rx=".7" fill="currentColor" /></>,
  start: <><rect x="3.2" y="3.2" width="1.7" height="9.6" fill="currentColor" /><path d="M13 3.2 6.2 8 13 12.8z" fill="currentColor" /></>,
  back: <><rect x="3.2" y="3.2" width="1.7" height="9.6" fill="currentColor" /><path d="M12.6 4.3 7.4 8l5.2 3.7z" fill="currentColor" /></>,
  fwd: <><rect x="11.1" y="3.2" width="1.7" height="9.6" fill="currentColor" /><path d="M3.4 4.3 8.6 8l-5.2 3.7z" fill="currentColor" /></>,
  sun: <><circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M8 1.3v1.7M8 13v1.7M1.3 8H3M13 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  moon: <path d="M13.3 9.9A6 6 0 0 1 6.1 2.7a6 6 0 1 0 7.2 7.2z" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />,
  users: <><circle cx="6" cy="5.8" r="2.4" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M1.7 13.6c0-2.4 1.9-3.9 4.3-3.9s4.3 1.5 4.3 3.9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /><path d="M11 4a2.2 2.2 0 0 1 0 4.3M12.1 13.6c0-1.7-.6-2.9-1.6-3.6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>,
  plus: <path d="M8 3.3v9.4M3.3 8h9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  chev: <path d="M4 6.3 8 10l4-3.7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  search: <><circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M10.2 10.2 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  undo: <path d="M5.6 4.4 3 7l2.6 2.6M3 7h6.2a3.6 3.6 0 0 1 0 7.2H6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  redo: <path d="M10.4 4.4 13 7l-2.6 2.6M13 7H6.8a3.6 3.6 0 0 0 0 7.2H10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  trash: <path d="M3 4.4h10M6.2 4.4V3h3.6v1.4M4.4 4.4l.7 9.2h5.8l.7-9.2" stroke="currentColor" strokeWidth="1.35" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  check: <path d="M3 8.3 6.4 11.7 13 5" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  bolt: <path d="M9 1.5 3.5 9.2H7.4L6.8 14.5 12.5 6.6H8.6z" fill="currentColor" />,
  grid: <><rect x="2.4" y="2.4" width="4.7" height="4.7" rx="1.1" stroke="currentColor" strokeWidth="1.4" fill="none" /><rect x="8.9" y="2.4" width="4.7" height="4.7" rx="1.1" stroke="currentColor" strokeWidth="1.4" fill="none" /><rect x="2.4" y="8.9" width="4.7" height="4.7" rx="1.1" stroke="currentColor" strokeWidth="1.4" fill="none" /><rect x="8.9" y="8.9" width="4.7" height="4.7" rx="1.1" stroke="currentColor" strokeWidth="1.4" fill="none" /></>,
  book: <path d="M3 3.2h4.2c1 0 1.8.8 1.8 1.8v8c0-.8-.7-1.4-1.5-1.4H3zM13 3.2H8.8c-1 0-1.8.8-1.8 1.8v8c0-.8.7-1.4 1.5-1.4H13z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />,
  chart: <path d="M2.5 13.5V9M6.2 13.5V4M9.8 13.5V7M13.5 13.5V2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  gear: <><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8 3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>,
  target: <><circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.4" fill="none" /><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" /></>,
  logout: <path d="M6 3.2H3.4v9.6H6M9.3 5.4 11.9 8l-2.6 2.6M11.9 8H6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
};

export const Svg = ({ children, s = 16, style }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={style} aria-hidden="true">{children}</svg>
);
