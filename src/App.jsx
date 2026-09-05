import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from "react";
import { THEMES, cssVars } from "./theme.js";
import { GLOBAL_CSS, Modal, CornerLoader } from "./components/ui.jsx";
import Shell from "./components/Shell.jsx";
import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Reset from "./pages/Reset.jsx";
import Legal from "./pages/Legal.jsx";
import NotFound from "./pages/NotFound.jsx";
/* Lazy: everything behind the auth gate, so a first-time visitor on
   Landing (the default route, and the one conversion actually depends
   on) never downloads the trading engine, room sync, journal/analytics
   or the TradingView wrapper before they've even signed up. Landing,
   Auth and Reset stay eager — they're small, and they're on the very
   first paint, so lazy-loading them would just delay the thing this is
   trying to speed up. */
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Simulator = lazy(() => import("./pages/Simulator.jsx"));
const Journal = lazy(() => import("./pages/Journal.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
import { store, K } from "./lib/store.js";
import { api, API_ENABLED, setToken, refresh, onAuthLost } from "./lib/api.js";
import * as data from "./lib/data.js";
import { fmtShort, uid } from "./lib/trading.js";

/* ============================================================
   App — routing, session and the state that spans pages

   Accounts live in Postgres when VITE_API_URL is configured.
   Without it the app still runs against localStorage, so local
   development and the current deploy keep working.
   ============================================================ */

const ROUTES = ["home", "auth", "reset", "privacy", "terms", "sim", "dashboard", "journal", "analytics", "settings"];

const parseHash = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  if (!h) return { page: "", arg: null }; // no hash at all -> the actual homepage
  const [page, arg] = h.split("/");
  if (!ROUTES.includes(page)) return { page: "notfound", arg: null }; // a hash, just not one of ours
  return { page, arg: arg || null };
};

/* Suspense fallback for the lazy-loaded pages above — same spinner the
   settings-without-account and sim-not-found-yet states already used, so
   a lazy chunk fetch doesn't look any different from the loading states
   that were already here. `full` for a standalone route (sim), the
   shorter version for anything rendering inside Shell's own layout. */
const PageLoading = ({ full }) => (
  <div style={full
    ? { minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }
    : { padding: "60px 0", display: "grid", placeItems: "center" }}>
    <span className="spinner" />
  </div>
);

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [booted, setBooted] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [account, setAccount] = useState(null);
  const [authMode, setAuthMode] = useState("signup");
  const [sessions, setSessions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [importOffer, setImportOffer] = useState(null);
  const [pendingJoin, setPendingJoin] = useState(null); // { id, code } — see joinRoomFromDashboard
  /* ids already checked against a stored room-link breadcrumb, so a
     re-render (sessions/pendingJoin changing) doesn't redo it — see
     the effect below */
  const roomLinkCheckedRef = useRef(new Set());

  const T = THEMES[theme];
  const vars = useMemo(() => cssVars(T), [T]);

  /* ---------- routing ---------- */
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((page, arg) => {
    window.location.hash = arg ? `#/${page}/${arg}` : `#/${page}`;
    setRoute({ page, arg: arg || null });
    window.scrollTo(0, 0);
  }, []);

  /* ---------- load everything for the signed-in user ---------- */
  const loadData = useCallback(async () => {
    const [s, t] = await Promise.all([data.listSessions(), data.listTrades()]);
    setSessions(s); setTrades(t);
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    /* StrictMode double-invokes effects in dev — mount, clean up,
       mount again — which without this guard runs this whole async
       sequence twice, and whichever copy's `setSessions(s)` happens
       to resolve second wins, silently discarding anything applied
       in between (a room-link reconstruction from the effect below,
       for one — that's what turned into a permanent loading spinner
       when this was first found: the real fetch's own empty list,
       landing late, wiped out the just-rebuilt transient session out
       from under it). Never observed outside StrictMode — a single,
       real invocation has nothing concurrent to race against — but
       cheap enough to guard unconditionally rather than relying on
       that staying true. */
    let active = true;
    (async () => {
      const prefs = await store.get(K.prefs);
      if (active && prefs?.theme) setTheme(prefs.theme);

      if (API_ENABLED) {
        /* the refresh cookie survives a reload — try to resume silently */
        const user = await refresh();
        if (!active) return;
        if (user && typeof user === "object") {
          setAccount(user);
          data.useRemote(true);
          const [s, t] = await Promise.all([data.listSessions(), data.listTrades()]);
          if (!active) return;
          setSessions(s); setTrades(t);
        } else {
          data.useRemote(false);
          const [s, t] = await Promise.all([store.get(K.sessions), store.get(K.trades)]);
          if (!active) return;
          setSessions(s || []); setTrades(t || []);
        }
      } else {
        const local = await store.get(K.account);
        if (!active) return;
        if (local) setAccount(local);
        data.useRemote(false);
        const [s, t] = await Promise.all([store.get(K.sessions), store.get(K.trades)]);
        if (!active) return;
        setSessions(s || []); setTrades(t || []);
      }
      setBooted(true);
    })();
    return () => { active = false; };
  }, [loadData]);

  /* A joined-room session is `transient` (see joinRoomFromDashboard) —
     never saved anywhere, so a refresh loses it from `sessions`
     exactly like it lost everything else in memory, and the #/sim
     render branch below used to bounce straight to the dashboard the
     instant it couldn't find a matching session. Before it does now,
     check whether this URL's id has a room-link breadcrumb
     (Simulator writes one — see its own room-resume effect); if so,
     rebuild the same placeholder joinRoomFromDashboard would have
     made and let Simulator's matching resume effect take it from
     there, instead of losing the room over what was only ever a
     page reload.

     The redirect itself has to live here, not in the render body: an
     effect only runs after the render that triggered it has already
     committed, so a render-body redirect (the previous shape of this
     code) fires on the very first "no meta yet" render — the one
     before this effect has had any chance to even set
     it, let alone resolve it. That's not a maybe-missed
     edge case, it's every single time: a genuine dead id got bounced
     correctly, by accident, for the wrong reason, while a real
     breadcrumb was being raced and lost. Only a *resolved* negative
     (this async check actually came back empty) is grounds to leave;
     the render body below just waits, however long that check takes.
     Checked once per id (the ref), not on every render while
     sessions/pendingJoin themselves keep changing underneath. */
  useEffect(() => {
    if (!booted || route.page !== "sim") return;
    const id = route.arg;
    if (sessions.some((s) => s.id === id) || roomLinkCheckedRef.current.has(id)) return;
    roomLinkCheckedRef.current.add(id);
    (async () => {
      const code = await store.get(K.roomLink(id));
      if (code) {
        const meta = { id, name: `Room ${code}`, symbol: "BTCUSDT", interval: "30m",
          startMs: Date.now() - 30 * 86400000, blind: false, challenge: null, createdAt: Date.now(),
          stats: { count: 0, curve: [] }, transient: true };
        setSessions((prev) => [meta, ...prev]);
        setPendingJoin({ id, code });
      } else {
        go("dashboard");
      }
    })();
  }, [booted, route.page, route.arg]); // eslint-disable-line

  /* server said our session is gone — drop back to signed out */
  useEffect(() => onAuthLost(() => {
    setAccount(null); data.useRemote(false); setToken(null);
    setSessions([]); setTrades([]);
    go("auth");
  }), [go]);

  const savePrefs = useCallback(async (patch) => {
    const p = (await store.get(K.prefs)) || {};
    await store.set(K.prefs, { ...p, ...patch });
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); savePrefs({ theme: next });
  };

  useEffect(() => {
    document.body.style.background = T.bg;
    document.documentElement.style.colorScheme = theme;
  }, [T, theme]);

  /* ---------- auth actions ---------- */
  const afterSignIn = async (user) => {
    setAccount(user);
    if (API_ENABLED) {
      data.useRemote(true);
      const local = await data.localWorkSummary();
      await loadData();
      if (local.has) setImportOffer(local);
    } else {
      await store.set(K.account, user);
      data.useRemote(false);
    }
    go("dashboard");
  };

  const doRegister = async (body) => {
    if (!API_ENABLED) {
      const u = { ...body, role: "user", plan: "free", createdAt: Date.now() };
      delete u.password;
      return u;
    }
    const { user, accessToken } = await api.register(body);
    setToken(accessToken);
    return user;
  };

  const doLogin = async (body) => {
    if (!API_ENABLED) {
      const u = (await store.get(K.account)) || { handle: body.email.split("@")[0], name: body.email.split("@")[0], role: "user", plan: "free" };
      return u;
    }
    const { user, accessToken } = await api.login(body);
    setToken(accessToken);
    return user;
  };

  const signOut = async () => {
    try { if (API_ENABLED) await api.logout(); } catch (e) {}
    setToken(null); setAccount(null); data.useRemote(false);
    setSessions([]); setTrades([]);
    go("");
  };

  /* ---------- sessions ---------- */
  const createSession = async (s) => {
    const meta = { ...s, stats: { count: 0, curve: [] } };
    const next = [meta, ...sessions];
    setSessions(next);
    await data.saveSession(meta, next);
    await data.saveSessionState(s.id, { id: s.id, cursor: 100, trades: [], trade: null, drawings: [], notes: "" });
    go("sim", s.id);
  };

  /* ---------- join a room straight from the dashboard ----------
     Rooms only ever synced onto whatever session was already open in the
     simulator, so joining meant finding a session of your own first. This
     needs *some* session object for the router/Simulator to render against
     (its symbol/interval are placeholders — Simulator overwrites them from
     the room the moment it joins), but unlike createSession this is never
     written to the backend and never gets a saved-state row: it's marked
     `transient` and lives only in this tab's sessions state for as long as
     the visit lasts, so it can't show up as a fake "session" on the
     Dashboard or count toward anyone's stats. Simulator skips autosave
     entirely when meta.transient is set, and the effect below drops it
     from state again the moment `route` stops pointing at it — covering
     the Dashboard link, the profile menu, the session switcher and
     browser back/forward alike, since all of them change `route`. (An
     earlier version tried dropping it from a Simulator-side effect
     cleanup instead; that fired during React StrictMode's dev-only
     double-invoke of effects on first mount, deleting the session before
     the user had even seen it. Keying off `route` here instead of a
     mount/unmount lifecycle isn't sensitive to that.) */
  const joinRoomFromDashboard = (code) => {
    const id = uid();
    const meta = {
      id, name: `Room ${code}`, symbol: "BTCUSDT", interval: "30m",
      startMs: Date.now() - 30 * 86400000, blind: false, challenge: null, createdAt: Date.now(),
      stats: { count: 0, curve: [] }, transient: true,
    };
    setSessions((prev) => [meta, ...prev]);
    setPendingJoin({ id, code });
    roomLinkCheckedRef.current.add(id); // already known — the effect above would only redo this same work
    store.set(K.roomLink(id), code); // covers a refresh in the moment before Simulator's own joinRoom confirms it
    go("sim", id);
  };

  /* belt-and-braces for exits this component doesn't get a chance to
     intercept (browser back/forward, closing the room panel and just
     navigating away by hand) — whenever the route stops pointing at a
     given transient session, drop it. Since it was never persisted,
     this only ever affects this tab's in-memory list, never the backend. */
  useEffect(() => {
    setSessions((prev) => {
      const isCurrent = (s) => route.page === "sim" && s.id === route.arg;
      const stale = prev.some((s) => s.transient && !isCurrent(s));
      return stale ? prev.filter((s) => !s.transient || isCurrent(s)) : prev; // same reference -> no-op re-render
    });
  }, [route.page, route.arg]);

  const deleteSession = async (id) => {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    /* takes its trades with it, so a deleted session's numbers stop
       counting toward the Dashboard/Journal/Analytics totals rather than
       lingering as orphaned rows — see the matching server-side cascade
       in server/routes.js and the sessionId tagging in Simulator.jsx.
       Only trades made after that tagging shipped carry a sessionId, so
       older trades (from before this existed) have nothing to match on
       and are left alone rather than guessed at. */
    const remainingTrades = trades.filter((t) => t.sessionId !== id);
    if (remainingTrades.length !== trades.length) setTrades(remainingTrades);
    await data.deleteSession(id, next, remainingTrades);
  };

  const patchSession = useCallback((id, patch) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s));
      const meta = next.find((s) => s.id === id);
      /* transient (joined-room) sessions never get a backend row — see
         joinRoomFromDashboard. Simulator's autosave already skips calling
         this for them, but guard here too rather than rely on that alone. */
      if (meta && !meta.transient) data.saveSession(meta, next);
      return next;
    });
  }, []);

  /* ---------- trades ---------- */
  const onTradesClosed = useCallback((closed) => {
    setTrades((prev) => {
      const next = [...closed, ...prev];
      data.addTrades(closed, next);
      return next;
    });
  }, []);

  const updateTrade = useCallback((id, patch) => {
    setTrades((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      data.patchTrade(id, patch, next);
      return next;
    });
  }, []);

  const exportCsv = () => {
    const head = ["closed", "market", "timeframe", "side", "entry", "exit", "stop", "target",
      "qty", "risk_pct", "risk_amt", "r", "pnl", "exit_reason", "note"];
    const rows = trades.map((t) => [
      fmtShort(t.closedTs || t.closedAt), t.symbol, t.interval, t.dir,
      t.entry, t.exit, t.stop, t.target ?? "", t.qty, t.riskPct ?? "", t.riskAmt ?? "",
      (t.r ?? 0).toFixed(4), (t.pnl ?? 0).toFixed(2), t.reason,
      (t.note || "").replace(/[\r\n]+/g, " "),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `piptest-trades-${fmtShort(Date.now())}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const wipe = async () => {
    if (API_ENABLED && account) {
      try { await api.deleteMe(); } catch (e) {}
      setToken(null);
    }
    await data.clearLocalWork();
    await store.del(K.account);
    setSessions([]); setTrades([]); setAccount(null);
    go("");
  };

  /* ---------- render ----------
     No full-screen "Loading…" gate: the very first render already has
     real (empty) state — theme defaults, account null, sessions/trades
     [] — so the actual page renders immediately and each data-dependent
     bit of it shows its own loading state (see Dashboard's `loading`
     prop, Landing's `booting` prop) rather than the whole app waiting
     behind a blank screen. The only thing marking that boot (the
     silent-refresh + initial fetch) is still in flight is the small
     corner pill below, which just disappears once it resolves. */
  const wrap = (children) => (
    <div className="pt" data-theme={theme} style={vars}>
      <style>{GLOBAL_CSS}</style>
      {children}
      <ImportModal offer={importOffer} onClose={() => setImportOffer(null)} onImport={async () => {
        const r = await data.pushLocalToAccount();
        await data.clearLocalWork();
        await loadData();
        setImportOffer(null);
        alert(`Brought across ${r.sessions} session${r.sessions === 1 ? "" : "s"} and ${r.trades} trade${r.trades === 1 ? "" : "s"}.`);
      }} />
      <CornerLoader show={!booted} />
    </div>
  );

  if (!route.page || route.page === "home") {
    return wrap(
      <Landing
        theme={theme} T={T} onToggleTheme={toggleTheme}
        account={account} onSignOut={signOut} onNav={go} booting={!booted}
        onGetStarted={() => { if (account) go("dashboard"); else { setAuthMode("signup"); go("auth"); } }}
        onSignIn={() => { if (account) go("dashboard"); else { setAuthMode("signin"); go("auth"); } }}
      />
    );
  }

  /* A reset link is opened by someone who can't sign in, so this route has to
     come before the auth gate. */
  if (route.page === "reset") {
    return wrap(
      <Reset token={route.arg || ""}
        onDone={() => { setAuthMode("signin"); go("auth"); }}
        onBack={() => { setAuthMode("signin"); go("auth"); }} />
    );
  }

  /* Same reasoning as reset: readable whether or not anyone's signed
     in, so this has to come before the auth gate too — otherwise a
     logged-out visitor hitting #/privacy would get bounced to the
     sign-in screen instead of the policy they came to read. */
  if (route.page === "privacy" || route.page === "terms") {
    return wrap(<Legal kind={route.page} onBack={() => go("")} onNav={go} />);
  }

  /* Same reasoning again: a bad link is a bad link whether or not
     whoever followed it is signed in, so this comes before the auth
     gate too. `account` here can still mean "not resolved yet" during
     boot (see the comment below) — that only ever changes which of
     NotFound's two buttons shows, never whether the page itself
     renders, so it doesn't need to wait on `booted` the way the auth
     gate does. */
  if (route.page === "notfound") {
    return wrap(<NotFound account={account} onHome={() => go("")} onDashboard={() => go("dashboard")} />);
  }

  /* `!account` alone would also mean "still finding out" during the
     silent-refresh boot — only treat it as "genuinely signed out" once
     that's actually resolved, otherwise a signed-in user opening a
     deep link flashes the auth screen before bouncing back. */
  if (route.page === "auth" || (!account && booted)) {
    return wrap(
      <Auth
        mode={authMode}
        doLogin={doLogin} doRegister={doRegister}
        onSwitch={() => setAuthMode((m) => (m === "signup" ? "signin" : "signup"))}
        onBack={() => go("")}
        onSignedIn={afterSignIn}
      />
    );
  }

  if (route.page === "sim") {
    const meta = sessions.find((s) => s.id === route.arg);
    if (!meta) {
      /* Never redirect from here — see the room-link effect above for
         why: it's the only place with an actually-resolved answer,
         sessions not having come back from boot yet included. This
         just waits, whether that's boot still loading or the
         room-link check still in flight for this exact id. */
      return wrap(
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }}>
          <span className="spinner" />
        </div>
      );
    }
    return wrap(
      <Suspense fallback={<PageLoading full />}>
        <Simulator
          key={meta.id} meta={meta} account={account} theme={theme} T={T}
          onExit={() => go("dashboard")} onSaveSession={patchSession}
          onTradesClosed={onTradesClosed} onToggleTheme={toggleTheme}
          onNav={go} onSignOut={signOut} sessions={sessions}
          autoJoinCode={pendingJoin?.id === meta.id ? pendingJoin.code : null}
          onAutoJoinDone={() => setPendingJoin(null)}
        />
      </Suspense>
    );
  }

  const page = ["dashboard", "journal", "analytics", "settings"].includes(route.page) ? route.page : "dashboard";

  return wrap(
    <Shell
      page={page}
      onNav={(p) => (p === "simulator" ? (sessions[0] ? go("sim", sessions[0].id) : go("dashboard")) : go(p))}
      onHome={() => go("")}
      account={account} theme={theme} onToggleTheme={toggleTheme} onSignOut={signOut}
    >
      <Suspense fallback={<PageLoading />}>
        {page === "dashboard" && (
          <Dashboard sessions={sessions} trades={trades} onNav={go} loading={!booted}
            onOpen={(id) => go("sim", id)} onCreate={createSession} onDelete={deleteSession}
            onJoinRoom={joinRoomFromDashboard} />
        )}
        {page === "journal" && (
          <Journal trades={trades} onUpdateTrade={updateTrade} onExport={exportCsv} />
        )}
        {page === "analytics" && <Analytics trades={trades} />}
        {/* Settings reads straight off `account` from its very first render
            (no optional chaining — it's always been guaranteed non-null by
            the auth gate above), so unlike the other pages it can't just be
            handed a null account and left to show its own loading state;
            hold it back until account actually exists. */}
        {page === "settings" && !account && <PageLoading />}
        {page === "settings" && account && (
          <Settings account={account} sessions={sessions} trades={trades}
            onSaveAccount={async (patch) => {
              if (API_ENABLED) {
                const { user } = await api.updateMe(patch);
                setAccount(user);
              } else {
                const next = { ...account, ...patch };
                setAccount(next); await store.set(K.account, next);
              }
            }}
            onChangePassword={(b) => api.changePassword(b)}
            onWipe={wipe} onSignOut={signOut} />
        )}
      </Suspense>
    </Shell>
  );
}

/* Offer to carry browser-local work into a brand new account
   rather than leaving it stranded. */
function ImportModal({ offer, onClose, onImport }) {
  const [busy, setBusy] = useState(false);
  if (!offer) return null;
  return (
    <Modal open onClose={onClose} title="Bring your local work across?" width={470}>
      <p className="sm mut" style={{ lineHeight: 1.7, marginBottom: 18 }}>
        This browser has {offer.sessions} session{offer.sessions === 1 ? "" : "s"} and{" "}
        {offer.trades} trade{offer.trades === 1 ? "" : "s"} saved from before you had an account.
        Import them and they'll follow you to any device. Skip and they stay in this browser only.
      </p>
      <div style={{ display: "flex", gap: 9 }}>
        <button className="btn pri" disabled={busy}
          onClick={async () => { setBusy(true); await onImport(); setBusy(false); }}>
          {busy ? "Importing…" : "Import them"}
        </button>
        <button className="btn" onClick={onClose}>Not now</button>
      </div>
    </Modal>
  );
}
