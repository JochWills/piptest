/* ============================================================
   store.js — persistence

   Personal data lives in localStorage; shared room documents go
   to the sync service when VITE_API_URL is configured. Same
   async surface either way so callers don't branch.
   ============================================================ */

const PREFIX = "piptest:";
const API = import.meta.env.VITE_API_URL || "";
export const SHARED_ENABLED = !!API;

const mem = new Map();
const hasLS = (() => {
  try { localStorage.setItem("__pt", "1"); localStorage.removeItem("__pt"); return true; }
  catch (e) { return false; }
})();

const lget = (k) => (hasLS ? localStorage.getItem(PREFIX + k) : mem.get(k) ?? null);
const lset = (k, v) => { hasLS ? localStorage.setItem(PREFIX + k, v) : mem.set(k, v); };
const ldel = (k) => { hasLS ? localStorage.removeItem(PREFIX + k) : mem.delete(k); };

async function remote(method, key, body) {
  const res = await fetch(`${API}/kv/${encodeURIComponent(key)}`, {
    method, headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify({ value: body }) } : {}),
  });
  if (!res.ok) throw new Error(`storage ${method} ${res.status}`);
  if (method === "DELETE") return true;
  return (await res.json())?.value ?? null;
}

export const store = {
  async get(key, shared = false) {
    try {
      if (shared) return SHARED_ENABLED ? await remote("GET", key) : null;
      const raw = lget(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  async set(key, value, shared = false) {
    try {
      if (shared) { if (!SHARED_ENABLED) return false; await remote("PUT", key, value); return true; }
      lset(key, JSON.stringify(value)); return true;
    } catch (e) { return false; }
  },
  async del(key, shared = false) {
    try {
      if (shared) return SHARED_ENABLED ? await remote("DELETE", key) : false;
      ldel(key); return true;
    } catch (e) { return false; }
  },
};

/* ---------- keys ---------- */
export const K = {
  account: "account",
  sessions: "sessions",           // index of session metadata
  session: (id) => `session:${id}`,
  trades: "trades",               // every closed trade, across sessions
  prefs: "prefs",
  room: (code) => `room:${code}`,
  /* Which room a given session was last in — purely local, never
     synced. A room's own kv doc (the shared, authoritative state) is
     fetched fresh on rehydrate; this is only the breadcrumb that says
     "check room X for session Y" before the network round trip that
     confirms it's still real. See Simulator's room-rehydrate effect
     and joinRoomFromDashboard in App.jsx. */
  roomLink: (sessionId) => `roomLink:${sessionId}`,
};

export async function loadAccount() { return store.get(K.account); }
export async function saveAccount(a) { return store.set(K.account, a); }

export async function loadSessions() { return (await store.get(K.sessions)) || []; }
export async function saveSessions(list) { return store.set(K.sessions, list); }

export async function loadTrades() { return (await store.get(K.trades)) || []; }
export async function saveTrades(list) { return store.set(K.trades, list); }
