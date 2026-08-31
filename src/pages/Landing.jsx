import React, { useState, useEffect } from "react";
import Logo, { LogoMark } from "../components/Logo.jsx";
import { Card, Svg, Ic } from "../components/ui.jsx";
import Avatar from "../components/Avatar.jsx";

/* ============================================================
   Landing — the page that has to earn the signup
   ============================================================ */

const FEATURES = [
  { icon: Ic.play, title: "Replay any market, bar by bar",
    body: "Load a real historical session and step through it candle by candle, or run it at up to 50×. The next bar is hidden until you commit — no hindsight, no peeking." },
  { icon: Ic.users, title: "Trade the same chart together",
    body: "Host a session and share a code. Your playback, drawings and levels stay in sync for everyone watching. Give a friend edit access, or keep them read-only." },
  { icon: Ic.target, title: "Sized off your stop, scored in R",
    body: "Set a stop and a risk percentage; position size is derived for you. Every trade is recorded as a multiple of risk, so results compare across instruments and account sizes." },
  { icon: Ic.chart, title: "Analytics that answer real questions",
    body: "Win rate by session, by day, by setup tag. R-distribution, expectancy, drawdown and streaks. Find out which setup is actually carrying your account." },
  { icon: Ic.bolt, title: "Prop-firm challenge mode",
    body: "Run a session under daily-loss, max-drawdown and profit-target rules. Breach one and the challenge fails, exactly as it would with real capital." },
  { icon: Ic.book, title: "A journal that fills itself",
    body: "Every fill is logged with entry, stop, target, R and reason for exit. Add tags and notes while the setup is fresh, then review the whole book later." },
];

const STEPS = [
  { n: "01", title: "Pick a market and a date", body: "Ten crypto pairs, timeframes from one second to one day, any start date you like. Or let it drop you somewhere random so you can't recognise the chart." },
  { n: "02", title: "Arm your setup", body: "Direction, entry, stop, target, risk percent. PipTest checks the setup makes sense and works out the position size." },
  { n: "03", title: "Press play", body: "Watch it fill, or not. Stops and targets are checked against every bar's high and low — including the ones that flash past at 50×." },
  { n: "04", title: "Review the book", body: "Tag the setup, write the note while you remember it, then look at what your last hundred trades are actually telling you." },
];

const FAQ = [
  { q: "Is the data real?", a: "Yes — historical candles come straight from Binance's public market data, down to one-second bars. If the feed is ever unreachable, PipTest says so plainly rather than quietly substituting anything." },
  { q: "Do I need to install anything?", a: "No. PipTest runs in the browser. Your sessions, trades and drawings are saved automatically." },
  { q: "How is this different from a demo account?", a: "A demo account moves in real time — a week of price action takes a week. PipTest compresses that into an afternoon, and lets you replay the same session as many times as you like." },
  { q: "Can I share a session with my trading group?", a: "That's the point. Start a room, share the six-character code, and everyone watches your chart live. You control who can draw on it." },
  { q: "What about forex?", a: "Crypto is live today. Forex is next — the data pipeline is the only piece outstanding, since free tick-level FX history needs its own ingest." },
  { q: "Does it cost anything?", a: "PipTest is free while it’s in early access. If paid plans arrive later you’ll hear well before anything changes, and everything you’ve built stays yours." },
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
                <button className="btn pri hide-sm" onClick={() => onNav("dashboard")}>Open PipTest</button>
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
          <span className="pill b" style={{ marginBottom: 18, display: "inline-block" }}>
            Now with shared live sessions
          </span>
          <h1 style={{ maxWidth: 760, margin: "0 auto 18px" }}>
            Get a year of screen time<br />into a weekend.
          </h1>
          <p className="mut" style={{ maxWidth: 580, margin: "0 auto 30px", fontSize: 17, lineHeight: 1.65 }}>
            PipTest replays real historical markets bar by bar so you can practise your setups
            hundreds of times without risking a cent — alone, or on the same chart as your trading group.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <button className="btn pri lg" onClick={onGetStarted}>
              {account ? "Go to your dashboard" : "Start practising free"}
            </button>
            <a href="#how" onClick={scrollTo("how")} className="btn outline lg">See how it works</a>
          </div>
          <div className="sm mut">
            {account ? `Signed in as @${account.handle}` : "No card required · Free while in early access"}
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
          {[["1s", "Smallest candle"], ["10", "Crypto markets"], ["50×", "Replay speed"], ["∞", "Repeat attempts"]].map(([v, l]) => (
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="mono" style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, marginBottom: 10 }}>{s.n}</div>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>{s.title}</h3>
                <p className="mut" style={{ fontSize: 14, lineHeight: 1.65 }}>{s.body}</p>
              </div>
            ))}
          </div>
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
          <span className="sm mut">© {new Date().getFullYear()} PipTest</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18 }} className="sm mut">
            <NavLink to="features">Features</NavLink>
            <NavLink to="faq">FAQ</NavLink>
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 30px" }}>
          <p className="sm mut" style={{ lineHeight: 1.7, maxWidth: 780 }}>
            PipTest is a practice and education tool. Simulated results are not a prediction of live
            performance — replayed markets have no slippage, no spread and no emotional cost. Nothing
            here is financial advice.
          </p>
        </div>
      </footer>

      <style>{`@media (max-width: 820px) { .hide-sm { display: none !important; } }`}</style>
    </div>
  );
}

/* ---------- hero mock ---------- */
function MockScreen({ T }) {
  const bars = React.useMemo(() => {
    let p = 100; const out = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 64; i++) {
      const o = p, c = o + (rnd() - 0.46) * 4.2;
      out.push({ o, c, h: Math.max(o, c) + rnd() * 1.6, l: Math.min(o, c) - rnd() * 1.6 });
      p = c;
    }
    return out;
  }, []);
  const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h));
  const H = 300, W = 1000, pad = 16;
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const bw = (W - pad * 2) / bars.length;

  return (
    <Card style={{ padding: 0, overflow: "hidden", maxWidth: 1000, margin: "0 auto", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ display: "flex", gap: 6 }}>
          {["#ef4444", "#f59e0b", "#22c55e"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: 5, background: c, opacity: .75 }} />)}
        </span>
        <span className="sm mut" style={{ marginLeft: 8 }}>BTC/USDT · 30m · replay</span>
        <span className="pill g" style={{ marginLeft: "auto" }}>+2.34R</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: "block", width: "100%", height: "auto", background: "var(--bg2)" }}>
        <rect x={pad + bw * 44} y={y(hi - (hi - lo) * 0.30)} width={W - pad - bw * 44} height={y(hi - (hi - lo) * 0.52) - y(hi - (hi - lo) * 0.30)} fill={T.up} opacity=".12" />
        <rect x={pad + bw * 44} y={y(hi - (hi - lo) * 0.52)} width={W - pad - bw * 44} height={y(hi - (hi - lo) * 0.62) - y(hi - (hi - lo) * 0.52)} fill={T.down} opacity=".12" />
        {bars.map((b, i) => {
          const x = pad + i * bw + bw / 2, up = b.c >= b.o;
          const col = up ? T.up : T.down;
          return (
            <g key={i} opacity={i > 47 ? 0.28 : 1}>
              <line x1={x} y1={y(b.h)} x2={x} y2={y(b.l)} stroke={col} strokeWidth="1.2" />
              <rect x={x - bw * 0.3} y={Math.min(y(b.o), y(b.c))} width={bw * 0.6}
                height={Math.max(1.5, Math.abs(y(b.c) - y(b.o)))} fill={col} rx="1" />
            </g>
          );
        })}
        <line x1={pad + bw * 47.6} y1={pad} x2={pad + bw * 47.6} y2={H - pad} stroke={T.brand} strokeWidth="1.4" strokeDasharray="4 4" />
      </svg>
    </Card>
  );
}



