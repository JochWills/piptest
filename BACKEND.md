# PipTest backend — accounts, database, admin

Real user accounts backed by Postgres, plus an admin dashboard. The app still
runs without any of this (falling back to browser storage), so you can deploy
the two halves independently.

---

## What exists now

| Piece | Where |
|---|---|
| API (Express + Postgres) | `server/` |
| API client | `src/lib/api.js` |
| Storage abstraction | `src/lib/data.js` |
| Sign in / sign up | `src/pages/Auth.jsx` |
| Admin dashboard | `src/pages/Admin.jsx` → `#/admin` |

### Tables

`users`, `refresh_tokens`, `bt_sessions`, `trades`, `events`, `kv` (live rooms).
Migrations run on boot and are idempotent — deploying never needs a manual step.

---

## Deploy

### 1. Create the database on Supabase

Render's own free Postgres is deleted 30 days after creation — fine for a demo,
wrong for real accounts. Supabase's free tier is permanent.

1. Sign up at **supabase.com** and create a project (pick the region closest to
   your users; `eu-west` or `eu-central` is a reasonable default from South Africa)
2. Save the database password it gives you — it's shown once
3. Go to **Project Settings → Database → Connection string**
4. Choose **Session pooler**, not "Direct connection"

The direct connection is IPv6-only on new projects and Render doesn't route
IPv6 outbound, so it will simply fail to connect. The session pooler is IPv4 and
suits a long-running Node server. The string looks like:

```
postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Nothing else on Supabase needs configuring. PipTest uses it purely as a
Postgres database — the tables are created by our own migrations on first boot.

### 2. Sync the blueprint

`render.yaml` no longer declares a database. In Render:
**Blueprints → your blueprint → Manual sync**. It creates `piptest-api`.

> The old `piptest-sync` service is superseded — delete it once the new API is
> live.

### 3. Set the environment variables

On **piptest-api**:

| Key | Value |
|---|---|
| `DATABASE_URL` | the Supabase session pooler string from step 1 |
| `JWT_SECRET` | generated automatically — don't change it, every session breaks |
| `ALLOWED_ORIGIN` | `https://piptest.com,https://www.piptest.com` |
| `ADMIN_EMAILS` | your email, comma-separated for more |
| `NODE_ENV` | `production` |

On **piptest** (the static site):

| Key | Value |
|---|---|
| `VITE_API_URL` | your API URL |

Vite bakes `VITE_API_URL` in at build time, so **redeploy the site** after
setting it. Restarting is not enough.

Check `https://your-api/healthz` — it should return `{"ok":true,"db":"up"}`.
That confirms the API is running *and* the database is reachable.

### 4. Put the API on your own domain — this matters

Add `api.piptest.com` as a custom domain on the API service, and a CNAME at
GoDaddy pointing to the API's `onrender.com` host.

The refresh token is an httpOnly cookie. If the API sits on `onrender.com` while
the site is on `piptest.com`, that cookie is **third-party**, and Safari and
Firefox block or aggressively expire it — users get signed out constantly and
you'd struggle to reproduce it on Chrome.

With `api.piptest.com`, set:

- `COOKIE_DOMAIN` = `.piptest.com`
- leave `COOKIE_CROSS_SITE` unset (so `SameSite=Lax`)

If you must run cross-site for now, set `COOKIE_CROSS_SITE=true` and expect
Safari to misbehave.

### 5. Turn on the keep-alive

Two things go to sleep on free tiers:

- **Supabase** pauses a project after **7 days** with no database activity. It
  has to be restored by hand from the dashboard.
- **Render** spins a free service down after 15 minutes idle; the next visitor
  waits about a minute.

`.github/workflows/keepalive.yml` pings `/healthz` every 3 days, which wakes the
API *and* runs a query — activity for both. To enable it:

**GitHub → Settings → Secrets and variables → Actions → Variables → New**
`API_URL` = `https://api.piptest.com`

Then run it once manually from the Actions tab to confirm it works.

### 6. Make yourself admin

Register normally with the email in `ADMIN_EMAILS`. The role is applied on
signup and re-checked on every login, so it survives redeploys. **Admin** then
appears in the sidebar.

---

## What the free tier gives you

| | Free limit | What actually bites first |
|---|---|---|
| Supabase database | 500 MB, permanent | Pauses after 7 days idle — the keep-alive handles it |
| Render API | 750 instance hours/month | Sleeps after 15 min idle; slow cold start |
| Render static site | free | nothing |

500 MB is roughly **1,000–2,000 active users** on PipTest's data shape. You'll
feel the sleeping API long before you feel the storage.

**No backups on either free tier.** Once you have users whose data you'd be sorry
to lose, that's the moment to pay — Supabase Pro is $25/month and adds daily
backups, or export the database yourself on a schedule.

---

## How auth works

**Passwords** — scrypt from `node:crypto`: memory-hard, no native module to fail
a build. Random 16-byte salt per password, `timingSafeEqual` on compare. Login
runs a verify even when the email doesn't exist, so response timing can't be
used to discover which addresses are registered.

**Access token** — a 15-minute JWT, held in a module variable in the browser and
never written to localStorage. Script injected into the page can read storage;
it can't read a closure.

**Refresh token** — 256 bits of randomness in an httpOnly cookie scoped to
`/api/auth`. Only its SHA-256 hash is stored. It **rotates on every use**, and
presenting an already-used token revokes every session for that account — that's
the signal a token leaked.

Changing a password revokes all refresh tokens. Disabling an account does the
same, so a disabled user is gone within 15 minutes at worst, immediately in
practice.

---

## Tests

```bash
cd server && node test-api.mjs
```

Runs the real route handlers against an in-memory Postgres. 22 checks, covering:

- registration, duplicate email (case-insensitive), weak-password rejection
- login failure paths, and identical responses for wrong-password vs unknown-email
- missing, forged and expired tokens
- admin gating, and `ADMIN_EMAILS` promotion
- **ownership isolation** — one user cannot read or write another's sessions or trades
- room keys only: `kv` can't be used as general scratch storage
- disabling an account blocks sign-in

---

## Local development

```bash
# API
cd server
DATABASE_URL=postgres://localhost/piptest \
JWT_SECRET=$(openssl rand -base64 48) \
ADMIN_EMAILS=you@example.com \
NODE_ENV=development npm start

# site, in another terminal
VITE_API_URL=http://localhost:3001 npm run dev
```

---

## What's deliberately not built yet

**Email verification and password reset.** Both need an email provider. Until
then a forgotten password means fixing it by hand — fine at this size, not fine
at a few hundred users. This is the first thing to add.

Worth knowing: **Supabase also has a built-in Auth product** that includes
verification and reset emails for free. We aren't using it — PipTest has its own
auth, already written and tested, and switching would mean rewriting sign-in and
the admin user management. But if password-reset emails become urgent, adopting
Supabase Auth is a legitimate shortcut rather than building the email flow
yourself.

**Rooms still poll.** They're durable now and survive a restart, but the client
polls every 1.5s. Swap to WebSockets before you have real concurrent users.

**Rate limiting is per-instance.** Render's free tier runs one instance so this
is fine now; with more than one you'd want the limiter backed by Redis.

**No soft delete.** `DELETE /api/me` removes the user and cascades everything.
There's no undo and no export-before-delete.
