import React from "react";

export const GLOBAL_CSS = `
/* font stylesheet moved to a real <link> in index.html's <head> — see the
   comment there. A CSS @import here only starts once this whole string
   has been injected into the DOM by React, which is much later. */

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
.btn.danger { background: var(--down); color: #fff; border-color: var(--down); font-weight: 600; }
.btn.danger:hover:not(:disabled) { filter: brightness(1.08); }

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

/* ============================================================
   App shell — sidebar on desktop, bottom bar on phones.

   Kept here rather than as inline styles so the media query can
   actually override it.
   ============================================================ */
.shell { display: flex; min-height: 100vh; }

.shell-top { display: none; }                 /* phones only */
.shell-topbrand { background: none; border: none; padding: 0; cursor: pointer; }
.shell-topright { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.shell-iconbtn { padding: 6px 8px; }

.shell-side {
  width: 216px; flex-shrink: 0;
  border-right: 1px solid var(--border); background: var(--surface);
  padding: 16px 12px; display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
.shell-brand { background: none; border: none; padding: 2px 6px 20px; cursor: pointer; text-align: left; }
.shell-nav { display: grid; gap: 2px; }
.shell-navbtn {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 11px; border-radius: 8px; cursor: pointer;
  font-family: inherit; font-size: 13.5px; font-weight: 500; text-align: left;
  border: 1px solid transparent; background: transparent; color: var(--muted);
}
.shell-navbtn:hover { background: var(--surface2); color: var(--ink); }
.shell-navbtn.on { background: var(--surface3); border-color: var(--border); color: var(--ink); }
.shell-navbtn.on .shell-navicon { color: var(--brand); }
.shell-navicon { display: flex; color: inherit; }

.shell-foot { margin-top: auto; padding-top: 14px; border-top: 1px solid var(--border); }
.shell-user { display: flex; align-items: center; gap: 9px; padding: 6px 4px 10px; }
.shell-userinfo { min-width: 0; display: block; }
.shell-username { display: block; font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-userplan { display: block; font-size: 11.5px; color: var(--muted); }
.shell-home { width: 100%; justify-content: flex-start; padding: 7px 9px; margin-bottom: 6px; font-size: 12.5px; }
.shell-footbtns { display: flex; gap: 6px; }
.shell-footbtns .btn { flex: 1; padding: 6px 8px; }

.shell-main { flex: 1; min-width: 0; }
.shell-inner { max-width: 1240px; margin: 0 auto; padding: 24px 24px 60px; }
.shell-inner.wide { max-width: none; padding: 0; }

.pagehead { display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.pagehead-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* shared utility — hide something below the mobile breakpoint. Defined
   here (global CSS, injected on every page) rather than inside whichever
   page happens to declare it locally: a page-local <style> tag is still
   a real, global <style> element once mounted (React doesn't scope it),
   so a rule defined only inside Simulator.jsx's own <style> block did
   nothing at all on any other page — it simply wasn't in the document
   while that page was showing. */
@media (max-width: 900px) {
  .hide-sm { display: none !important; }
}

@media (max-width: 860px) {
  .shell { flex-direction: column; }

  .shell-top {
    display: flex; align-items: center; gap: 10px;
    padding: 0 14px; height: 54px; flex-shrink: 0;
    background: var(--surface); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 40;
  }

  /* sidebar becomes a bottom tab bar */
  .shell-side {
    position: fixed; top: auto; bottom: 0; left: 0; right: 0;
    width: 100%; height: auto; flex-direction: row; align-items: center;
    border-right: none; border-top: 1px solid var(--border);
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom)); z-index: 60;
  }
  .shell-brand, .shell-foot { display: none; }
  .shell-nav { display: flex; width: 100%; justify-content: space-around; gap: 0; }
  .shell-navbtn {
    flex-direction: column; gap: 3px; padding: 7px 4px;
    font-size: 10.5px; text-align: center; border-radius: 10px;
  }
  .shell-navbtn.on { background: var(--brandSoft); border-color: transparent; color: var(--brand); }
  .shell-navlabel { line-height: 1; }

  /* clear of the tab bar, including the home indicator */
  .shell-inner { padding: 18px 16px calc(84px + env(safe-area-inset-bottom)); }
  .pagehead h2 { font-size: 22px; }
}

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

/* spinner — a small inline "this bit is still loading" mark, not a
   page-covering overlay. Use inside whatever element is waiting on data. */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid var(--border); border-top-color: var(--brand);
  animation: spin .7s linear infinite;
}

/* skeleton — a shimmering placeholder standing in for a value/row that
   hasn't arrived yet, so the layout it belongs to renders immediately
   instead of waiting on data before showing anything at all. */
@keyframes shine { 0% { background-position: 160% 0; } 100% { background-position: -60% 0; } }
.skel {
  display: inline-block; border-radius: 6px; color: transparent !important;
  background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%);
  background-size: 250% 100%; animation: shine 1.3s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) { .fade-in, .live, .spinner, .skel { animation: none; } }

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

export const Stat = ({ label, value, sub, tone, loading }) => (
  <div className="stat">
    <div className="cap" style={{ marginBottom: 5 }}>{label}</div>
    {loading ? (
      <span className="skel" style={{ width: 46, height: 19 }} />
    ) : (
      <div className="num" style={{
        fontSize: 19, fontWeight: 600,
        color: tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--ink)",
      }}>{value}</div>
    )}
    {sub && !loading && <div className="sm mut" style={{ marginTop: 3 }}>{sub}</div>}
  </div>
);

export const Empty = ({ title, body, action }) => (
  <div style={{ padding: "44px 24px", textAlign: "center" }}>
    <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
    {body && <div className="sm mut" style={{ maxWidth: 380, margin: "0 auto 16px", lineHeight: 1.6 }}>{body}</div>}
    {action}
  </div>
);

/* Small "still loading" pill in the corner of the screen — not a
   page-covering overlay. The app underneath renders straight away (each
   page shows its own per-section loading state), and this just tells you
   there's still an account/session fetch in flight. Disappears the moment
   it resolves. */
export function CornerLoader({ show, label = "Loading" }) {
  if (!show) return null;
  return (
    <div className="fade-in" style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 300,
      display: "flex", alignItems: "center", gap: 8,
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 999, padding: "8px 14px", boxShadow: "0 8px 26px rgba(0,0,0,.28)",
      fontSize: 12.5, color: "var(--muted)", fontWeight: 500, pointerEvents: "none",
    }}>
      <span className="spinner" />
      {label}…
    </div>
  );
}

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

/* A styled stand-in for window.confirm(). The browser's own dialog can't
   be themed or reworded per-button ("OK"/"Cancel" always, no way to make
   a destructive action visually read as destructive), and on some setups
   it's prefixed with the page's raw origin, which reads as broken chrome
   rather than part of the app. Same open/onClose shape as Modal so it
   drops in wherever a confirm() call used to be. */
export function ConfirmDialog({ open, title = "Are you sure?", body, confirmLabel = "Delete", cancelLabel = "Cancel", danger = true, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      style={{
        position: "fixed", inset: 0, zIndex: 220, background: "rgba(6,8,12,.62)",
        display: "grid", placeItems: "center", padding: 20, backdropFilter: "blur(2px)",
      }}
    >
      <div className="card fade-in" style={{ width: "100%", maxWidth: 380, padding: 20 }}>
        <h3 style={{ fontSize: 16.5, marginBottom: 8 }}>{title}</h3>
        {body && <p className="sm mut" style={{ lineHeight: 1.6, marginBottom: 18 }}>{body}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={"btn" + (danger ? " danger" : " pri")} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
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
  /* an actual gear — solid teeth, not the sun icon's thin radiating
     lines, so the two don't read as the same glyph at a glance */
  gear: <>
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(45 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(90 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(135 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(180 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(225 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(270 8 8)" />
    <rect x="7.15" y="2.1" width="1.7" height="2.2" rx=".4" fill="currentColor" transform="rotate(315 8 8)" />
    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" fill="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" />
  </>,
  target: <><circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.4" fill="none" /><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" /></>,
  logout: <path d="M6 3.2H3.4v9.6H6M9.3 5.4 11.9 8l-2.6 2.6M11.9 8H6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  chat: <path d="M2.5 3.6h11a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H7.4l-3.1 2.8V11H2.5a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.35" fill="none" strokeLinejoin="round" strokeLinecap="round" />,
  /* four corner brackets pointing outward/inward — enter/exit fullscreen */
  expand: <path d="M6 2H2v4M10 2h4v4M14 10v4h-4M2 10v4h4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  collapse: <path d="M2 6h4V2M14 6h-4V2M14 10h-4v4M2 10h4v4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
};

export const Svg = ({ children, s = 16, style }) => (
  <svg width={s} height={s} viewBox="0 0 16 16" fill="none" style={style} aria-hidden="true">{children}</svg>
);
