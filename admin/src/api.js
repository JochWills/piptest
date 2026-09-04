/* ============================================================
   api.js — console client

   Same auth flow as the main app: a short-lived access token
   held in memory, silently renewed from the httpOnly refresh
   cookie. Nothing sensitive touches localStorage.
   ============================================================ */

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const API_ENABLED = !!BASE;

let accessToken = null;
let refreshing = null;

export const setToken = (t) => { accessToken = t; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error;
  }
}

async function raw(path, { method = "GET", body, auth = true, retry = true } = {}) {
  if (!BASE) throw new ApiError(0, { message: "VITE_API_URL isn't set for this build." });
  const headers = { "Content-Type": "application/json" };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(BASE + path, {
    method, headers, credentials: "include",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && auth && retry && path !== "/api/auth/refresh") {
    if (await refresh()) return raw(path, { method, body, auth, retry: false });
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch(BASE + "/api/auth/refresh", { method: "POST", credentials: "include" });
      if (!r.ok) { accessToken = null; return null; }
      const d = await r.json();
      accessToken = d.accessToken;
      return d.user || null;
    } catch (e) { accessToken = null; return null; }
    finally { refreshing = null; }
  })();
  return refreshing;
}

export const api = {
  login:  (b) => raw("/api/auth/login", { method: "POST", body: b, auth: false }),
  logout: ()  => raw("/api/auth/logout", { method: "POST", auth: false }),
  me:     ()  => raw("/api/me"),

  overview:   ()      => raw("/api/admin/overview"),
  users:      (qs)    => raw(`/api/admin/users?${new URLSearchParams(qs)}`),
  user:       (id)    => raw(`/api/admin/users/${id}`),
  patchUser:  (id, b) => raw(`/api/admin/users/${id}`, { method: "PATCH", body: b }),
  deleteUser: (id)    => raw(`/api/admin/users/${id}`, { method: "DELETE" }),
  events:     (n = 80)=> raw(`/api/admin/events?limit=${n}`),
  orphanedTrades:      () => raw("/api/admin/orphaned-trades"),
  purgeOrphanedTrades: () => raw("/api/admin/orphaned-trades/purge", { method: "POST" }),
  health:     ()      => fetch(BASE + "/healthz").then((r) => r.json()).catch(() => ({ ok: false })),
};
