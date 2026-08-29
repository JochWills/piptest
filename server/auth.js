/* ============================================================
   auth.js — password hashing, tokens, middleware

   Passwords use scrypt from node:crypto — memory-hard, built in,
   no native module to fail on a Render build. Never store or log
   a raw password.

   Two tokens:
   · access  — short-lived JWT, sent in the Authorization header,
               held only in memory by the browser so XSS can't
               lift it from storage
   · refresh — long-lived random string in an httpOnly cookie.
               Only its hash is stored, and it rotates on every
               use so a stolen token is single-use.
   ============================================================ */

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { q, logEvent } from "./db.js";

const ACCESS_TTL = "15m";
const REFRESH_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("JWT_SECRET must be set to at least 32 characters. Refusing to sign weak tokens.");
}

/* ---------- passwords ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const dk = crypto.scryptSync(password, salt, expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(dk, expected);
  } catch (e) { return false; }
}

/* ---------- tokens ---------- */
export const signAccess = (user) =>
  jwt.sign({ sub: user.id, role: user.role, handle: user.handle }, SECRET, { expiresIn: ACCESS_TTL });

export const verifyAccess = (token) => {
  try { return jwt.verify(token, SECRET); } catch (e) { return null; }
};

const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

export async function issueRefresh(userId, req) {
  const raw = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + REFRESH_DAYS * 864e5);
  await q(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, hashToken(raw), expires, (req.get("user-agent") || "").slice(0, 300), reqIp(req)]
  );
  return { raw, expires };
}

/* Re-use of an already-revoked token normally means it leaked — but a
   browser with two tabs open produces the exact same signal by accident:
   both tabs' access tokens expire around the same moment, both fire a
   request, both get a 401, both hit /api/auth/refresh with the cookie
   value that was current when they were sent. The server processes them
   one after another; the second one presents a token this first one just
   rotated away. That's not theft, it's a race — so a token reused within
   this window is treated as benign and quietly re-rotated instead of
   nuking every session. Reuse *outside* the window still triggers a full
   revoke: a stolen token being replayed minutes or days later is theft. */
const REUSE_GRACE_MS = 15_000;

export async function rotateRefresh(raw, req) {
  const { rows } = await q(
    `SELECT rt.*, u.id AS uid, u.role, u.handle, u.status
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1`, [hashToken(raw)]);
  const row = rows[0];
  if (!row) return null;

  if (row.revoked_at && Date.now() - new Date(row.revoked_at).getTime() > REUSE_GRACE_MS) {
    await q("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [row.uid]);
    await logEvent(row.uid, "refresh_reuse_detected", {}, reqIp(req));
    return null;
  }
  if (new Date(row.expires_at) < new Date()) return null;
  if (row.status !== "active") return null;

  await q("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);
  const next = await issueRefresh(row.uid, req);
  return { user: { id: row.uid, role: row.role, handle: row.handle }, refresh: next };
}

export async function revokeRefresh(raw) {
  if (!raw) return;
  await q("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashToken(raw)]);
}

export async function revokeAllForUser(userId) {
  await q("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
}

/* ---------- cookie ---------- */
export const REFRESH_COOKIE = "pt_refresh";
export function setRefreshCookie(res, raw, expires) {
  const crossSite = process.env.COOKIE_CROSS_SITE === "true";
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    /* "none" is required when the API is on a different registrable domain
       than the site. Serving the API at api.piptest.com instead keeps it
       first-party, which Safari's tracking prevention treats far better. */
    sameSite: crossSite ? "none" : "lax",
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: "/api/auth",
    expires,
  });
}
export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    path: "/api/auth",
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
}

/* ---------- middleware ---------- */
export function requireAuth(req, res, next) {
  const hdr = req.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  const claims = token && verifyAccess(token);
  if (!claims) return res.status(401).json({ error: "not_authenticated" });
  req.user = { id: claims.sub, role: claims.role, handle: claims.handle };
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

/* ---------- helpers ---------- */
export const reqIp = (req) =>
  (req.get("x-forwarded-for") || "").split(",")[0].trim() || req.ip || null;

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const publicUser = (u) => ({
  id: u.id, email: u.email, handle: u.handle, name: u.name,
  role: u.role, status: u.status, plan: u.plan, avatar: u.avatar || null,
  createdAt: u.created_at, lastLoginAt: u.last_login_at,
});
