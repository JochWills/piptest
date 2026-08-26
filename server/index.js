/* ============================================================
   PipTest API

   Accounts, saved sessions, the trade book, live rooms and the
   admin surface. Postgres-backed so nothing lives only in a
   browser any more.
   ============================================================ */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { migrate, startSweeper, pool } from "./db.js";
import { router } from "./routes.js";

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

/* Never leak a stack trace to the client. */
app.use((err, _req, res, _next) => {
  console.error("unhandled:", err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: "server_error", message: "Something went wrong." });
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
    app.listen(PORT, () => console.log(`PipTest API listening on :${PORT}`));
  })
  .catch((e) => { console.error("migration failed:", e); process.exit(1); });
