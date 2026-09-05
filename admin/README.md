# Piptest Console

The admin dashboard, deployed separately from the main site.

Kept apart deliberately: the console is only useful to you, and giving it its
own origin means the code that lists every user never ships to a visitor's
browser. It talks to the same API as the main site and is gated on the `admin`
role server-side.

## Deploy

Rendered as its own Render static site (`piptest-admin` in `render.yaml`),
served at `admin.piptest.com`.

Set `VITE_API_URL` to the same API the main site uses.

Then add the console's origin to the API's `ALLOWED_ORIGIN`:

```
https://piptest.com,https://www.piptest.com,https://admin.piptest.com
```

Without that, the browser blocks every request with a CORS error.

## Local

```bash
cd admin
npm install
VITE_API_URL=http://localhost:3001 npm run dev   # http://localhost:5174
```
