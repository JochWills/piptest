/* ============================================================
   db.js — Postgres pool + schema

   Migrations run on boot and are idempotent, so a deploy never
   needs a manual step. Postgres 13+ ships gen_random_uuid() in
   core, which is what Render provisions.
   ============================================================ */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — the API cannot start without a database.");
}

/* Tests inject an in-memory Postgres here so the real route handlers
   can be exercised without a live database. Never set in production. */
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");

export const pool = globalThis.__PIPTEST_TEST_POOL__ || new Pool({
  connectionString: process.env.DATABASE_URL,
  /* Supabase terminates TLS with its own chain; verifying it would need the
     CA bundle shipped alongside the app. The connection is still encrypted. */
  ssl: isLocal ? false : { rejectUnauthorized: false },
  /* Supabase free allows 200 pooler connections. Ten is plenty for one
     small instance and leaves headroom for migrations and the dashboard. */
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  /* A paused Supabase project or a cold start can take a few seconds;
     fail loudly rather than hanging a request forever. */
  statement_timeout: 15000,
});

pool.on("error", (err) => {
  /* An idle client dropped — usually the pooler recycling. The pool
     replaces it on the next query, so log and carry on rather than
     letting an unhandled 'error' event take the process down. */
  console.error("idle postgres client error:", err.message);
});

export const q = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  handle        text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'user',      -- user | admin
  status        text NOT NULL DEFAULT 'active',    -- active | disabled
  plan          text NOT NULL DEFAULT 'free',
  -- "fox:4" — an icon id and a colour index, about 6 bytes.
  -- Cheaper than image uploads by four orders of magnitude, and
  -- there is nothing to store, resize or moderate.
  avatar        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key  ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_key ON users (lower(handle));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_hash_idx ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS bt_sessions (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  symbol     text NOT NULL,
  interval   text NOT NULL,
  start_ms   bigint NOT NULL,
  start_balance integer NOT NULL DEFAULT 10000,
  blind      boolean NOT NULL DEFAULT false,
  challenge  jsonb,
  stats      jsonb NOT NULL DEFAULT '{}'::jsonb,
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bt_user_idx ON bt_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trades (
  id         text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id text,
  symbol     text, interval text, dir text,
  qty        double precision, entry double precision, exit_price double precision,
  stop       double precision, target double precision,
  risk_amt   double precision, risk_pct double precision,
  r          double precision, pnl double precision,
  reason     text, tags text[] DEFAULT '{}', note text DEFAULT '',
  opened_ts  bigint, closed_ts bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trades_user_idx ON trades (user_id, closed_ts DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resets_hash_idx ON password_resets (token_hash);
CREATE INDEX IF NOT EXISTS resets_user_idx ON password_resets (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  type       text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at DESC);

-- live rooms: ephemeral, so a plain key/value table with a TTL sweep
CREATE TABLE IF NOT EXISTS kv (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  await q(SCHEMA);
  /* added after the first release, so bring existing tables forward */
  await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text");
  await q("ALTER TABLE bt_sessions ADD COLUMN IF NOT EXISTS start_balance integer NOT NULL DEFAULT 10000");

  /* Backfill trades.session_id for rows created before the client ever
     sent one (every trade before this existed). session_id has no FK —
     a trade can't be matched back to its session by id alone, but each
     session's own autosaved `state.trades` is a copy of every trade
     closed inside it, so a trade whose id shows up there really did
     happen in that session. Anything that still has no match after this
     — because no *surviving* session claims it — belongs to a session
     that's since been deleted; see the /admin/orphaned-trades routes for
     what cleans those up. Scoped to session_id IS NULL and safe to run
     on every boot: once a trade is tagged this never touches it again. */
  await q(`
    UPDATE trades t
    SET session_id = s.id
    FROM bt_sessions s, jsonb_array_elements(coalesce(s.state->'trades', '[]'::jsonb)) elem
    WHERE t.session_id IS NULL
      AND s.user_id = t.user_id
      AND elem->>'id' = t.id
  `);

  console.log("schema ready");
}

export async function logEvent(userId, type, meta = {}, ip = null) {
  try {
    await q("INSERT INTO events (user_id, type, meta, ip) VALUES ($1,$2,$3,$4)",
      [userId, type, meta, ip]);
  } catch (e) { /* never let telemetry break a request */ }
}

/* rooms are short-lived; drop anything untouched for 12h */
export function startSweeper() {
  const run = async () => {
    try {
      await q("DELETE FROM kv WHERE updated_at < now() - interval '12 hours'");
      await q("DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'");
      await q("DELETE FROM password_resets WHERE expires_at < now() - interval '2 days'");
    } catch (e) { /* ignore */ }
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}
