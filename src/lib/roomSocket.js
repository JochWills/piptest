/* ============================================================
   roomSocket.js — real-time room relay client

   Thin wrapper around a WebSocket connection to the API's /ws
   endpoint (see server/ws.js) for the latency-sensitive slice of
   room state: replay cursor/bars, play/pause, symbol/interval/step.
   Everything else about a room (chat, participants, drawings) stays
   on the existing polling/PATCH path in data.js — this is purely an
   additive fast path. It reconnects on its own if it drops, and
   nothing in Simulator.jsx depends on it actually being connected:
   the room poll there keeps running unmodified as the fallback, so
   a blocked or dropped socket just means falling back to the
   already-shipped polling behavior, never a broken room.
   ============================================================ */

import { API_ENABLED, getToken } from "./api.js";

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15000];
/* An idle WebSocket — long stretches with nothing to say, e.g. the
   host paused — can get silently dropped by a proxy sitting between
   the browser and Render's server well before either side's own
   protocol-level ping/pong would notice; exactly what turns into a
   guest's chart repeatedly falling back to the poll's jumpTo
   correction and back, which looks like it's constantly resyncing.
   A small actual data frame on a real interval is the reliable fix
   regardless of which proxy or timeout is involved — see the
   matching "ping" handling in server/ws.js. */
const KEEPALIVE_MS = 20000;

function wsUrl() {
  const http = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  return http ? http.replace(/^http/, "ws") + "/ws" : "";
}

/* onOpen fires once the socket is authenticated AND has actually
   joined `code` — that's the point at which sending/receiving room
   messages is meaningful, not just once the TCP connection is up. */
export function connectRoomSocket(code, { onOpen, onMessage, onClose } = {}) {
  const url = API_ENABLED ? wsUrl() : "";
  if (!url) return { send() {}, isOpen: () => false, close() {} };

  let ws = null, dead = false, attempt = 0, reconnectTimer = null, joined = false, keepaliveTimer = null;

  const open = () => {
    if (dead) return;
    try { ws = new WebSocket(url); } catch (e) { return; }

    ws.onopen = () => {
      attempt = 0;
      const token = getToken();
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "auth_ok") { ws.send(JSON.stringify({ type: "join", code })); return; }
      if (msg.type === "joined") {
        joined = true;
        clearInterval(keepaliveTimer);
        keepaliveTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send('{"type":"ping"}'); } catch (e) {} }
        }, KEEPALIVE_MS);
        onOpen && onOpen();
        return;
      }
      if (msg.type === "join_err") { try { ws.close(); } catch (e) {} return; }
      if (msg.type === "pong") return;
      onMessage && onMessage(msg);
    };
    ws.onclose = () => {
      joined = false;
      clearInterval(keepaliveTimer);
      onClose && onClose();
      if (dead) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
      attempt++;
      reconnectTimer = setTimeout(open, delay);
    };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  };
  open();

  return {
    send(msg) {
      if (!joined || !ws || ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify(msg)); } catch (e) {}
    },
    isOpen: () => joined && !!ws && ws.readyState === WebSocket.OPEN,
    close() {
      dead = true;
      clearTimeout(reconnectTimer);
      clearInterval(keepaliveTimer);
      if (ws) { try { ws.close(); } catch (e) {} }
    },
  };
}
