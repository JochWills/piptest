/* ============================================================
   ws.js — real-time relay for live rooms

   The `kv`/PATCH routes in routes.js stay the durable source of
   truth for a room (participants, chat, drawings, and a throttled
   copy of symbol/interval/cursor/playing/stepId) — nothing here
   changes that. This is a second, narrower channel just for the
   latency-sensitive part: as the host reveals a bar, it should
   reach every guest's chart the instant it happens, not on the
   next ~1.5s poll. So this module does no persistence of its own
   — it's a pure in-memory fan-out, scoped per room code, relaying
   the host's own messages to everyone else in that room.

   Single Render instance (see render.yaml — no autoscaling), so an
   in-memory Map is enough; nothing here would survive multiple
   instances without a shared broker, which isn't a concern today
   but is the reason to reach for one if that ever changes.
   ============================================================ */

import { WebSocketServer } from "ws";
import { verifyAccess } from "./auth.js";
import { q } from "./db.js";

const origins = (process.env.ALLOWED_ORIGIN || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
/* Duplicated from index.js's cors() config rather than imported —
   an `upgrade` request never runs through Express's normal
   middleware stack, so there's no cors() call to reuse here; this
   is the same allow-list, checked the same way, just done by hand. */
function originAllowed(origin) {
  if (!origin) return true;         // non-browser clients, health probes
  if (!origins.length) return true; // unconfigured: allow, matches cors() above
  return origins.includes(origin);
}

/* "trade" rides the same relay: only ever sent by the host
   (client-side gate — see broadcastTrade in Simulator.jsx), carrying
   their current trade and/or a just-closed record, so a viewer's
   ticket, chart zones and blotter can mirror it live instead of only
   catching up once it lands in the room doc on the next poll. */
const CONTROL_TYPES = new Set(["bar", "market", "play", "pause", "step", "trade"]);
const AUTH_TIMEOUT_MS = 5000;
const ROLE_REFRESH_MS = 5000;
const MSG_RATE_LIMIT = 40;      // per socket, per second — generous above the ~4Hz replay tick
const MAX_PAYLOAD_BYTES = 8 * 1024;

const rooms = new Map(); // code -> Set<ws>

function send(ws, obj) {
  if (ws.readyState !== ws.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

async function loadRole(code, handle) {
  const { rows } = await q("SELECT value->'participants' AS participants FROM kv WHERE key=$1", [`room:${code}`]);
  const info = rows[0]?.participants?.[handle];
  return info ? (info.role || "viewer") : null;
}

function joinRoom(code, ws) {
  let set = rooms.get(code);
  if (!set) { set = new Set(); rooms.set(code, set); }
  set.add(ws);
}

function leaveRoom(code, ws) {
  const set = rooms.get(code);
  if (!set) return;
  set.delete(ws);
  if (!set.size) rooms.delete(code);
}

function relay(sender, msg) {
  const set = rooms.get(sender._code);
  if (!set) return;
  const payload = JSON.stringify(msg);
  for (const ws of set) {
    if (ws === sender || ws.readyState !== ws.OPEN) continue;
    ws.send(payload);
  }
}

/* Keeps every connected socket's cached role current without a
   reconnect — a host kicking a guest mid-session (still a plain
   PATCH /kv/:key today, nothing wired to notify this module
   directly) is reflected here within one of these ticks instead of
   only on the socket's next join, though the guest's own client
   dropping the room the moment its poll notices the same removal
   (see Simulator.jsx) gets there first in practice. Only rooms with
   someone actually connected are worth the query. */
function startRoleRefresh() {
  setInterval(async () => {
    for (const [code, set] of rooms) {
      if (!set.size) continue;
      try {
        const { rows } = await q("SELECT value->'participants' AS participants FROM kv WHERE key=$1", [`room:${code}`]);
        const participants = rows[0]?.participants || {};
        for (const ws of set) {
          const info = participants[ws._handle];
          ws._role = info ? (info.role || "viewer") : null;
        }
      } catch (e) { /* a transient DB hiccup here just means stale roles for one tick */ }
    }
  }, ROLE_REFRESH_MS);
}

/* Dead-connection cleanup — a tab that vanished without a clean
   close (crash, network drop, laptop closed) leaves a socket the
   server thinks is still open until TCP eventually notices, which
   can take a long time. Standard ws ping/pong pattern: if a socket
   didn't answer the last ping, it's gone. */
function startHeartbeat(wss) {
  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { try { ws.terminate(); } catch (e) {} continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (e) {}
    }
  }, 30000);
}

export function attachRoomSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.split("?")[0].replace(/\/+$/, "").endsWith("/ws")) {
      socket.destroy();
      return;
    }
    if (!originAllowed(req.headers.origin)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    let authed = false;
    let msgCount = 0, windowStart = Date.now();
    const authTimer = setTimeout(() => { if (!authed) { try { ws.close(); } catch (e) {} } }, AUTH_TIMEOUT_MS);

    ws.on("message", async (raw) => {
      const now = Date.now();
      if (now - windowStart > 1000) { windowStart = now; msgCount = 0; }
      if (++msgCount > MSG_RATE_LIMIT) { try { ws.close(); } catch (e) {} return; }

      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "auth") {
        const claims = typeof msg.token === "string" ? verifyAccess(msg.token) : null;
        if (!claims) { try { ws.close(); } catch (e) {} return; }
        authed = true;
        ws._handle = claims.handle;
        clearTimeout(authTimer);
        send(ws, { type: "auth_ok" });
        return;
      }
      if (!authed) return;

      if (msg.type === "join") {
        const code = typeof msg.code === "string" ? msg.code.toUpperCase() : "";
        if (!/^[A-Z0-9]{6}$/.test(code)) { send(ws, { type: "join_err" }); return; }
        const role = await loadRole(code, ws._handle);
        if (!role) { send(ws, { type: "join_err" }); return; }
        if (ws._code) leaveRoom(ws._code, ws);
        ws._code = code;
        ws._role = role;
        joinRoom(code, ws);
        send(ws, { type: "joined", code, role });
        return;
      }

      if (msg.type === "ping") { send(ws, { type: "pong" }); return; }

      if (!ws._code) return; // must join before anything else is meaningful
      if (CONTROL_TYPES.has(msg.type)) {
        if (ws._role !== "host") return; // server-side enforcement — the client's own canControl gate isn't trusted alone
        relay(ws, msg);
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (ws._code) leaveRoom(ws._code, ws);
    });
  });

  startHeartbeat(wss);
  startRoleRefresh();
  return wss;
}
