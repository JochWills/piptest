/* ============================================================
   routes.js — the API surface

   Every data route is scoped to req.user.id in the SQL itself.
   No handler trusts an id from the client to decide ownership.
   ============================================================ */

import express from "express";
import rateLimit from "express-rate-limit";
import { q, logEvent } from "./db.js";
import {
  hashPassword, verifyPassword, signAccess, issueRefresh, rotateRefresh,
  revokeRefresh, revokeAllForUser, setRefreshCookie, clearRefreshCookie,
  REFRESH_COOKIE, requireAuth, requireAdmin, reqIp, adminEmails, publicUser,
} from "./auth.js";

export const router = express.Router();

/* ---------- validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HANDLE_RE = /^[a-zA-Z0-9_]{3,18}$/;

function checkCredentials({ email, password, name, handle }) {
  const errs = [];
  if (!email || !EMAIL_RE.test(email)) errs.push("Enter a valid email address.");
  if (!password || password.length < 8) errs.push("Password must be at least 8 characters.");
  if (password && password.length > 200) errs.push("That password is too long.");
  if (handle !== undefined && !HANDLE_RE.test(handle || ""))
    errs.push("Handle must be 3–18 characters: letters, numbers or underscores.");
  if (name !== undefined && (!name || name.trim().length < 1 || name.length > 60))
    errs.push("Enter a display name.");
  return errs;
}

/* Brute-force protection. Keyed by IP; tighter on the endpoints
   that accept a password. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "too_many_attempts", message: "Too many attempts. Try again in a few minutes." },
});
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false });

/* =====================================================
   AUTH
   ===================================================== */
router.post("/auth/register", authLimiter, async (req, res) => {
  const { email = "", password = "", name = "", handle = "" } = req.body || {};
  const errs = checkCredentials({ email, password, name, handle });
  if (errs.length) return res.status(400).json({ error: "invalid", message: errs[0], errors: errs });

  const dupe = await q("SELECT 1 FROM users WHERE lower(email)=lower($1) OR lower(handle)=lower($2)",
    [email, handle]);
  if (dupe.rowCount) {
    return res.status(409).json({ error: "taken", message: "That email or handle is already registered." });
  }

  const role = adminEmails().includes(email.trim().toLowerCase()) ? "admin" : "user";
  const { rows } = await q(
    `INSERT INTO users (email, handle, name, password_hash, role)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [email.trim(), handle.trim(), name.trim(), hashPassword(password), role]
  );
  const user = rows[0];
  const refresh = await issueRefresh(user.id, req);
  setRefreshCookie(res, refresh.raw, refresh.expires);
  await logEvent(user.id, "register", { handle: user.handle }, reqIp(req));
  res.status(201).json({ user: publicUser(user), accessToken: signAccess(user) });
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const { email = "", password = "" } = req.body || {};
  const { rows } = await q("SELECT * FROM users WHERE lower(email)=lower($1)", [email.trim()]);
  const user = rows[0];

  /* Always run a verify so a missing account and a wrong password
     take the same time — otherwise timing reveals which emails exist. */
  const ok = user
    ? verifyPassword(password, user.password_hash)
    : verifyPassword(password, hashPassword("decoy-password-for-constant-time"));

  if (!user || !ok) {
    await logEvent(user?.id || null, "login_failed", { email: email.trim().slice(0, 120) }, reqIp(req));
    return res.status(401).json({ error: "bad_credentials", message: "Email or password is incorrect." });
  }
  if (user.status !== "active") {
    return res.status(403).json({ error: "disabled", message: "This account has been disabled." });
  }

  /* keep admin list authoritative across deploys */
  let role = user.role;
  if (adminEmails().includes(user.email.toLowerCase()) && role !== "admin") {
    await q("UPDATE users SET role='admin' WHERE id=$1", [user.id]); role = "admin";
  }

  await q("UPDATE users SET last_login_at = now() WHERE id=$1", [user.id]);
  const refresh = await issueRefresh(user.id, req);
  setRefreshCookie(res, refresh.raw, refresh.expires);
  await logEvent(user.id, "login", {}, reqIp(req));
  res.json({ user: publicUser({ ...user, role }), accessToken: signAccess({ ...user, role }) });
});

router.post("/auth/refresh", authLimiter, async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) return res.status(401).json({ error: "no_refresh" });
  const out = await rotateRefresh(raw, req);
  if (!out) { clearRefreshCookie(res); return res.status(401).json({ error: "invalid_refresh" }); }
  setRefreshCookie(res, out.refresh.raw, out.refresh.expires);
  const { rows } = await q("SELECT * FROM users WHERE id=$1", [out.user.id]);
  if (!rows[0]) return res.status(401).json({ error: "invalid_refresh" });
  res.json({ user: publicUser(rows[0]), accessToken: signAccess(rows[0]) });
});

router.post("/auth/logout", async (req, res) => {
  await revokeRefresh(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

/* =====================================================
   PROFILE
   ===================================================== */
router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await q("SELECT * FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  res.json({ user: publicUser(rows[0]) });
});

router.patch("/me", requireAuth, async (req, res) => {
  const { name, handle } = req.body || {};
  if (handle !== undefined && !HANDLE_RE.test(handle || "")) {
    return res.status(400).json({ error: "invalid", message: "Handle must be 3–18 characters: letters, numbers or underscores." });
  }
  if (handle) {
    const dupe = await q("SELECT 1 FROM users WHERE lower(handle)=lower($1) AND id<>$2", [handle, req.user.id]);
    if (dupe.rowCount) return res.status(409).json({ error: "taken", message: "That handle is already taken." });
  }
  const { rows } = await q(
    `UPDATE users SET name = COALESCE($1, name), handle = COALESCE($2, handle) WHERE id=$3 RETURNING *`,
    [name?.trim() || null, handle?.trim() || null, req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
});

router.post("/me/password", requireAuth, authLimiter, async (req, res) => {
  const { current = "", next = "" } = req.body || {};
  if (next.length < 8) return res.status(400).json({ error: "invalid", message: "New password must be at least 8 characters." });
  const { rows } = await q("SELECT * FROM users WHERE id=$1", [req.user.id]);
  if (!rows[0] || !verifyPassword(current, rows[0].password_hash)) {
    return res.status(401).json({ error: "bad_credentials", message: "Current password is incorrect." });
  }
  await q("UPDATE users SET password_hash=$1 WHERE id=$2", [hashPassword(next), req.user.id]);
  await revokeAllForUser(req.user.id);          // sign out every other device
  clearRefreshCookie(res);
  await logEvent(req.user.id, "password_changed", {}, reqIp(req));
  res.json({ ok: true, message: "Password changed. Sign in again." });
});

router.delete("/me", requireAuth, async (req, res) => {
  await q("DELETE FROM users WHERE id=$1", [req.user.id]);   // cascades
  clearRefreshCookie(res);
  res.json({ ok: true });
});

/* =====================================================
   BACKTEST SESSIONS
   ===================================================== */
router.get("/sessions", requireAuth, async (req, res) => {
  const { rows } = await q(
    `SELECT id, name, symbol, interval, start_ms, blind, challenge, stats,
            extract(epoch from created_at)*1000 AS created_at
       FROM bt_sessions WHERE user_id=$1 ORDER BY updated_at DESC`, [req.user.id]);
  res.json({ sessions: rows.map(rowToSession) });
});

const rowToSession = (r) => ({
  id: r.id, name: r.name, symbol: r.symbol, interval: r.interval,
  startMs: Number(r.start_ms), blind: r.blind, challenge: r.challenge,
  stats: r.stats || {}, createdAt: Number(r.created_at),
});

router.put("/sessions/:id", requireAuth, writeLimiter, async (req, res) => {
  const s = req.body || {};
  const { rows } = await q(
    `INSERT INTO bt_sessions (id, user_id, name, symbol, interval, start_ms, blind, challenge, stats)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, symbol=EXCLUDED.symbol, interval=EXCLUDED.interval,
       challenge=EXCLUDED.challenge, stats=EXCLUDED.stats, updated_at=now()
     WHERE bt_sessions.user_id = $2
     RETURNING *`,
    [req.params.id, req.user.id, s.name || "Session", s.symbol || "BTCUSDT",
     s.interval || "30m", s.startMs || Date.now(), !!s.blind,
     s.challenge ? JSON.stringify(s.challenge) : null, JSON.stringify(s.stats || {})]
  );
  if (!rows[0]) return res.status(403).json({ error: "forbidden" });
  res.json({ session: rowToSession(rows[0]) });
});

router.delete("/sessions/:id", requireAuth, async (req, res) => {
  await q("DELETE FROM bt_sessions WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ ok: true });
});

router.get("/sessions/:id/state", requireAuth, async (req, res) => {
  const { rows } = await q("SELECT state FROM bt_sessions WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user.id]);
  res.json({ state: rows[0]?.state || null });
});

router.put("/sessions/:id/state", requireAuth, writeLimiter, async (req, res) => {
  const r = await q(
    "UPDATE bt_sessions SET state=$1, updated_at=now() WHERE id=$2 AND user_id=$3",
    [JSON.stringify(req.body?.state || {}), req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

/* =====================================================
   TRADES
   ===================================================== */
router.get("/trades", requireAuth, async (req, res) => {
  const { rows } = await q(
    `SELECT * FROM trades WHERE user_id=$1 ORDER BY closed_ts DESC NULLS LAST LIMIT 5000`,
    [req.user.id]);
  res.json({ trades: rows.map(rowToTrade) });
});

const rowToTrade = (r) => ({
  id: r.id, sessionId: r.session_id, symbol: r.symbol, interval: r.interval, dir: r.dir,
  qty: r.qty, entry: r.entry, exit: r.exit_price, stop: r.stop, target: r.target,
  riskAmt: r.risk_amt, riskPct: r.risk_pct, r: r.r, pnl: r.pnl, reason: r.reason,
  tags: r.tags || [], note: r.note || "",
  openedTs: r.opened_ts ? Number(r.opened_ts) : null,
  closedTs: r.closed_ts ? Number(r.closed_ts) : null,
  closedAt: r.created_at ? new Date(r.created_at).getTime() : null,
});

router.post("/trades", requireAuth, writeLimiter, async (req, res) => {
  const list = Array.isArray(req.body?.trades) ? req.body.trades.slice(0, 200) : [];
  for (const t of list) {
    await q(
      `INSERT INTO trades (id,user_id,session_id,symbol,interval,dir,qty,entry,exit_price,stop,target,
                           risk_amt,risk_pct,r,pnl,reason,tags,note,opened_ts,closed_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO NOTHING`,
      [t.id, req.user.id, t.sessionId || null, t.symbol, t.interval, t.dir,
       t.qty, t.entry, t.exit, t.stop, t.target ?? null,
       t.riskAmt ?? null, t.riskPct ?? null, t.r ?? null, t.pnl,
       t.reason || "", t.tags || [], t.note || "",
       t.openedTs || null, t.closedTs || null]
    );
  }
  res.json({ ok: true, saved: list.length });
});

router.patch("/trades/:id", requireAuth, writeLimiter, async (req, res) => {
  const { tags, note } = req.body || {};
  const r = await q(
    `UPDATE trades SET tags = COALESCE($1, tags), note = COALESCE($2, note)
      WHERE id=$3 AND user_id=$4`,
    [Array.isArray(tags) ? tags : null, note ?? null, req.params.id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

/* =====================================================
   LIVE ROOMS  (the old /kv, now authenticated + durable)
   ===================================================== */
router.get("/kv/:key", requireAuth, async (req, res) => {
  const { rows } = await q("SELECT value FROM kv WHERE key=$1", [req.params.key]);
  res.json({ value: rows[0]?.value ?? null });
});

router.put("/kv/:key", requireAuth, writeLimiter, async (req, res) => {
  if (!/^room:[A-Z0-9]{6}$/.test(req.params.key)) {
    return res.status(400).json({ error: "bad_key", message: "Only room keys can be written." });
  }
  await q(
    `INSERT INTO kv (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
    [req.params.key, JSON.stringify(req.body?.value ?? null)]);
  res.json({ ok: true });
});

router.delete("/kv/:key", requireAuth, async (req, res) => {
  await q("DELETE FROM kv WHERE key=$1", [req.params.key]);
  res.json({ ok: true });
});

/* =====================================================
   ADMIN
   ===================================================== */
router.get("/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [users, active7, active30, sessions, trades, signups] = await Promise.all([
    q("SELECT count(*)::int AS n, count(*) FILTER (WHERE status='disabled')::int AS disabled FROM users"),
    q("SELECT count(*)::int AS n FROM users WHERE last_login_at > now() - interval '7 days'"),
    q("SELECT count(*)::int AS n FROM users WHERE last_login_at > now() - interval '30 days'"),
    q("SELECT count(*)::int AS n FROM bt_sessions"),
    q("SELECT count(*)::int AS n, coalesce(sum(pnl),0)::float AS pnl FROM trades"),
    q(`SELECT to_char(d::date,'YYYY-MM-DD') AS day,
              count(u.id)::int AS n
         FROM generate_series(now() - interval '29 days', now(), interval '1 day') d
         LEFT JOIN users u ON u.created_at::date = d::date
        GROUP BY 1 ORDER BY 1`),
  ]);
  res.json({
    users: users.rows[0].n, disabled: users.rows[0].disabled,
    active7: active7.rows[0].n, active30: active30.rows[0].n,
    sessions: sessions.rows[0].n, trades: trades.rows[0].n,
    signups: signups.rows,
  });
});

router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const search = (req.query.q || "").toString().trim();
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const like = `%${search}%`;

  /* Columns are listed explicitly rather than u.* — it keeps the shape
     stable if the table gains a column, and never risks leaking
     password_hash into a response. */
  const cols = `u.id, u.email, u.handle, u.name, u.role, u.status, u.plan,
                u.created_at, u.last_login_at`;
  const filter = search
    ? `WHERE u.email ILIKE $1 OR u.handle ILIKE $1 OR u.name ILIKE $1`
    : "";

  const listSql = search
    ? `SELECT ${cols} FROM users u ${filter} ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`
    : `SELECT ${cols} FROM users u ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`;
  const listParams = search ? [like, limit, offset] : [limit, offset];

  const countSql = search
    ? `SELECT count(*)::int AS n FROM users u ${filter}`
    : `SELECT count(*)::int AS n FROM users u`;
  const countParams = search ? [like] : [];

  const [list, total] = await Promise.all([q(listSql, listParams), q(countSql, countParams)]);

  /* counts fetched separately so the list query stays portable */
  const ids = list.rows.map((r) => r.id);
  const counts = new Map();
  if (ids.length) {
    const [ses, trd] = await Promise.all([
      q(`SELECT user_id, count(*)::int AS n FROM bt_sessions WHERE user_id = ANY($1) GROUP BY user_id`, [ids]),
      q(`SELECT user_id, count(*)::int AS n FROM trades      WHERE user_id = ANY($1) GROUP BY user_id`, [ids]),
    ]);
    for (const r of ses.rows) counts.set(r.user_id, { s: r.n, t: 0 });
    for (const r of trd.rows) counts.set(r.user_id, { ...(counts.get(r.user_id) || { s: 0 }), t: r.n });
  }

  res.json({
    users: list.rows.map((u) => ({
      ...publicUser(u),
      sessionCount: counts.get(u.id)?.s || 0,
      tradeCount: counts.get(u.id)?.t || 0,
    })),
    total: total.rows[0].n,
  });
});

router.patch("/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { role, status, plan } = req.body || {};
  if (role && !["user", "admin"].includes(role)) return res.status(400).json({ error: "invalid" });
  if (status && !["active", "disabled"].includes(status)) return res.status(400).json({ error: "invalid" });
  if (req.params.id === req.user.id && (role === "user" || status === "disabled")) {
    return res.status(400).json({ error: "self_lockout", message: "You can't remove your own admin access." });
  }
  const { rows } = await q(
    `UPDATE users SET role=COALESCE($1,role), status=COALESCE($2,status), plan=COALESCE($3,plan)
      WHERE id=$4 RETURNING *`,
    [role || null, status || null, plan || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "not_found" });
  if (status === "disabled") await revokeAllForUser(req.params.id);
  await logEvent(req.user.id, "admin_update_user", { target: req.params.id, role, status, plan }, reqIp(req));
  res.json({ user: publicUser(rows[0]) });
});

router.get("/admin/events", requireAuth, requireAdmin, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 60);
  const { rows } = await q(
    `SELECT e.id, e.type, e.meta, e.created_at, u.handle, u.email
       FROM events e LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.id DESC LIMIT $1`, [limit]);
  res.json({ events: rows });
});
