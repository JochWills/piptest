# CLAUDE.md

Guidance for Claude Code when working in this repo. Keep this file updated as
things change — it's the fastest way to onboard a fresh session.

## What this is

**PipTest** — a market replay and backtesting tool competing with FXReplay.
Users replay historical crypto candles bar-by-bar, arm trade setups
(entry/stop/target), share a live session with others via room codes, and
journal/analyze results. Built by Josh (NOX Media Group).

Live at **piptest.com**. Three deployed services, one shared database.

## Stack

- **Frontend**: React + Vite, hash-routed (`#/dashboard`, `#/sim/<id>`, `#/journal`, etc.)
- **API**: Node + Express
- **Database**: Postgres, hosted on **Supabase** (not Render's own Postgres —
  that one gets deleted 30 days after creation on the free tier)
- **Charts**: TradingView Lightweight Charts (free). Advanced Charts access
  applied for but not yet approved/integrated — see `TRADINGVIEW.md` if present.
- **Auth**: scrypt password hashing, JWT access token (in-memory, not
  localStorage) + rotating refresh token in an httpOnly cookie
- **Email**: Resend, for password reset

## Repo structure

```
piptest/
├── src/            — main app
├── server/          — Express API (auth, sessions, trades, rooms, admin, password reset)
├── admin/           — standalone admin console — DELIBERATELY its own app/origin,
│                      so the "list every user" code never ships to a regular visitor
├── public/          — wordmark PNGs (light/dark variants), favicon, OG images
├── render.yaml       — Render blueprint: 3 services (site, api, admin). No DB block —
│                      the database lives on Supabase, referenced only via DATABASE_URL
├── BACKEND.md        — full deploy/setup walkthrough (if present — check before re-deriving)
└── TRADINGVIEW.md    — notes on migrating to TradingView Advanced Charts later
```

## Commands

Check `package.json` in each of `src/` (root), `server/`, and `admin/` for the
authoritative scripts — don't assume without checking, this list may drift:

```bash
npm run dev       # frontend dev server
npm run build     # frontend build
cd server && npm start   # API
cd admin && npm run dev  # admin console dev
```

## Architecture notes

**Auth.** Access token lives in memory only (never localStorage — an XSS
payload can read localStorage but not a JS closure). Refresh token is httpOnly,
rotates on every use, and 30 days. If you touch auth, keep it that way.

**Rooms / live sessions.** Host shares a chart via a 6-character code; guests
join as viewer or editor. Sync is currently **polling** (~1.5s), not
WebSockets — fine for testing, not for real scale. There's a known bug where
room sync sends a bar-index rather than a timestamp, so a host and guest on
different session start dates can silently see different candles while the UI
claims they're in sync. If working on rooms, fix this properly (sync by
timestamp) rather than patching around it.

**Admin console is a separate app on purpose.** Don't merge it back into the
main site — keeping it on its own origin means user-management code isn't in
the bundle a regular visitor downloads.

**Avatars** are stored as short codes like `fox:4`, not uploaded images —
keep it that way, it's the whole point (near-zero storage cost).

## Known style/CSS gotcha (bit us twice — don't repeat)

**Never set `display`, layout, or anything a media query needs to override as
an inline style.** Inline styles beat stylesheet rules, so a mobile media
query trying to override an inline `display: block` silently does nothing.
Both the logo wordmark switcher and the dashboard sidebar broke this way. Put
anything that needs to respond to a breakpoint in a CSS class, not a `style={}` prop.

## Known gaps / pending work

Check current state before assuming any of these are still true — this repo
moves fast:

1. Drawing tools on the chart are mouse-only, no touch/mobile support
2. No email verification on signup (only password reset is built)
3. Room sync is polling, not WebSockets (see above)
4. No "join a room" entry point outside the simulator page
5. TradingView Advanced Charts integration code may exist in a `src/tv/`
   directory from an earlier exploration — check whether it's wired in or
   orphaned before building on it

## Environment variables (server)

Don't hardcode secrets. Check `server/.env.example` or `render.yaml` for the
authoritative current list — this is a reference, not gospel:

- `DATABASE_URL` — Supabase Postgres connection string
- `JWT_SECRET`
- `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, `APP_URL` — email
- `ADMIN_EMAILS` — comma-separated, grants admin role
- `COOKIE_CROSS_SITE`, `COOKIE_DOMAIN` — cookie config; relevant if the API and
  site ever end up on different domains (Safari enforces SameSite strictly —
  cross-site cookies get blocked/expired there even when Chrome allows them)

## Working conventions

- Josh prefers plain, non-technical, step-by-step instructions for anything
  involving Render/GoDaddy/Supabase dashboards — he's often executing your
  instructions directly in those UIs, not just reading code
- Free-tier constraints matter here: Supabase pauses after 7 days of
  inactivity, Render free services sleep after 15 min idle — a keepalive
  mechanism may already exist, check before re-solving this
- Domain is piptest.com via GoDaddy; don't assume DNS changes propagate
  instantly when debugging "it's not working yet"

## Before making changes

Skim any `BACKEND.md` / `TRADINGVIEW.md` / similar docs in the repo root first
— they were written to capture exactly this kind of context and may be more
current than this file.
