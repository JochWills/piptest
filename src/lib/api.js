/* ============================================================
   api.js — talks to the PipTest API

   The access token is kept in a module variable, never in
   localStorage: script injected into the page can read storage,
   but not a closure. It's short-lived and silently renewed from
   the httpOnly refresh cookie.
   ============================================================ */

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const API_ENABLED = !!BASE;

let accessToken = null;
let refreshing = null;                 // de-dupes concurrent refreshes
const listeners = new Set();

export const onAuthLost = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const authLost = () => listeners.forEach((f) => { try { f(); } catch (e) {} });

export const setToken = (t) => { accessToken = t; };
export const getToken = () => accessToken;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
    this.errors = body?.errors;
  }
}
export { ApiError };

async function raw(path, { method = "GET", body, auth = true, retry = true } = {}) {
  if (!BASE) throw new ApiError(0, { message: "The API isn't configured for this build." });
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(BASE + path, {
    method, headers,
    credentials: "include",             // carries the refresh cookie
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  /* one silent refresh-and-retry on expiry */
  if (res.status === 401 && auth && retry && path !== "/api/auth/refresh") {
    const ok = await refresh();
    if (ok) return raw(path, { method, body, auth, retry: false });
    authLost();
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/* Render's free tier sleeps the API after 15 minutes idle — the same
   15 minutes the access token lives for. So the ordinary case of
   "stepped away for a bit, came back" reliably lands both at once:
   the token's expired AND the server's cold, needing 30-50s to wake.
   A network-level failure here (fetch throwing, not the server
   answering with a real rejection) is that wake-up in progress, not
   an invalid session — so it's retried with backoff generous enough
   to ride out a cold start, rather than an instant, wrong logout. */
const REFRESH_RETRY_DELAYS_MS = [3000, 6000, 12000, 20000];

export async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          res = await fetch(BASE + "/api/auth/refresh", { method: "POST", credentials: "include" });
        } catch (e) {
          /* the request never completed — likely a cold start or a
             blip, not the server saying no */
          if (attempt >= REFRESH_RETRY_DELAYS_MS.length) { accessToken = null; return false; }
          await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (!res.ok) {
          /* a real answer, just not a good one — try again a couple of
             times too (a cold start can also surface as a 502/503 from
             Render's proxy while the app finishes booting), but a
             genuine 401 (invalid/expired refresh token) won't change
             on retry, so don't burn the whole backoff budget on it */
          if (res.status !== 401 && attempt < REFRESH_RETRY_DELAYS_MS.length) {
            await new Promise((r) => setTimeout(r, REFRESH_RETRY_DELAYS_MS[attempt]));
            continue;
          }
          accessToken = null;
          return false;
        }
        const d = await res.json();
        accessToken = d.accessToken;
        return d.user || true;
      }
    } finally { refreshing = null; }
  })();
  return refreshing;
}

export const api = {
  /* auth */
  register: (b) => raw("/api/auth/register", { method: "POST", body: b, auth: false }),
  login:    (b) => raw("/api/auth/login",    { method: "POST", body: b, auth: false }),
  logout:   ()  => raw("/api/auth/logout",   { method: "POST", auth: false }),
  forgot:   (b) => raw("/api/auth/forgot",   { method: "POST", body: b, auth: false }),
  checkReset: (t) => raw(`/api/auth/reset/${encodeURIComponent(t)}`, { auth: false }),
  resetPassword: (b) => raw("/api/auth/reset", { method: "POST", body: b, auth: false }),
  me:       ()  => raw("/api/me"),
  updateMe: (b) => raw("/api/me", { method: "PATCH", body: b }),
  changePassword: (b) => raw("/api/me/password", { method: "POST", body: b }),
  deleteMe: ()  => raw("/api/me", { method: "DELETE" }),

  /* sessions */
  listSessions:  ()      => raw("/api/sessions"),
  putSession:    (id, s) => raw(`/api/sessions/${id}`, { method: "PUT", body: s }),
  deleteSession: (id)    => raw(`/api/sessions/${id}`, { method: "DELETE" }),
  getState:      (id)    => raw(`/api/sessions/${id}/state`),
  putState:      (id, s) => raw(`/api/sessions/${id}/state`, { method: "PUT", body: { state: s } }),

  /* trades */
  listTrades:  ()        => raw("/api/trades"),
  addTrades:   (trades)  => raw("/api/trades", { method: "POST", body: { trades } }),
  patchTrade:  (id, b)   => raw(`/api/trades/${id}`, { method: "PATCH", body: b }),

  /* market data — forex & index ETFs (see server/twelvedata.js for why
     this one goes through our own API instead of being fetched
     client-side like the Binance-sourced crypto candles are) */
  twelveDataCandles: (symbol, interval, from, to) =>
    raw(`/api/market/twelvedata/candles?symbol=${symbol}&interval=${interval}&from=${from}&to=${to}`),

  /* rooms */
  kvGet: (k)      => raw(`/api/kv/${encodeURIComponent(k)}`),
  kvPut: (k, v)   => raw(`/api/kv/${encodeURIComponent(k)}`, { method: "PUT", body: { value: v } }),
  kvDel: (k)      => raw(`/api/kv/${encodeURIComponent(k)}`, { method: "DELETE" }),

  /* admin */
  adminOverview: ()   => raw("/api/admin/overview"),
  adminUsers:    (qs) => raw(`/api/admin/users?${new URLSearchParams(qs)}`),
  adminPatchUser:(id, b) => raw(`/api/admin/users/${id}`, { method: "PATCH", body: b }),
  adminEvents:   (limit = 60) => raw(`/api/admin/events?limit=${limit}`),
};
