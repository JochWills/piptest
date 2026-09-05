/* ============================================================
   Piptest API

   Accounts, saved sessions, the trade book, live rooms and the
   admin surface. Postgres-backed so nothing lives only in a
   browser any more.
   ============================================================ */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { migrate, startSweeper, pool } from "./db.js";
import { router } from "./routes.js";
import { attachRoomSocket } from "./ws.js";

const app = express();
const PORT = process.env.PORT || 3001;

/* Render terminates TLS at its proxy, so trust the forwarded
   headers — otherwise every client looks like the same IP and
   the rate limiter throttles everyone at once. */
app.set("trust proxy", 1);

const origins = (process.env.ALLOWED_ORIGIN || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);              // curl, health checks
    if (!origins.length) return cb(null, true);      // unconfigured: allow, but warn on boot
    cb(null, origins.includes(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "up" });
  } catch (e) {
    res.status(503).json({ ok: false, db: "down" });
  }
});

app.use("/api", router);

/* Never leak a stack trace to the client. Reaching this at all now
   depends on routes.js forwarding rejected promises to next() — see the
   wrapper at the top of that file for why Express 4 doesn't do it. */
app.use((err, _req, res, _next) => {
  console.error("unhandled:", err?.message || err);
  if (res.headersSent) return;
  /* body-parser's own errors carry a status (413 for a body over the
     json limit, 400 for malformed JSON); passing those through beats
     reporting "something went wrong" for a request we understood fine. */
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status === 413) {
    return res.status(413).json({ error: "too_large", message: "That request is too large." });
  }
  if (status === 400 && err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "bad_json", message: "That request body isn't valid JSON." });
  }
  res.status(500).json({ error: "server_error", message: "Something went wrong." });
});

/* Backstop, not a strategy. Route-level rejections are forwarded to the
   handler above; this only catches one that escaped from background work
   (the kv sweeper, the room socket's role refresh, a mail send). Node's
   default for an unhandled rejection is to kill the process, which on a
   single instance means every signed-in user and every live room drops
   because of one stray promise somewhere. Logging and staying up is the
   right trade for this app — a genuinely corrupt state still surfaces
   through the logs rather than silently. */
process.on("unhandledRejection", (reason) => {
  console.error("unhandled rejection (kept alive):", reason);
});

const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}
if (!origins.length) console.warn("ALLOWED_ORIGIN is not set — CORS is open. Set it before launch.");

migrate()
  .then(() => {
    startSweeper();
    const server = app.listen(PORT, () => console.log(`Piptest API listening on :${PORT}`));
    /* real-time room relay (bar-by-bar replay sync) rides the same
       HTTP server/port as the REST API — see ws.js for what this
       does and doesn't carry. */
    attachRoomSocket(server);
  })
  .catch((e) => { console.error("migration failed:", e); process.exit(1); });
