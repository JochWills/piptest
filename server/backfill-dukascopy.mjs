/* ============================================================
   backfill-dukascopy.mjs — pre-warm the local archive mirror

   Nothing depends on this script: every range a user charts gets
   mirrored on demand anyway (see loadDukascopyCandles). What it buys
   is that the FIRST person to open a given range doesn't wait for
   the upstream fetch, because it already happened here.

   Run it against the same DATABASE_URL the API uses:

     cd server
     DATABASE_URL=... node backfill-dukascopy.mjs                 # hourly, 5 years
     DATABASE_URL=... node backfill-dukascopy.mjs --min1-days=180
     DATABASE_URL=... node backfill-dukascopy.mjs --symbols=XAUUSD --min1-days=365

   Cost, and why the defaults are what they are:

   · hour1 is one file per symbol per MONTH, so five years of every
     symbol is ~660 files and a few MB. It fully covers the 1h, 4h
     and 1d charts. Cheap enough to be the default.
   · min1 is one file per symbol per DAY — 11 symbols x 1 year is
     ~4,000 files and, at the pacing the archive tolerates, hours of
     wall time. It's opt-in via --min1-days for that reason. It only
     matters for the 1m/5m/15m/30m charts, and only for ranges
     nobody has opened yet.

   Safe to stop and re-run: periods already mirrored are skipped, so
   it resumes where it left off. Deliberately single-threaded and
   paced — it shares the one adaptive queue in dukascopy.js, which
   widens its own gap whenever the archive pushes back.
   ============================================================ */

import { q, pool, migrate } from "./db.js";
import { DUKASCOPY_SYMBOLS, mirrorPeriod } from "./dukascopy.js";

const DAY_MS = 86400000;

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const symbols = (arg("symbols") || Object.keys(DUKASCOPY_SYMBOLS).join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);
const months = Number(arg("months", 60));
const min1Days = Number(arg("min1-days", 0));

for (const s of symbols) {
  if (!DUKASCOPY_SYMBOLS[s]) {
    console.error(`unknown symbol: ${s}\nknown: ${Object.keys(DUKASCOPY_SYMBOLS).join(", ")}`);
    process.exit(1);
  }
}

/* Only ever backfill periods that have fully elapsed. A period still in
   progress is still being appended to upstream, and mirroring it now
   would freeze a partial day into the table. */
function plan() {
  const now = new Date();
  const jobs = [];

  for (const symbol of symbols) {
    for (let i = 1; i <= months; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      jobs.push({ symbol, kind: "hour1", start: d.getTime() });
    }
    for (let i = 1; i <= min1Days; i++) {
      jobs.push({ symbol, kind: "min1", start: Math.floor((Date.now() - i * DAY_MS) / DAY_MS) * DAY_MS });
    }
  }
  return jobs;
}

async function alreadyMirrored(jobs) {
  const have = new Set();
  const r = await q(
    `SELECT symbol, kind, period_start FROM duka_bars
      WHERE symbol = ANY($1::text[]) AND is_final = true`,
    [symbols]
  );
  for (const row of r.rows) have.add(`${row.symbol}|${row.kind}|${Number(row.period_start)}`);
  return jobs.filter((j) => !have.has(`${j.symbol}|${j.kind}|${j.start}`));
}

async function sizeReport() {
  try {
    const r = await q(`
      SELECT count(*)::int AS rows,
             coalesce(sum(n), 0)::bigint AS bars,
             pg_size_pretty(pg_total_relation_size('duka_bars')) AS on_disk
        FROM duka_bars`);
    const s = r.rows[0];
    console.log(`\nmirror now holds ${s.rows} periods / ${s.bars} bars, ${s.on_disk} on disk`);
  } catch { /* pg_size_pretty isn't available everywhere; not worth failing over */ }
}

await migrate();

const all = plan();
const todo = await alreadyMirrored(all);
console.log(`${all.length} periods planned, ${all.length - todo.length} already mirrored, ${todo.length} to fetch`);
if (!todo.length) { await sizeReport(); await pool.end(); process.exit(0); }

let done = 0, empty = 0, failed = 0;
const started = Date.now();

for (const job of todo) {
  const label = `${job.symbol} ${job.kind} ${new Date(job.start).toISOString().slice(0, 10)}`;
  try {
    const records = await mirrorPeriod(job.symbol, job.kind, job.start);
    if (records == null) { failed++; console.warn(`  throttled, left unmirrored: ${label}`); }
    else if (!records.length) { empty++; done++; }
    else done++;
  } catch (e) {
    failed++;
    console.error(`  failed: ${label}: ${e.message}`);
  }

  const n = done + failed;
  if (n % 25 === 0 || n === todo.length) {
    const mins = (Date.now() - started) / 60000;
    const rate = n / Math.max(mins, 0.01);
    console.log(
      `  ${n}/${todo.length}  (${empty} empty, ${failed} left for later)  ` +
      `${rate.toFixed(0)}/min, ~${Math.max(0, (todo.length - n) / Math.max(rate, 0.01)).toFixed(0)}min remaining`
    );
  }
}

console.log(`\ndone: ${done} mirrored (${empty} of them genuinely empty periods), ${failed} still to do`);
if (failed) console.log("re-run to pick up whatever the archive throttled this time.");
await sizeReport();
await pool.end();
