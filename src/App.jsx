import React, { useState, useEffect, useCallback, useMemo } from "react";
import { THEMES, cssVars, DEFAULT_TAGS } from "./theme.js";
import { GLOBAL_CSS, Modal } from "./components/ui.jsx";
import Shell from "./components/Shell.jsx";
import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Simulator from "./pages/Simulator.jsx";
import Journal from "./pages/Journal.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import { store, K } from "./lib/store.js";
import { api, API_ENABLED, setToken, refresh, onAuthLost } from "./lib/api.js";
import * as data from "./lib/data.js";
import { fmtShort } from "./lib/trading.js";

/* ============================================================
   App — routing, session and the state that spans pages

   Accounts live in Postgres when VITE_API_URL is configured.
   Without it the app still runs against localStorage, so local
   development and the current deploy keep working.
   ============================================================ */

const ROUTES = ["home", "auth", "sim", "dashboard", "journal", "analytics", "settings"];

const parseHash = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  if (!ROUTES.includes(page)) return { page: "", arg: null };
  return { page, arg: arg || null };
};

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [booted, setBooted] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [account, setAccount] = useState(null);
  const [authMode, setAuthMode] = useState("signup");
  const [sessions, setSessions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [importOffer, setImportOffer] = useState(null);

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
    (async () => {
      const prefs = await store.get(K.prefs);
      if (prefs?.theme) setTheme(prefs.theme);
      if (Array.isArray(prefs?.tags) && prefs.tags.length) setTags(prefs.tags);

      if (API_ENABLED) {
        /* the refresh cookie survives a reload — try to resume silently */
        const user = await refresh();
        if (user && typeof user === "object") {
          setAccount(user);
          data.useRemote(true);
          await loadData();
        } else {
          data.useRemote(false);
          setSessions((await store.get(K.sessions)) || []);
          setTrades((await store.get(K.trades)) || []);
        }
      } else {
        const local = await store.get(K.account);
        if (local) setAccount(local);
        data.useRemote(false);
        setSessions((await store.get(K.sessions)) || []);
        setTrades((await store.get(K.trades)) || []);
      }
      setBooted(true);
    })();
  }, [loadData]);

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

  const deleteSession = async (id) => {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next);
    await data.deleteSession(id, next);
  };

  const patchSession = useCallback((id, patch) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s));
      const meta = next.find((s) => s.id === id);
      if (meta) data.saveSession(meta, next);
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
      "qty", "risk_pct", "risk_amt", "r", "pnl", "exit_reason", "tags", "note"];
    const rows = trades.map((t) => [
      fmtShort(t.closedTs || t.closedAt), t.symbol, t.interval, t.dir,
      t.entry, t.exit, t.stop, t.target ?? "", t.qty, t.riskPct ?? "", t.riskAmt ?? "",
      (t.r ?? 0).toFixed(4), (t.pnl ?? 0).toFixed(2), t.reason,
      (t.tags || []).join("|"), (t.note || "").replace(/[\r\n]+/g, " "),
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

  /* ---------- render ---------- */
  if (!booted) {
    return (
      <div className="pt" style={vars}><style>{GLOBAL_CSS}</style>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }}>Loading…</div>
      </div>
    );
  }

  const wrap = (children) => (
    <div className="pt" style={vars}>
      <style>{GLOBAL_CSS}</style>
      {children}
      <ImportModal offer={importOffer} onClose={() => setImportOffer(null)} onImport={async () => {
        const r = await data.pushLocalToAccount();
        await data.clearLocalWork();
        await loadData();
        setImportOffer(null);
        alert(`Brought across ${r.sessions} session${r.sessions === 1 ? "" : "s"} and ${r.trades} trade${r.trades === 1 ? "" : "s"}.`);
      }} />
    </div>
  );

  if (!route.page || route.page === "home") {
    return wrap(
      <Landing
        theme={theme} T={T} onToggleTheme={toggleTheme}
        account={account} onSignOut={signOut} onNav={go}
        onGetStarted={() => { if (account) go("dashboard"); else { setAuthMode("signup"); go("auth"); } }}
        onSignIn={() => { if (account) go("dashboard"); else { setAuthMode("signin"); go("auth"); } }}
      />
    );
  }

  if (route.page === "auth" || !account) {
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
    if (!meta) { go("dashboard"); return null; }
    return wrap(
      <Simulator
        key={meta.id} meta={meta} account={account} theme={theme} T={T} tags={tags}
        onExit={() => go("dashboard")} onSaveSession={patchSession}
        onTradesClosed={onTradesClosed} onToggleTheme={toggleTheme}
      />
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
      {page === "dashboard" && (
        <Dashboard sessions={sessions} trades={trades} onNav={go}
          onOpen={(id) => go("sim", id)} onCreate={createSession} onDelete={deleteSession} />
      )}
      {page === "journal" && (
        <Journal trades={trades} tags={tags} onUpdateTrade={updateTrade} onExport={exportCsv} />
      )}
      {page === "analytics" && <Analytics trades={trades} />}
      {page === "settings" && (
        <Settings account={account} sessions={sessions} trades={trades} tags={tags}
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
          onSaveTags={(t) => { setTags(t); savePrefs({ tags: t }); }}
          onWipe={wipe} onSignOut={signOut} />
      )}
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
