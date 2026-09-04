/* ============================================================
   data.js — one interface, two backends

   When the API is configured and someone is signed in, data
   lives in Postgres. Otherwise it falls back to localStorage so
   the app still runs — useful for local development and for
   anyone poking around before the backend exists.

   Every page talks to this module, never to fetch or
   localStorage directly.
   ============================================================ */

import { api, API_ENABLED } from "./api.js";
import { store, K } from "./store.js";

let remote = false;
export const useRemote = (v) => { remote = !!v && API_ENABLED; };
export const isRemote = () => remote;

/* ---------- sessions ---------- */
export async function listSessions() {
  if (remote) return (await api.listSessions()).sessions;
  return (await store.get(K.sessions)) || [];
}

export async function saveSession(meta, all) {
  if (remote) { await api.putSession(meta.id, meta); return; }
  await store.set(K.sessions, all);
}

export async function deleteSession(id, remaining, remainingTrades) {
  /* remote: the server cascades the session's trades itself (see
     DELETE /sessions/:id) — one round trip, no separate trades call. */
  if (remote) { await api.deleteSession(id); return; }
  await store.set(K.sessions, remaining);
  await store.del(K.session(id));
  if (remainingTrades) await store.set(K.trades, remainingTrades);
}

export async function getSessionState(id) {
  if (remote) return (await api.getState(id)).state;
  return await store.get(K.session(id));
}

export async function saveSessionState(id, state) {
  if (remote) { await api.putState(id, state); return true; }
  return await store.set(K.session(id), state);
}

/* ---------- trades ---------- */
export async function listTrades() {
  if (remote) return (await api.listTrades()).trades;
  return (await store.get(K.trades)) || [];
}

export async function addTrades(closed, all) {
  if (remote) { await api.addTrades(closed); return; }
  await store.set(K.trades, all);
}

export async function patchTrade(id, patch, all) {
  if (remote) { await api.patchTrade(id, patch); return; }
  await store.set(K.trades, all);
}

/* ---------- rooms ---------- */
export async function roomGet(code) {
  if (!remote) return null;
  try { return (await api.kvGet(`room:${code}`)).value; } catch (e) { return null; }
}
export async function roomPut(code, doc) {
  if (!remote) return false;
  try { await api.kvPut(`room:${code}`, doc); return true; } catch (e) { return false; }
}
/* `patches`: [{ path: ["a","b"], value }] to set a.b, or
   [{ path: ["arr"], append: [...] }] to atomically concatenate onto
   whatever array already lives there, or [{ path: [...], remove: true }]
   to delete a key — all computed server-side against whatever the row
   currently holds, not a client-side read. Returns the doc's new value
   (or null on failure) so a caller can update local state without a
   separate roomGet. */
export async function roomPatch(code, patches) {
  if (!remote) return null;
  try { return (await api.kvPatch(`room:${code}`, patches)).value; } catch (e) { return null; }
}
export async function roomDelete(code) {
  if (!remote) return false;
  /* wipes the whole room doc — including chat — from the kv table */
  try { await api.kvDel(`room:${code}`); return true; } catch (e) { return false; }
}
/* Fire-and-forget participant removal for a tab closing/navigating
   away — see api.kvPatchBeacon for why this can't just be roomPatch. */
export function roomLeaveBeacon(code, handle) {
  if (!remote) return;
  api.kvPatchBeacon(`room:${code}`, [{ path: ["participants", handle], remove: true }]);
}

/* ---------- migration ----------
   When someone signs in for the first time on a browser that has
   local work, offer to carry it across rather than silently
   stranding it. */
export async function localWorkSummary() {
  const sessions = (await store.get(K.sessions)) || [];
  const trades = (await store.get(K.trades)) || [];
  return { sessions: sessions.length, trades: trades.length, has: sessions.length + trades.length > 0 };
}

export async function pushLocalToAccount() {
  const sessions = (await store.get(K.sessions)) || [];
  const trades = (await store.get(K.trades)) || [];
  for (const s of sessions) {
    try {
      await api.putSession(s.id, s);
      const state = await store.get(K.session(s.id));
      if (state) await api.putState(s.id, state);
    } catch (e) { /* keep going; one bad row shouldn't stop the import */ }
  }
  for (let i = 0; i < trades.length; i += 100) {
    try { await api.addTrades(trades.slice(i, i + 100)); } catch (e) {}
  }
  return { sessions: sessions.length, trades: trades.length };
}

export async function clearLocalWork() {
  const sessions = (await store.get(K.sessions)) || [];
  for (const s of sessions) await store.del(K.session(s.id));
  await store.del(K.sessions);
  await store.del(K.trades);
}
