/* ============================================================
   storage.js

   In the Claude artifact sandbox the app used window.storage,
   which does not exist on the open web. This module provides the
   same async interface backed by:

   · personal data  -> localStorage (per browser, no server)
   · shared data    -> your API, if VITE_API_URL is set

   Shared data is what live rooms use. Without a backend, rooms
   are disabled and the UI says so — see SHARED_ENABLED.
   ============================================================ */

const PREFIX = "piptest:";
const API = import.meta.env.VITE_API_URL || "";
export const SHARED_ENABLED = !!API;

const memory = new Map();
const hasLS = (() => {
  try { localStorage.setItem("__pc_probe", "1"); localStorage.removeItem("__pc_probe"); return true; }
  catch (e) { return false; }
})();

const localGet = (k) => (hasLS ? localStorage.getItem(PREFIX + k) : memory.get(k) ?? null);
const localSet = (k, v) => { hasLS ? localStorage.setItem(PREFIX + k, v) : memory.set(k, v); };
const localDel = (k) => { hasLS ? localStorage.removeItem(PREFIX + k) : memory.delete(k); };

async function remote(method, key, body) {
  if (!API) return null;
  const res = await fetch(`${API}/kv/${encodeURIComponent(key)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify({ value: body }) } : {}),
  });
  if (!res.ok) throw new Error(`storage ${method} ${res.status}`);
  if (method === "DELETE") return true;
  const json = await res.json();
  return json?.value ?? null;
}

export const store = {
  ok: () => true,
  sharedOk: () => SHARED_ENABLED,

  async get(key, shared = false) {
    try {
      if (shared) return SHARED_ENABLED ? await remote("GET", key) : null;
      const raw = localGet(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  async set(key, value, shared = false) {
    try {
      if (shared) {
        if (!SHARED_ENABLED) return false;
        await remote("PUT", key, value);
        return true;
      }
      localSet(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  },

  async del(key, shared = false) {
    try {
      if (shared) return SHARED_ENABLED ? await remote("DELETE", key) : false;
      localDel(key);
      return true;
    } catch (e) { return false; }
  },
};
