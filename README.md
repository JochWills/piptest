# PipTest — deploy to Render with a GoDaddy domain

Collaborative market replay and manual backtesting. React + Vite, static build.

---

## What changed from the artifact version

The artifact ran on `window.storage`, a sandbox-only API. It doesn't exist on the
open web, so `src/storage.js` replaces it:

| Data | Artifact | Here |
|---|---|---|
| Profile, sessions, trades, drawings | `window.storage` personal | `localStorage` |
| Live rooms (shared) | `window.storage` shared | your sync service |

**Consequence:** sessions are saved per browser. Clearing site data wipes them, and
they don't follow a user across devices. That's fine for a prototype. For real
accounts you need auth + a database — see "Next steps".

**Live rooms are off until you deploy the sync service** and set `VITE_API_URL`.

---

## 1. Local check

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # verify it compiles before pushing
```

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "PipTest initial"
git branch -M main
git remote add origin https://github.com/<you>/piptest.git
git push -u origin main
```

## 3. Deploy on Render

**Option A — Blueprint (both services at once)**

Dashboard → **New** → **Blueprint** → pick the repo. `render.yaml` creates the
static site and the sync service together.

**Option B — Manual**

*Static site:* New → Static Site → connect repo.
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Add a rewrite rule: source `/*`, destination `/index.html`, action **Rewrite**

*Sync service (only if you want live rooms):* New → Web Service → same repo.
- Root directory: `server`
- Build: `npm install` · Start: `npm start`
- Env var `ALLOWED_ORIGIN` = `https://yourdomain.com`

Then set `VITE_API_URL` on the **static site** to the sync service URL
(e.g. `https://piptest-sync.onrender.com`) and redeploy. Vite bakes env vars in
at build time, so a redeploy is required — restarting won't pick it up.

> Render's free web services sleep after inactivity. The first room join after a
> sleep takes ~30s to wake. Fine for testing, not for users.

## 4. Point the GoDaddy domain at it

In Render → your static site → **Settings → Custom Domains**, add **both**
`yourdomain.com` and `www.yourdomain.com`.

In GoDaddy → **My Products** → your domain → **DNS**:

**First, delete GoDaddy's parked records.** A fresh domain ships with an `A` record
on `@` pointing at GoDaddy's parking page and a `CNAME` on `www`. Both must go or
they'll fight your new records.

Then add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `216.24.57.1` | 600 |
| CNAME | `www` | `piptest.onrender.com` | 600 |

Use your actual `*.onrender.com` hostname for the CNAME.

**Two things that will waste your afternoon if you skip them:**

1. **Use an A record on the apex, not ALIAS/ANAME.** <cite index="30-1">216.24.57.1 is Render's designated IP for apex custom domains and the one that handles certificate provisioning correctly. Pointing an ALIAS or ANAME at your `*.onrender.com` hostname can leave the apex certificate stuck unissued while `www` gets one immediately.</cite> GoDaddy doesn't support ALIAS at the apex anyway.
2. **Don't add AAAA records.** <cite index="29-1">Render uses IPv4, and AAAA records cause unexpected behaviour on custom domains.</cite>

Back in Render, click **Verify** next to each domain. <cite index="29-1">If verification fails, DNS probably hasn't propagated yet — wait a few minutes and retry.</cite> GoDaddy usually propagates in 10–30 minutes. SSL is issued automatically once verification passes.

## 5. Confirm

```bash
dig +short yourdomain.com          # 216.24.57.1
dig +short www.yourdomain.com      # your onrender.com host
curl -I https://yourdomain.com     # 200, valid cert
```

---

## Next steps

**Rooms in production.** The polling sync (1.5s) is a prototype. Replace it with
WebSockets — Socket.io on the sync service, or PartyKit. The room document shape
(`code, host, participants{role}, symbol, interval, cursor, playing, speed,
drawings`) maps straight onto a room payload, so it's a transport swap.

**Real accounts.** Add Clerk or Supabase Auth plus Postgres, and move sessions,
trades and drawings server-side. `src/storage.js` is the only file that needs to
change — swap `localStorage` for API calls behind the same interface.

**Rate limits.** The app calls Binance's public API directly from the browser.
That's fine at low volume, but you'll want to proxy and cache klines through your
own service before you have real traffic.

**Forex data.** Currently crypto only. Free 1s forex means Dukascopy, whose
compressed binary files can't be fetched from a browser — that needs an ingest
job on the server writing normalised bars to your own store.
