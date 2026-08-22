import React, { useState, useEffect, useCallback, useMemo } from "react";
import { THEMES, cssVars, DEFAULT_TAGS } from "./theme.js";
import { GLOBAL_CSS } from "./components/ui.jsx";
import Shell from "./components/Shell.jsx";
import Landing from "./pages/Landing.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Simulator from "./pages/Simulator.jsx";
import Journal from "./pages/Journal.jsx";
import Analytics from "./pages/Analytics.jsx";
import Settings from "./pages/Settings.jsx";
import { store, K, loadAccount, saveAccount, loadSessions, saveSessions, loadTrades, saveTrades } from "./lib/store.js";
import { fmtShort } from "./lib/trading.js";

/* ============================================================
   App — routing plus the state that spans pages

   Hash routing keeps this dependency-free and survives a
   refresh: #/dashboard, #/sim/<id>, #/journal, #/analytics,
   #/settings.
   ============================================================ */

const parseHash = () => {
  const h = (window.location.hash || "").replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  return { page: page || "", arg: arg || null };
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

  const T = THEMES[theme];
  const vars = useMemo(() => cssVars(T), [T]);

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

  useEffect(() => {
    (async () => {
      const prefs = await store.get(K.prefs);
      if (prefs?.theme) setTheme(prefs.theme);
      if (Array.isArray(prefs?.tags) && prefs.tags.length) setTags(prefs.tags);
      const a = await loadAccount();
      if (a) setAccount(a);
      setSessions(await loadSessions());
      setTrades(await loadTrades());
      setBooted(true);
    })();
  }, []);

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

  /* ---------- data actions ---------- */
  const createSession = async (s) => {
    const meta = { ...s, stats: { count: 0, curve: [] } };
    const next = [meta, ...sessions];
    setSessions(next); await saveSessions(next);
    await store.set(K.session(s.id), { id: s.id, cursor: 100, trades: [], trade: null, drawings: [], notes: "" });
    go("sim", s.id);
  };

  const deleteSession = async (id) => {
    const next = sessions.filter((s) => s.id !== id);
    setSessions(next); await saveSessions(next);
    await store.del(K.session(id));
  };

  const patchSession = useCallback((id, patch) => {
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s));
      saveSessions(next);
      return next;
    });
  }, []);

  /* closed trades roll into the global book that Journal and Analytics read */
  const onTradesClosed = useCallback((closed) => {
    setTrades((prev) => {
      const next = [...closed, ...prev];
      saveTrades(next);
      return next;
    });
  }, []);

  const updateTrade = useCallback((id, patch) => {
    setTrades((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      saveTrades(next);
      return next;
    });
  }, []);

  const exportCsv = () => {
    const head = ["closed", "market", "timeframe", "side", "entry", "exit", "stop", "target",
      "qty", "risk_pct", "risk_amt", "r", "pnl", "exit_reason", "tags", "note"];
    const rows = trades.map((t) => [
      fmtShort(t.closedTs || t.closedAt), t.symbol, t.interval, t.dir,
      t.entry, t.exit, t.stop, t.target ?? "", t.qty, t.riskPct ?? "", t.riskAmt ?? "",
      (t.r ?? 0).toFixed(4), t.pnl.toFixed(2), t.reason,
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
    for (const s of sessions) await store.del(K.session(s.id));
    await store.del(K.sessions); await store.del(K.trades); await store.del(K.account);
    setSessions([]); setTrades([]); setAccount(null);
    go("");
  };

  if (!booted) {
    return (
      <div className="pt" style={vars}><style>{GLOBAL_CSS}</style>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--dim)" }}>Loading…</div>
      </div>
    );
  }

  const wrap = (children) => <div className="pt" style={vars}><style>{GLOBAL_CSS}</style>{children}</div>;

  if (!route.page || route.page === "home") {
    return wrap(
      <Landing
        theme={theme} T={T} onToggleTheme={toggleTheme}
        onGetStarted={() => { if (account) go("dashboard"); else { setAuthMode("signup"); go("auth"); } }}
        onSignIn={() => { if (account) go("dashboard"); else { setAuthMode("signin"); go("auth"); } }}
      />
    );
  }

  if (route.page === "auth" || !account) {
    return wrap(
      <Auth
        mode={authMode}
        onSwitch={() => setAuthMode((m) => (m === "signup" ? "signin" : "signup"))}
        onBack={() => go("")}
        onDone={async (a) => { setAccount(a); await saveAccount(a); go("dashboard"); }}
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
      account={account} theme={theme} onToggleTheme={toggleTheme} onSignOut={() => go("")}
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
          onSaveAccount={async (a) => { setAccount(a); await saveAccount(a); }}
          onSaveTags={(t) => { setTags(t); savePrefs({ tags: t }); }}
          onWipe={wipe} />
      )}
    </Shell>
  );
}
