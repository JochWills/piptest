/* Minimal key-value sync service for PipTest live rooms.
   Rooms are ephemeral, so in-memory storage is fine for v1.
   Swap the Map for Redis or Postgres when rooms must survive restarts. */
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const TTL_MS = 1000 * 60 * 60 * 12;

app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: "1mb" }));

const kv = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of kv) if (now - v.at > TTL_MS) kv.delete(k);
}, 60000);

app.get("/healthz", (_req, res) => res.json({ ok: true, keys: kv.size }));

app.get("/kv/:key", (req, res) => {
  const hit = kv.get(req.params.key);
  res.json({ value: hit ? hit.value : null });
});

app.put("/kv/:key", (req, res) => {
  kv.set(req.params.key, { value: req.body?.value ?? null, at: Date.now() });
  res.json({ ok: true });
});

app.delete("/kv/:key", (req, res) => {
  kv.delete(req.params.key);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`sync service on :${PORT}`));
