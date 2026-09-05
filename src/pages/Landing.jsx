import React, { useState, useEffect, useMemo, useRef } from "react";
import Logo, { LogoMark } from "../components/Logo.jsx";
import { Card, Field, Svg, Ic } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";
import FloatingBar from "../components/FloatingBar.jsx";
import { SYMBOLS, INTERVALS } from "../theme.js";

/* ============================================================
   Landing — the page that has to earn the signup
   ============================================================ */

const FEATURES = [
  { icon: Ic.play, title: "Replay any market, bar by bar",
    body: "Load a real historical session and step through it candle by candle. The next bar is hidden until you commit — no hindsight, no peeking." },
  { icon: Ic.users, title: "Trade the same chart together",
    body: "Host a session and share a code. Your playback, drawings and levels stay in sync for everyone watching. Give a friend edit access, or keep them read-only." },
  { icon: Ic.target, title: "Sized off your stop, scored in R",
    body: "Set a stop and a risk percentage; position size is derived for you. Every trade is recorded as a multiple of risk, so results compare across instruments and account sizes." },
  { icon: Ic.chart, title: "Analytics that answer real questions",
    body: "Win rate by session, by day, by market. R-distribution, expectancy, drawdown and streaks. Find out which setup is actually carrying your account." },
  { icon: Ic.bolt, title: "Prop-firm challenge mode",
    body: "Run a session under daily-loss, max-drawdown and profit-target rules. Breach one and the challenge fails, exactly as it would with real capital." },
  { icon: Ic.book, title: "A journal that fills itself",
    body: "Every fill is logged with entry, stop, target, R and reason for exit. Add notes while the setup is fresh, then review the whole book later." },
];

const FAQ = [
  { q: "Is the data real?", a: "Yes — historical candles come straight from Binance's public market data, down to one-second bars. If the feed is ever unreachable, Piptest says so plainly rather than quietly substituting anything." },
  { q: "Do I need to install anything?", a: "No. Piptest runs in the browser. Your sessions, trades and drawings are saved automatically." },
  { q: "How is this different from a demo account?", a: "A demo account moves in real time — a week of price action takes a week. Piptest compresses that into an afternoon, and lets you replay the same session as many times as you like." },
  { q: "Can I share a session with my trading group?", a: "That's the point. Start a room, share the six-character code, and everyone watches your chart live. You control who can draw on it." },
  { q: "What about forex?", a: "Crypto is live today. Forex is next — the data pipeline is the only piece outstanding, since free tick-level FX history needs its own ingest." },
  { q: "Does it cost anything?", a: "No — Piptest is completely free, with no paid plans or card required. Everything you build stays yours." },
];

export default function Landing({ onGetStarted, onSignIn, theme, onToggleTheme, T, account, onSignOut, onNav, booting }) {
  const [openFaq, setOpenFaq] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const away = (e) => { if (!e.target.closest?.("[data-menu]")) setMenu(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  /* The app routes on the hash, so an <a href="#features"> would be read as a
     route and bounce you to the dashboard. Scroll to the section directly and
     leave the hash alone. */
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const NavLink = ({ to, children, className = "sm mut" }) => (
    <a href={`#${to}`} onClick={scrollTo(to)} className={className} style={{ cursor: "pointer" }}>{children}</a>
  );

  return (
    <div>
      {/* ---------- nav ---------- */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--bg) 88%, transparent)",
        backdropFilter: "blur(10px)", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px", height: 64,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22, minWidth: 0 }}>
            <Logo size={30} />
            <nav style={{ display: "flex", gap: 20 }} className="hide-sm">
              <NavLink to="features">Features</NavLink>
              <NavLink to="how">How it works</NavLink>
              <NavLink to="faq">FAQ</NavLink>
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn ghost" onClick={onToggleTheme} aria-label="Toggle theme" style={{ padding: "6px 9px" }}>
              <Svg>{theme === "dark" ? Ic.sun : Ic.moon}</Svg>
            </button>

            {booting ? (
              /* still resolving the silent-refresh — we don't yet know if
                 there's an account, so don't commit to either the signed-in
                 or signed-out header (a wrong guess flashes and flips a
                 moment later). A neutral placeholder instead. */
              <span className="skel" style={{ width: 86, height: 32, borderRadius: 999 }} />
            ) : account ? (
              <>
                {/* redundant with "Dashboard" at the top of the account
                    menu right next to it, so it's the one to drop for
                    space on mobile rather than shrinking the wordmark or
                    wrapping the row */}
                <button className="btn pri hide-sm" onClick={() => onNav("dashboard")}>Dashboard</button>
                <span data-menu style={{ position: "relative" }}>
                  <button onClick={() => setMenu((m) => !m)} aria-label="Account menu"
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                      background: "transparent", border: "1px solid var(--border)", borderRadius: 999,
                      padding: "4px 10px 4px 4px", fontFamily: "inherit", color: "var(--ink)" }}>
                    <Avatar value={account.avatar} handle={account.handle} size={26} />
                    <span className="sm hide-sm" style={{ fontWeight: 600, maxWidth: 110, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name || account.handle}</span>
                    <Svg s={13} style={{ color: "var(--muted)" }}>{Ic.chev}</Svg>
                  </button>

                  {menu && (
                    <div className="card" data-menu style={{ position: "absolute", right: 0, top: 46, zIndex: 60, width: 232, padding: 6 }}>
                      <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{account.name || account.handle}</div>
                        <div className="sm mut" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {account.email || "@" + account.handle}
                        </div>
                      </div>
                      {[["dashboard", "Dashboard"], ["journal", "Journal"],
                        ["analytics", "Analytics"], ["settings", "Settings"]].map(([id, label]) => (
                        <button key={id} className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px" }}
                          onClick={() => { setMenu(false); onNav(id); }}>{label}</button>
                      ))}
                      <div style={{ height: 1, background: "var(--border)", margin: "6px 0" }} />
                      <button className="btn ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "8px 10px", color: "var(--down)" }}
                        onClick={() => { setMenu(false); onSignOut(); }}>Sign out</button>
                    </div>
                  )}
                </span>
              </>
            ) : (
              <>
                <button className="btn" onClick={onSignIn}>Sign in</button>
                <button className="btn pri" onClick={onGetStarted}>Start free</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section style={{ background: T.heroGlow, borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "76px 20px 68px", textAlign: "center" }}>
          {/* sized/styled up from the shared .pill default (11px, no
              border) — that's right for a small inline badge elsewhere,
              but this is the hero's own eyebrow line: bigger with a
              visible border so it reads as a standalone banner. */}
          <span className="pill b" style={{
            marginBottom: 20, display: "inline-block", fontSize: 13, fontWeight: 600,
            padding: "8px 18px", border: "1px solid color-mix(in srgb, var(--brand) 45%, transparent)",
          }}>
            Shared Live Sessions
          </span>
          <h1 style={{ maxWidth: 760, margin: "0 auto 18px" }}>
            {/* a plain space between "Completely" and "Free" lets a narrow
                mobile width wrap the line right between them, stranding
                "Free" alone — a non-breaking space keeps that pair as one
                unit, so it either fits on the line together or the whole
                pair wraps down together. */}
            Replay the markets.<br />Together. Completely&nbsp;Free.
          </h1>
          <p className="mut" style={{ maxWidth: 580, margin: "0 auto 30px", fontSize: 17, lineHeight: 1.65 }}>
            Piptest replays real historical markets bar by bar so you can practise your setups
            hundreds of times without risking a cent — alone, or on the same chart as your trading group.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <button className="btn pri lg" onClick={onGetStarted}>
              {account ? "Go to your dashboard" : "Start practising free"}
            </button>
            <a href="#how" onClick={scrollTo("how")} className="btn outline lg">See how it works</a>
          </div>
          <div className="sm mut">
            {account ? `Signed in as @${account.handle}` : "No card required · Completely free, always"}
          </div>

          <div style={{ marginTop: 48 }}>
            <MockScreen T={T} />
          </div>
        </div>
      </section>

      {/* ---------- social proof strip ---------- */}
      <section style={{ borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 20px",
          display: "flex", gap: 40, justifyContent: "center", flexWrap: "wrap" }}>
          {/* pulled straight from the actual symbol/interval lists rather
              than hand-typed, so this can't quietly drift out of date again
              as markets get added (it already had — this used to say
              "10 · Crypto markets" from before forex/index ETFs were added,
              undercounting the real total by half). */}
          {[[INTERVALS[0].label, "Smallest candle"], [String(SYMBOLS.length), "Markets"],
            [INTERVALS[INTERVALS.length - 1].label, "Biggest replay jump"], ["∞", "Repeat attempts"]].map(([v, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
              <div className="cap" style={{ marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section id="features" style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <span className="cap">Features</span>
          <h2 style={{ margin: "10px 0 12px" }}>Everything a replay session should have</h2>
          <p className="mut" style={{ maxWidth: 540, margin: "0 auto", fontSize: 15.5, lineHeight: 1.65 }}>
            Built by someone who got tired of scrolling charts back manually and pretending not to see the next candle.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
          {FEATURES.map((f) => (
            <Card key={f.title} style={{ padding: 22 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brandSoft)",
                color: "var(--brand)", display: "grid", placeItems: "center", marginBottom: 14 }}>
                <Svg s={18}>{f.icon}</Svg>
              </div>
              <h3 style={{ fontSize: 16.5, marginBottom: 8 }}>{f.title}</h3>
              <p className="mut" style={{ fontSize: 14, lineHeight: 1.65 }}>{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "72px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <span className="cap">How it works</span>
            <h2 style={{ margin: "10px 0" }}>Four steps, then repeat until it's automatic</h2>
          </div>
          <HowItWorksMovie />
        </div>
      </section>

      {/* ---------- faq ---------- */}
      <section id="faq" style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "72px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <span className="cap">FAQ</span>
            <h2 style={{ margin: "10px 0" }}>Questions worth asking</h2>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {FAQ.map((f, i) => (
              <Card key={f.q} style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  style={{ width: "100%", textAlign: "left", background: "none", border: "none",
                    padding: "16px 18px", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit",
                    fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span style={{ flex: 1 }}>{f.q}</span>
                  <Svg s={15} style={{ transform: openFaq === i ? "rotate(180deg)" : "none", transition: "transform .16s", color: "var(--muted)" }}>{Ic.chev}</Svg>
                </button>
                {openFaq === i && (
                  <div className="mut" style={{ padding: "0 18px 16px", fontSize: 14, lineHeight: 1.7 }}>{f.a}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- cta ---------- */}
      <section style={{ background: T.heroGlow, borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "76px 20px", textAlign: "center" }}>
          <LogoMark size={46} />
          <h2 style={{ margin: "20px 0 12px" }}>The market already happened.<br />You may as well practise on it.</h2>
          <p className="mut" style={{ marginBottom: 26, fontSize: 15.5 }}>
            {account ? "Your sessions are waiting." : "Free to use, and your first session takes about a minute to set up."}
          </p>
          <button className="btn pri lg" onClick={onGetStarted}>
            {account ? "Back to your dashboard" : "Create your first session"}
          </button>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer style={{ borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "34px 20px",
          display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <Logo size={26} />
          <span className="sm mut">© {new Date().getFullYear()} Piptest</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18 }} className="sm mut">
            <NavLink to="features">Features</NavLink>
            <NavLink to="faq">FAQ</NavLink>
            <a onClick={() => onNav("privacy")} className="sm mut" style={{ cursor: "pointer" }}>Privacy</a>
            <a onClick={() => onNav("terms")} className="sm mut" style={{ cursor: "pointer" }}>Terms</a>
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 30px" }}>
          <p className="sm mut" style={{ lineHeight: 1.7, maxWidth: 780 }}>
            Piptest is a practice and education tool. Simulated results are not a prediction of live
            performance — replayed markets have no slippage, no spread and no emotional cost. Nothing
            here is financial advice.
          </p>
        </div>
      </footer>

      <style>{`
        @media (max-width: 820px) { .hide-sm { display: none !important; } }
        .how-caret { display: inline-block; width: 1px; height: 14px; margin-left: 2px;
          background: var(--ink); animation: howBlink 1s step-end infinite; }
        @keyframes howBlink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

/* ---------- how-it-works movie ----------
   The hero mock below already carries the full-fidelity "replay in
   action" demo (60fps candle growth, the real FloatingBar). This one
   has a different job: walk through the four numbered steps below it
   one at a time, plus a fifth beat the numbered list doesn't cover at
   all — sharing a room — so "how it works" actually shows the whole
   loop rather than just describing three of its four steps in prose
   next to a chart that only ever demonstrates "press play".

   Four self-contained scenes in one crossfading frame, each a small
   faithful recreation of the real UI (the asset search, the order
   ticket, the room panel) rather than a screenshot — screenshots go
   stale the moment a page's copy or layout changes; a live recreation
   using the app's own tokens/components doesn't. Each scene remounts
   (via the `i === scene &&` gate below) every time it becomes active,
   which is what lets its own local timers/typing-effect restart from
   scratch on every loop rather than just running once. */
const MOVIE_SCENES = [
  { key: "market", label: "01", title: "Pick a market and a date",
    body: "Search any of the ten pairs, then choose a start date — or let it drop you somewhere random." },
  { key: "setup", label: "02", title: "Arm your setup",
    body: "Direction, entry, stop, target, risk percent. Piptest works out the position size for you." },
  { key: "play", label: "03", title: "Press play",
    body: "Watch it fill, or not — stops and targets are checked against every bar." },
  { key: "share", label: "＋", title: "Share it live",
    body: "Send a 6-character room code. Whoever joins watches your chart update in real time." },
];
const MOVIE_SCENE_MS = 4400;

function useAfter(ms, active = true) {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setV(true), ms);
    return () => clearTimeout(t);
  }, [ms, active]);
  return v;
}

/* An actual pointer-arrow glyph, not a plain dot — its hotspot (the
   point a real cursor "clicks" from) is the tip at the shape's own
   top-left corner, so every scene below positions this by that
   corner, not by centering a circle the way a generic "tap here"
   indicator would. */
function CursorGlyph({ visible, top, left, right, hit, transitionMs = 450 }) {
  return (
    <div aria-hidden style={{
      position: "absolute", top, left, right, zIndex: 5,
      opacity: visible ? 1 : 0, transform: `scale(${hit ? 0.85 : 1})`,
      transition: `top ${transitionMs}ms ease, left ${transitionMs}ms ease, right ${transitionMs}ms ease, opacity .25s ease, transform .15s ease`,
      filter: "drop-shadow(0 1px 3px rgba(0,0,0,.55))",
    }}>
      <svg width="18" height="18" viewBox="0 0 20 20">
        <path d="M2.2 1.6 L2.2 16.3 L6.3 12.6 L9.1 18.2 L11.5 17.1 L8.7 11.3 L14.6 11.3 Z"
          fill="#fff" stroke="#0b0d11" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function HowItWorksMovie() {
  const [scene, setScene] = useState(0);
  /* Nothing here runs — no scene timers, no MarketScene typing effect,
     no play-scene cursor — until this has actually scrolled into view
     once. Without this, everything below started ticking the instant
     Landing mounted, so by the time someone actually scrolled down to
     it they'd land mid-loop rather than at the beginning, and the
     section would have been silently animating off-screen the whole
     time for nothing. */
  const [started, setStarted] = useState(false);
  const wrapRef = useRef(null);
  const timerRef = useRef(null);

  const restart = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setScene((s) => (s + 1) % MOVIE_SCENES.length), MOVIE_SCENE_MS);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setStarted(true); restart(); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setStarted(true);
      restart();
      io.disconnect(); // once is enough — it keeps looping from here on its own
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); clearInterval(timerRef.current); };
  }, []); // eslint-disable-line

  const goTo = (i) => { setScene(i); if (started) restart(); };
  const active = MOVIE_SCENES[scene];

  return (
    <div ref={wrapRef} style={{ maxWidth: 720, margin: "0 auto 46px" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}
        onMouseEnter={() => clearInterval(timerRef.current)} onMouseLeave={() => started && restart()}>
        {/* Landscape frame, but each scene's own content is untouched —
           still the same fixed-width column and the same height it
           already needed (the pre-arm setup form is the tallest one),
           just centred in the wider box now instead of the box being
           sized to it. */}
        <div style={{ position: "relative", height: 460, background: "var(--surface)" }}>
          {MOVIE_SCENES.map((s, i) => (
            <div key={s.key} style={{
              position: "absolute", inset: 0, padding: 22,
              display: "flex", justifyContent: "center",
              opacity: i === scene ? 1 : 0,
              transform: i === scene ? "translateY(0)" : "translateY(5px)",
              transition: "opacity .45s ease, transform .45s ease",
              pointerEvents: "none",
            }}>
              <div style={{ width: 340, flexShrink: 0 }}>
                {i === scene && started && <SceneContent sceneKey={s.key} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: 18, flexWrap: "wrap" }}>
        <div>
          <div className="mono" style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 600, marginBottom: 4 }}>{active.label}</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{active.title}</div>
          <div className="sm mut" style={{ marginTop: 3, maxWidth: 420 }}>{active.body}</div>
        </div>
        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
          {MOVIE_SCENES.map((s, i) => (
            <button key={s.key} onClick={() => goTo(i)} aria-label={`Show: ${s.title}`} title={s.title}
              style={{ width: 8, height: 8, borderRadius: 4, border: "none", cursor: "pointer", padding: 0,
                background: i === scene ? "var(--brand)" : "var(--surface3)", transition: "background .2s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneContent({ sceneKey }) {
  if (sceneKey === "market") return <MarketScene />;
  if (sceneKey === "setup") return <SetupScene />;
  if (sceneKey === "play") return <PlayScene />;
  return <ShareScene />;
}

/* Types "BTC/USDT" into the real search-box markup from the New Session
   modal's asset picker, then highlights it in a results list styled the
   same way and fades a start-date row in underneath — the search step
   has no single obvious "click" the way a button does, so a typing
   effect stands in for "something is actively happening" here instead
   of a travelling cursor. */
function MarketScene() {
  const FULL = "BTC/USDT";
  const [typed, setTyped] = useState("");
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++; setTyped(FULL.slice(0, i));
      if (i >= FULL.length) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, []);
  const picked = typed === FULL;
  const dateShown = useAfter(1250, picked);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="cap">Market</div>
      <div className="in" style={{ display: "flex", alignItems: "center", color: typed ? "var(--ink)" : "var(--dim)" }}>
        {typed || "Type to search for assets"}<span className="how-caret" />
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px",
          borderRadius: 7, fontSize: 12.5, transition: "background .3s, border-color .3s",
          background: picked ? "var(--brandSoft)" : "transparent",
          border: `1px solid ${picked ? "var(--brand)" : "var(--border)"}` }}>
          <span style={{ fontWeight: 600 }}>BTC/USDT</span><span className="sm mut">Binance</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px",
          borderRadius: 7, fontSize: 12.5, border: "1px solid var(--border)", opacity: .5 }}>
          <span style={{ fontWeight: 600 }}>EUR/USD</span><span className="sm mut">TwelveData</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginTop: 4,
        opacity: dateShown ? 1 : 0, transform: dateShown ? "translateY(0)" : "translateY(4px)", transition: "opacity .35s, transform .35s" }}>
        <Svg s={13} style={{ color: "var(--muted)" }}>{Ic.chart}</Svg>
        <span className="mut">Starting</span><span style={{ fontWeight: 600 }}>13 Mar '25 · 10:00 UTC</span>
      </div>
    </div>
  );
}

/* The real "Setup" ticket, both of its states — the pre-arm form (same
   Field rows, same R:R/Position size line, same Arm setup button as
   Simulator.jsx's sim-right panel) and, once the cursor clicks it, the
   actual OpenTicket layout it swaps to (pill header, Entry/Stop/Take
   profit/Size/Risk/R:R rows) — rather than just relabelling one button
   the way a mockup would. */
function SetupScene() {
  const rowsIn = useAfter(150);
  const cursorIn = useAfter(1900);
  const hit = useAfter(2550);
  const armed = useAfter(2700);
  const cursorOut = useAfter(2950);

  return (
    <div>
      <div className="cap" style={{ marginBottom: 12 }}>Setup</div>
      {!armed ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <div className="btn buy" style={{ flex: 1, justifyContent: "center" }}>Long</div>
            <div className="btn" style={{ flex: 1, justifyContent: "center" }}>Short</div>
          </div>
          <div style={{ display: "grid", gap: 9, opacity: rowsIn ? 1 : 0, transform: rowsIn ? "translateY(0)" : "translateY(4px)",
            transition: "opacity .3s ease, transform .3s ease" }}>
            <Field label="Entry"><div className="in" style={{ display: "flex", alignItems: "center" }}>83,300.00</div></Field>
            <Field label="Stop loss"><div className="in" style={{ display: "flex", alignItems: "center" }}>82,750.00</div></Field>
            <Field label="Take profit"><div className="in" style={{ display: "flex", alignItems: "center" }}>84,400.00</div></Field>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 8,
            borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <span className="mut">R:R</span><span className="num" style={{ fontWeight: 600 }}>2.10</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 13,
            borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
            <span className="mut">Position size</span><span className="num" style={{ fontWeight: 600 }}>0.0182 ($1,516)</span>
          </div>
          <div style={{ position: "relative" }}>
            <div className="btn pri" style={{ width: "100%", padding: 10, justifyContent: "center" }}>
              <Svg s={14}>{Ic.plus}</Svg>Arm setup
            </div>
            <CursorGlyph visible={cursorIn && !cursorOut} hit={hit} top={cursorIn ? 15 : -30} right={cursorIn ? 44 : 10} />
          </div>
        </>
      ) : (
        <div className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span className="pill g">Long</span><span className="pill n">Watching</span>
          </div>
          {[["Entry", "83,300.00"], ["Stop loss", "82,750.00"], ["Take profit", "84,400.00"],
            ["Size", "0.0182"], ["Risk", "1.0% · $100.00"], ["R:R", "2.10"]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0",
              borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              <span className="mut">{l}</span><span className="num" style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Real OHLC candles (wick + body, same SVG shape the hero mock and the
   actual chart both draw) rather than flat bars, with the actual
   FloatingBar component floating over them — same children markup as
   the real replay transport in Simulator.jsx (status dot, Play/pause,
   step-forward, interval, clock) — and the cursor clicks its real Play
   button, not a stand-in circle. A couple more candles grow in once
   it's pressed, and the clock steps forward. */
function PlayScene() {
  const [barPos, setBarPos] = useState({ x: 6, y: 8 });
  const cursorIn = useAfter(700);
  const hit = useAfter(1350);
  const playing = useAfter(1450);
  const cursorOut = useAfter(1750);
  const clock2 = useAfter(2400, playing);
  const clock3 = useAfter(3400, playing);

  const bars = [
    { o: 10, h: 14, l: 9, c: 13 }, { o: 13, h: 15, l: 11, c: 11.5 }, { o: 11.5, h: 13, l: 9, c: 12.5 },
    { o: 12.5, h: 18, l: 12, c: 17 }, { o: 17, h: 19, l: 15, c: 15.5 }, { o: 15.5, h: 22, l: 15, c: 21 },
    { o: 21, h: 23, l: 19, c: 20 },
  ];
  const extra = [{ o: 20, h: 25, l: 19.5, c: 24.5 }, { o: 24.5, h: 26, l: 22, c: 23 }];
  const lo = 8, hi = 27, H = 150, bw = 16, gap = 7;
  const y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const xAt = (i) => i * (bw + gap) + bw / 2;
  const all = [...bars, ...extra];
  const W = all.length * (bw + gap);
  const clock = clock3 ? "11:30" : clock2 ? "11:00" : "10:30";

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="var(--border)" strokeWidth="1" opacity=".6" />
        ))}
        {bars.map((b, i) => {
          const col = b.c >= b.o ? "var(--up)" : "var(--down)", x = xAt(i);
          return (
            <g key={i}>
              <line x1={x} y1={y(b.h)} x2={x} y2={y(b.l)} stroke={col} strokeWidth="1.6" />
              <rect x={x - bw * 0.32} y={Math.min(y(b.o), y(b.c))} width={bw * 0.64} height={Math.max(1.5, Math.abs(y(b.c) - y(b.o)))} fill={col} />
            </g>
          );
        })}
        {extra.map((b, i) => {
          const col = b.c >= b.o ? "var(--up)" : "var(--down)", x = xAt(bars.length + i);
          return (
            <g key={"e" + i} style={{ opacity: playing ? 1 : 0, transition: `opacity .4s ease ${i * 0.35 + 0.1}s` }}>
              <line x1={x} y1={y(b.h)} x2={x} y2={y(b.l)} stroke={col} strokeWidth="1.6" />
              <rect x={x - bw * 0.32} y={Math.min(y(b.o), y(b.c))} width={bw * 0.64} height={Math.max(1.5, Math.abs(y(b.c) - y(b.o)))} fill={col} />
            </g>
          );
        })}
      </svg>

      <FloatingBar pos={barPos} onPos={setBarPos} collapsed={false} onToggleCollapse={() => {}}
        minWidth={230} fitContent label="Replay">
        <div style={{ padding: "6px 9px", display: "flex", alignItems: "center", gap: 7 }}>
          <span className={playing ? "live" : ""} title={playing ? "Playing" : "Paused"}
            style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: playing ? "var(--up)" : "var(--dim)" }} />
          <div style={{ position: "relative", display: "flex", gap: 1, flexShrink: 0 }}>
            <button className="btn pri" tabIndex={-1} style={{ padding: "4px 11px" }}>
              <Svg s={13}>{playing ? Ic.pause : Ic.play}</Svg>
            </button>
            <CursorGlyph visible={cursorIn && !cursorOut} hit={hit} top={cursorIn ? 7 : -20} left={cursorIn ? 9 : -8} />
            <button className="btn ghost" tabIndex={-1} style={{ padding: "4px 7px" }}><Svg s={13}>{Ic.fwd}</Svg></button>
          </div>
          <select className="in" disabled defaultValue="1m" style={{ width: 54, padding: "4px 6px", fontSize: 12.5, flexShrink: 0 }}>
            <option value="1m">1m</option>
          </select>
          <span className="num" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{clock}</span>
        </div>
      </FloatingBar>
    </div>
  );
}

/* The real RoomPanel, field for field — the code block ("hosted by",
   live dot), the host's Close room button, the Participants list with
   real Avatar discs and the same host/viewer pills, down to the
   closing view-only line. A second participant (jason) fades into the
   list a beat later, demonstrating the one thing the other three
   scenes don't touch at all: that a session isn't necessarily solo. */
function ShareScene() {
  const joined = useAfter(2000);
  return (
    <div>
      <div className="cap" style={{ marginBottom: 14 }}>Live room</div>
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "11px 14px", marginBottom: 12 }}>
        <div className="num" style={{ fontSize: 23, fontWeight: 700, letterSpacing: ".09em" }}>JAC9M3</div>
        <div className="sm mut" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          hosted by josh
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--up)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 4, background: "currentColor" }} />live
          </span>
        </div>
      </div>
      <div className="btn" style={{ width: "100%", marginBottom: 14, justifyContent: "center",
        color: "var(--down)", borderColor: "color-mix(in srgb, var(--down) 40%, var(--border))" }}>Close room</div>
      <div className="cap" style={{ marginBottom: 8 }}>Participants · {joined ? 2 : 1}</div>
      <div style={{ display: "grid", gap: 2, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <Avatar handle="josh" size={24} />
          <span className="sm" style={{ flex: 1 }}>josh (you)</span>
          <span className="pill b">host</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
          opacity: joined ? 1 : 0, transform: joined ? "translateY(0)" : "translateY(-4px)", transition: "opacity .4s, transform .4s" }}>
          <Avatar handle="jason" size={24} />
          <span className="sm" style={{ flex: 1 }}>jason</span>
          <span className="pill n">viewer</span>
        </div>
      </div>
      <div className="sm mut" style={{ lineHeight: 1.55 }}>
        Sharing is view-only — guests watch live, but only you can trade or drive playback.
      </div>
    </div>
  );
}

/* ---------- hero mock ----------
   Not a screenshot — a small looping demo of the actual product: a
   TradingView-style chart (price/time axes, grid, watermark), candles
   confined to a portion of the canvas rather than stretched edge to edge,
   with our real, draggable FloatingBar sitting over it. A little cursor
   slides in, clicks Play on the real button, and the replay plays
   forward — each new candle actually forms in place (growing out from
   its open toward its final high/low/close, the way a live bar does),
   an entry marker fires partway through hugging the real entry price,
   and the R badge counts up live — then the cursor clicks Pause,
   everything holds for a beat, fades, and runs again.

   There's no "reveal curtain" sweeping across pre-drawn future bars —
   bars beyond where the replay has reached simply aren't drawn yet, same
   as the real product. Everything continuous (candle growth, pointer
   position, R value) is driven by refs mutated in a single rAF loop
   rather than React state, so this never re-renders for a 60fps
   animation; the two discrete "click" moments toggle a couple of DOM
   nodes directly the same way. */
function MockScreen({ T }) {
  const NUM_BARS = 30;
  const bars = useMemo(() => {
    let p = 100; const out = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < NUM_BARS; i++) {
      const o = p, c = o + (rnd() - 0.46) * 4.2;
      out.push({ o, c, h: Math.max(o, c) + rnd() * 1.6, l: Math.min(o, c) - rnd() * 1.6 });
      p = c;
    }
    return out;
  }, []);
  const timeLabels = useMemo(() => {
    const start = new Date(2025, 2, 13, 8, 0, 0).getTime(), step = 30 * 60000;
    return bars.map((_, i) => {
      const d = new Date(start + i * step);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    });
  }, [bars]);

  const rawLo = Math.min(...bars.map((b) => b.l)), rawHi = Math.max(...bars.map((b) => b.h));
  const margin = (rawHi - rawLo) * 0.14;
  const lo = rawLo - margin * 0.7, hi = rawHi + margin; // breathing room top/bottom, not edge to edge
  const W = 1000, H = 380, axisW = 56, axisH = 24, padL = 14, padT = 14;
  const plotR = W - axisW, plotB = H - axisH;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (plotB - padT);
  // candles occupy a portion of the canvas, not the full width — the rest
  // stays open grid, the way a chart that hasn't played all the way out yet
  // actually looks (there's nothing to draw there, not a hidden curtain).
  const CANDLE_FRAC = 0.6;
  const bw = (plotR - padL) * CANDLE_FRAC / NUM_BARS;
  const xAt = (i) => padL + i * bw;
  const priceOf = (v) => Math.round(v * 640).toLocaleString();

  const REVEAL_FROM = 9, REVEAL_TO = NUM_BARS - 1, ENTRY = 18, EXIT = 25, FINAL_R = 2.34;
  const entryPrice = bars[ENTRY].c;
  const entryX = xAt(ENTRY) + bw / 2, entryY = y(entryPrice);
  const stopDist = (hi - lo) * 0.075, targetDist = stopDist * 2.1;
  const zoneRight = xAt(NUM_BARS - 1) + bw * 2.2;
  const gridFracs = [0.08, 0.28, 0.48, 0.68, 0.88];
  const vGridCount = 7;
  const vGridXs = useMemo(() => Array.from({ length: vGridCount + 1 }, (_, k) => padL + k * (plotR - padL) / vGridCount), [plotR]);
  const timeTicks = [0, 6, 12, 18, 24, 29];

  // ---- choreography (ms) ----
  const T_MOVE_IN_END = 1500, T_PRESS1_END = 1680, T_RETREAT_END = 2050;
  const SWEEP_MS = 6200, T_SWEEP_START = T_MOVE_IN_END, T_SWEEP_END = T_SWEEP_START + SWEEP_MS;
  const T_RETURN_START = T_SWEEP_END - 500, T_RETURN_END = T_SWEEP_END + 250;
  const T_PRESS2_END = T_RETURN_END + 180, T_POINTER_OUT_END = T_PRESS2_END + 350;
  const T_HOLD_END = T_POINTER_OUT_END + 1500, T_FADE_END = T_HOLD_END + 650;
  const CYCLE_MS = T_FADE_END;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;

  const sceneRef = useRef(null);
  const chartWrapRef = useRef(null);
  const entryRef = useRef(null);
  const zoneRef = useRef(null);
  const badgeTextRef = useRef(null);
  const badgePillRef = useRef(null);
  const scrubRef = useRef(null);
  const clockRef = useRef(null);
  const headerDotRef = useRef(null);
  const barDotRef = useRef(null);
  const playBtnRef = useRef(null);
  const playIconRef = useRef(null);
  const pauseIconRef = useRef(null);
  const pointerRef = useRef(null);
  const dragHintRef = useRef(null);
  const barElRefs = useRef([]); // [{ group, wick, body }] per candle
  const setBarRef = (i, key, el) => {
    if (!barElRefs.current[i]) barElRefs.current[i] = {};
    barElRefs.current[i][key] = el;
  };

  /* Top-left everywhere the card has room to spare — bottom-left only
     once it doesn't. The price series trends upward over the reveal,
     so candle highs climb toward the top of the chart as the loop
     plays; on a roomy desktop-width card that's fine, there's enough
     height that the bar and the rising candles never actually meet.
     It's only once the card is phone-width — short in real pixels,
     since the SVG scales down with it — that top-left runs out of
     clearance and the bar ends up sitting over the candles. So this
     tracks the card's own rendered width (not the viewport's — same
     reasoning as FloatingBar's own clampToView) and switches between
     the two only when it actually crosses that line. */
  const MOBILE_BAR_BREAKPOINT = 640;
  const barPosFor = (narrow) => ({ x: 26, y: narrow ? H - 92 : 24 });
  const [barPos, setBarPos] = useState(barPosFor(false));
  const [barCollapsed, setBarCollapsed] = useState(false);
  /* NOT derived from barPos.y — FloatingBar's own clampToView reflow
     (see that file) rewrites pos.y to fit whatever the container's
     ACTUAL rendered height turns out to be, which on a short mobile
     card is nowhere near the H-92 this component asked for; comparing
     that already-rewritten value back against a fixed threshold like
     H/2 would read as "top" again the moment the clamp fires. Tracked
     separately, from the same width check that chose the position in
     the first place, so it stays right regardless of what the clamp
     does to the pixels afterward. */
  const [barAtBottom, setBarAtBottom] = useState(false);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let narrowNow = null; // forces the first check to actually set a position
    const check = () => {
      const narrow = (el.clientWidth || window.innerWidth) < MOBILE_BAR_BREAKPOINT;
      if (narrow === narrowNow) return;
      narrowNow = narrow;
      setBarPos(barPosFor(narrow));
      setBarAtBottom(narrow);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPlayingVisual = (playing) => {
    if (playIconRef.current) playIconRef.current.style.opacity = playing ? "0" : "1";
    if (pauseIconRef.current) pauseIconRef.current.style.opacity = playing ? "1" : "0";
    for (const dot of [headerDotRef.current, barDotRef.current]) {
      if (!dot) continue;
      dot.className = playing ? "live" : "";
      dot.style.background = playing ? "var(--up)" : "var(--dim)";
    }
  };
  const pressBtn = () => {
    const el = playBtnRef.current;
    if (!el) return;
    el.style.transform = "scale(.9)";
    el.style.boxShadow = "0 0 0 6px color-mix(in srgb, var(--brand) 32%, transparent)";
    setTimeout(() => { if (el) { el.style.transform = ""; el.style.boxShadow = ""; } }, 220);
  };

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // CSS custom properties, not the T object — this runs from a mount-only
    // effect, so a closed-over T would go stale the moment someone toggles
    // the theme mid-animation; var(--up/--down) always resolves live.
    const setBarVisual = (i, hh, ll, cc) => {
      const refs = barElRefs.current[i], b = bars[i];
      if (!refs || !b) return;
      const col = cc >= b.o ? "var(--up)" : "var(--down)";
      refs.group?.setAttribute("opacity", "1");
      if (refs.wick) { refs.wick.setAttribute("y1", y(hh)); refs.wick.setAttribute("y2", y(ll)); refs.wick.setAttribute("stroke", col); }
      if (refs.body) {
        refs.body.setAttribute("y", Math.min(y(b.o), y(cc)));
        refs.body.setAttribute("height", Math.max(1.5, Math.abs(y(cc) - y(b.o))));
        refs.body.setAttribute("fill", col);
      }
    };
    const lockBar = (i) => { const b = bars[i]; if (b) setBarVisual(i, b.h, b.l, b.c); };
    const hideBarsFrom = (startIdx) => {
      for (let i = startIdx; i <= REVEAL_TO; i++) barElRefs.current[i]?.group?.setAttribute("opacity", "0");
    };

    const applyChart = (entryOn, rVal, cursorIdx) => {
      entryRef.current?.setAttribute("opacity", entryOn);
      zoneRef.current?.setAttribute("opacity", entryOn);
      if (badgeTextRef.current) badgeTextRef.current.textContent = `${rVal >= 0 ? "+" : ""}${rVal.toFixed(2)}R`;
      if (badgePillRef.current) badgePillRef.current.className = `pill ${entryOn > 0.5 ? "g" : "n"}`;
      if (scrubRef.current) scrubRef.current.value = String(cursorIdx);
      if (clockRef.current) clockRef.current.textContent = timeLabels[Math.min(bars.length - 1, Math.max(0, Math.round(cursorIdx)))];
    };

    if (reduce) {
      for (let i = 0; i <= REVEAL_TO; i++) lockBar(i);
      applyChart(1, FINAL_R, REVEAL_TO);
      setPlayingVisual(false);
      if (pointerRef.current) pointerRef.current.style.opacity = "0";
      if (dragHintRef.current) dragHintRef.current.style.opacity = "0";
      return;
    }

    const getBtnPoint = () => {
      const btn = playBtnRef.current, cont = chartWrapRef.current;
      if (!btn || !cont) return { x: 200, y: 200 };
      const br = btn.getBoundingClientRect(), cr = cont.getBoundingClientRect();
      return { x: br.left + br.width / 2 - cr.left, y: br.top + br.height / 2 - cr.top };
    };
    const getAwayPoint = () => {
      const cont = chartWrapRef.current;
      return { x: (cont?.clientWidth || 600) - 40, y: (cont?.clientHeight || 300) - 36 };
    };

    let raf, lastElapsed = -1, liveIdx = -1;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = (now - start) % CYCLE_MS;
      if (elapsed < lastElapsed) { setPlayingVisual(false); hideBarsFrom(REVEAL_FROM + 1); liveIdx = -1; } // cycle wrapped
      if (lastElapsed < T_MOVE_IN_END && elapsed >= T_MOVE_IN_END) { setPlayingVisual(true); pressBtn(); }
      if (lastElapsed < T_RETURN_END && elapsed >= T_RETURN_END) { setPlayingVisual(false); pressBtn(); }
      lastElapsed = elapsed;

      // each bar past REVEAL_FROM forms in place as the replay reaches it —
      // no reveal line, just the candle itself growing from its open out
      // toward its true high/low/close, with a little organic settle.
      const sweeping = elapsed >= T_SWEEP_START && elapsed < T_SWEEP_END;
      const prog = sweeping ? (elapsed - T_SWEEP_START) / SWEEP_MS * (REVEAL_TO - REVEAL_FROM) : (elapsed < T_SWEEP_START ? 0 : REVEAL_TO - REVEAL_FROM);
      const k = Math.min(REVEAL_TO - REVEAL_FROM - 1, Math.floor(prog));
      const localP = sweeping ? prog - k : 1;
      const activeIdx = sweeping ? REVEAL_FROM + k + 1 : -1;
      const cursorIdx = REVEAL_FROM + Math.min(REVEAL_TO - REVEAL_FROM, prog);

      if (activeIdx !== liveIdx) {
        if (liveIdx >= 0) lockBar(liveIdx);
        liveIdx = activeIdx;
      }
      if (activeIdx >= 0 && activeIdx <= REVEAL_TO) {
        const b = bars[activeIdx];
        const pe = 1 - Math.pow(1 - localP, 2);
        const wig = Math.sin(localP * Math.PI * 2.4 + activeIdx) * (1 - pe) * (hi - lo) * 0.02;
        const curClose = lerp(b.o, b.c, pe) + wig;
        const curHigh = lerp(Math.max(b.o, curClose), b.h, pe);
        const curLow = lerp(Math.min(b.o, curClose), b.l, pe);
        setBarVisual(activeIdx, curHigh, curLow, curClose);
      }
      if (!sweeping && elapsed >= T_SWEEP_END && liveIdx >= 0) { lockBar(liveIdx); liveIdx = -1; }

      const entryOn = Math.max(0, Math.min(1, (cursorIdx - ENTRY) / 1.6));
      const rVal = FINAL_R * Math.max(0, Math.min(1, (cursorIdx - ENTRY) / (EXIT - ENTRY)));
      applyChart(entryOn, rVal, cursorIdx);

      // cursor pointer
      const btn = getBtnPoint(), away = getAwayPoint();
      const restX = lerp(btn.x, away.x, 0.55), restY = lerp(btn.y, away.y, 0.55);
      let px = away.x, py = away.y, pOp = 0, pScale = 1;
      if (elapsed < 650) { pOp = 0; px = away.x; py = away.y; }
      else if (elapsed < T_MOVE_IN_END) {
        const p = ease((elapsed - 650) / (T_MOVE_IN_END - 650));
        pOp = p; px = lerp(away.x, btn.x, p); py = lerp(away.y, btn.y, p);
      } else if (elapsed < T_PRESS1_END) {
        pOp = 1; px = btn.x; py = btn.y;
        pScale = 1 - 0.22 * Math.sin(((elapsed - T_MOVE_IN_END) / (T_PRESS1_END - T_MOVE_IN_END)) * Math.PI);
      } else if (elapsed < T_RETREAT_END) {
        const p = ease((elapsed - T_PRESS1_END) / (T_RETREAT_END - T_PRESS1_END));
        px = lerp(btn.x, restX, p); py = lerp(btn.y, restY, p); pOp = 1 - p * 0.75;
      } else if (elapsed < T_RETURN_START) {
        px = restX; py = restY; pOp = 0.25;
      } else if (elapsed < T_RETURN_END) {
        const p = ease((elapsed - T_RETURN_START) / (T_RETURN_END - T_RETURN_START));
        px = lerp(restX, btn.x, p); py = lerp(restY, btn.y, p); pOp = lerp(0.25, 1, p);
      } else if (elapsed < T_PRESS2_END) {
        pOp = 1; px = btn.x; py = btn.y;
        pScale = 1 - 0.22 * Math.sin(((elapsed - T_RETURN_END) / (T_PRESS2_END - T_RETURN_END)) * Math.PI);
      } else if (elapsed < T_POINTER_OUT_END) {
        pOp = 1 - (elapsed - T_PRESS2_END) / (T_POINTER_OUT_END - T_PRESS2_END); px = btn.x; py = btn.y;
      } else { pOp = 0; px = btn.x; py = btn.y; }
      if (pointerRef.current) {
        pointerRef.current.style.transform = `translate(${px}px, ${py}px) scale(${pScale})`;
        pointerRef.current.style.opacity = String(pOp);
      }

      // "drag me" hint — a beat at the very start of each loop, gone again
      // well before the fake cursor arrives to click Play so the two never
      // compete for attention.
      const hintOp = elapsed < 150 ? 0
        : elapsed < 500 ? (elapsed - 150) / 350
        : elapsed < 1100 ? 1
        : elapsed < 1400 ? 1 - (elapsed - 1100) / 300
        : 0;
      if (dragHintRef.current) dragHintRef.current.style.opacity = String(hintOp);

      // whole scene fade for the loop transition
      if (sceneRef.current) {
        sceneRef.current.style.opacity = elapsed >= T_HOLD_END
          ? String(Math.max(0, 1 - (elapsed - T_HOLD_END) / (T_FADE_END - T_HOLD_END))) : "1";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card style={{ padding: 0, overflow: "hidden", maxWidth: 1000, margin: "0 auto", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ display: "flex", gap: 6 }}>
          {["#ef4444", "#f59e0b", "#22c55e"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, opacity: .75 }} />)}
        </span>
        <span className="sm mut" style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 6 }}>
          BTC/USDT · 30m ·
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span ref={headerDotRef} style={{ width: 6, height: 6, borderRadius: 3, background: "var(--dim)", display: "inline-block" }} />
            replay
          </span>
        </span>
        <span ref={badgePillRef} className="pill n" style={{ marginLeft: "auto" }}>
          <span ref={badgeTextRef}>0.00R</span>
        </span>
      </div>

      <div ref={sceneRef}>
        <div ref={chartWrapRef} style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", background: "var(--bg2)" }}>
            {/* watermark + grid, TradingView-style chrome — spans the whole
                canvas regardless of how much of it the candles currently
                fill, the way a real chart's grid doesn't care how much
                history has loaded yet. */}
            <text x={padL + 8} y={plotB - 16} fontSize="40" fontWeight="800" fill="var(--ink)" opacity=".05">BTCUSDT</text>
            {vGridXs.map((gx, k) => (
              <line key={"v" + k} x1={gx} y1={padT} x2={gx} y2={plotB} stroke="var(--border)" strokeWidth="1" opacity=".6" />
            ))}
            {gridFracs.map((f) => {
              const gy = padT + f * (plotB - padT), price = priceOf(hi - f * (hi - lo));
              return (
                <g key={f}>
                  <line x1={padL} y1={gy} x2={plotR} y2={gy} stroke="var(--border)" strokeWidth="1" opacity=".6" />
                  <text x={plotR + 8} y={gy + 3.5} fontSize="10.5" fill="var(--muted)" fontFamily="ui-monospace, monospace">{price}</text>
                </g>
              );
            })}
            {timeTicks.map((i) => (
              <text key={i} x={xAt(i) + bw / 2} y={plotB + 16} fontSize="10" fill="var(--muted)" textAnchor="middle" fontFamily="ui-monospace, monospace">
                {timeLabels[i]}
              </text>
            ))}
            <line x1={padL} y1={plotB} x2={plotR} y2={plotB} stroke="var(--border)" strokeWidth="1" />

            {/* target above entry / stop below — anchored to the actual
                entry price, not a fixed slice of the chart's overall range,
                so the box always makes sense relative to the marker, and
                only appears once the trade is actually taken (same fade as
                the entry marker) rather than sitting there pre-drawn. */}
            <g ref={zoneRef} opacity="0">
              <rect x={entryX} y={y(entryPrice + targetDist)} width={zoneRight - entryX} height={y(entryPrice) - y(entryPrice + targetDist)} fill="var(--up)" opacity=".14" />
              <rect x={entryX} y={y(entryPrice)} width={zoneRight - entryX} height={y(entryPrice - stopDist) - y(entryPrice)} fill="var(--down)" opacity=".14" />
            </g>

            {bars.map((b, i) => {
              const x = xAt(i) + bw / 2, up = b.c >= b.o;
              const col = up ? T.up : T.down;
              return (
                <g key={i} ref={(el) => setBarRef(i, "group", el)} opacity={i <= REVEAL_FROM ? 1 : 0}>
                  <line ref={(el) => setBarRef(i, "wick", el)} x1={x} y1={y(b.h)} x2={x} y2={y(b.l)} stroke={col} strokeWidth="1.4" />
                  <rect ref={(el) => setBarRef(i, "body", el)} x={x - bw * 0.32} y={Math.min(y(b.o), y(b.c))} width={bw * 0.64}
                    height={Math.max(1.5, Math.abs(y(b.c) - y(b.o)))} fill={col} />
                </g>
              );
            })}

            {/* entry marker — fades in the instant the replay cursor reaches it */}
            <g ref={entryRef} opacity="0">
              <circle className="mock-ping" cx={entryX} cy={entryY} r="4" fill="none" stroke={T.brand} strokeWidth="1.5" />
              <circle cx={entryX} cy={entryY} r="3.5" fill={T.brand} />
              <path d={`M ${entryX} ${entryY - 11} l -4 6 h 8 z`} fill={T.brand} />
            </g>
          </svg>

          {/* the real, draggable replay bar — same component the simulator uses */}
          <FloatingBar pos={barPos} onPos={setBarPos} collapsed={barCollapsed}
            onToggleCollapse={() => setBarCollapsed((c) => !c)} minWidth={330} label="Replay">
            <div style={{ padding: "6px 9px", display: "flex", alignItems: "center", gap: 7 }}>
              <span ref={barDotRef} style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: "var(--dim)" }} />
              <button ref={playBtnRef} className="btn pri" tabIndex={-1}
                style={{ padding: "4px 11px", position: "relative", transition: "transform .12s ease, box-shadow .25s ease" }}>
                <span style={{ position: "relative", width: 13, height: 13, display: "inline-block" }}>
                  <span ref={playIconRef} style={{ position: "absolute", inset: 0, transition: "opacity .15s" }}><Svg s={13}>{Ic.play}</Svg></span>
                  <span ref={pauseIconRef} style={{ position: "absolute", inset: 0, opacity: 0, transition: "opacity .15s" }}><Svg s={13}>{Ic.pause}</Svg></span>
                </span>
              </button>
              <select className="in" disabled defaultValue="30m" style={{ width: 66, padding: "4px 6px", fontSize: 12.5, flexShrink: 0 }}>
                <option value="30m">30m</option>
              </select>
              <input ref={scrubRef} type="range" min={0} max={bars.length - 1} defaultValue={REVEAL_FROM} disabled
                style={{ flex: 1, minWidth: 80, accentColor: T.brand, margin: 0 }} />
              <span ref={clockRef} className="num" style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }} />
            </div>
          </FloatingBar>

          {/* "you can grab this" hint — a beat right at the start of the
              loop, near the bar's own drag handle, then gone before the
              fake cursor arrives. Positioned off barPos directly (same
              place the bar itself starts each cycle) rather than measured
              off the live DOM, since it only ever needs to be right for
              that first moment. Below the bar when it's at the top
              (room to spare underneath), above it when it's at the
              bottom (no room below it there) — whichever side the bar
              itself isn't crowding. */}
          <div ref={dragHintRef} className="mock-hint-bob" style={{
            position: "absolute", left: barPos.x + 2, top: barAtBottom ? barPos.y - 38 : barPos.y + 46, zIndex: 96,
            display: "flex", alignItems: "center", gap: 6, opacity: 0, pointerEvents: "none",
            background: "var(--surface)", border: "1px solid var(--borderStrong)", borderRadius: 7,
            padding: "5px 10px 5px 8px", fontSize: 11.5, fontWeight: 500, color: "var(--muted)",
            whiteSpace: "nowrap", boxShadow: "0 6px 16px rgba(0,0,0,.3)",
          }}>
            <svg width="8" height="13" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
              {[3, 8, 13].map((cy) => (
                <React.Fragment key={cy}><circle cx="2.5" cy={cy} r="1.25" /><circle cx="7.5" cy={cy} r="1.25" /></React.Fragment>
              ))}
            </svg>
            Drag to move
          </div>

          {/* the "someone's using it" cursor — slides in and clicks Play/Pause on the bar above */}
          <div ref={pointerRef} style={{ position: "absolute", left: 0, top: 0, zIndex: 95, opacity: 0, pointerEvents: "none", willChange: "transform, opacity" }}>
            <svg width="20" height="24" viewBox="0 0 20 24" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>
              <path d="M2 1.2 2 19.4 6.4 15.6 9.1 21.7 11.6 20.6 8.9 14.6 14.3 14.4 Z"
                fill="#fff" stroke="#111" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .mock-ping { animation: mock-ping 1.7s cubic-bezier(0,.4,.6,1) infinite; transform-origin: center; transform-box: fill-box; }
          @keyframes mock-ping { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(2.6); opacity: 0; } }
          .mock-hint-bob { animation: mock-hint-bob 1s ease-in-out infinite; }
          @keyframes mock-hint-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(3px); } }
        }
      `}</style>
    </Card>
  );
}



