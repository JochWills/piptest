# Migrating Piptest to TradingView Advanced Charts

The custom canvas chart — `src/chart/ReplayChart.jsx` (TradingView's free
Lightweight Charts plus a hand-rolled drawing overlay), mounted from
`src/pages/Simulator.jsx` — is replaced by TradingView's Advanced Charts. You
get every drawing tool, all timeframes, the indicator library and data paging
for free. The replay engine, trade simulation, stats and rooms stay yours —
Advanced Charts deliberately ships no Bar Replay, so that part is implemented
here through the datafeed.

---

## 1. Request access — done

Approved. Your GitHub account has read access to `tradingview/charting_library`
(the `jenkins` mirror you're looking at in the GitHub UI — same repo).

**Still worth getting in writing, if you haven't**: the docs say the library is
free provided the TradingView attribution stays visible and the implementation
is public, "not behind a paywall". Piptest is planned as a subscription product.
Competitors clearly operate paid tiers on this library, so there is an answer —
get it from TradingView directly before building a business model on it.

## 2. Install the library

It is not on npm and not on any CDN.

**Locally**: clone it once by hand and copy the `charting_library` folder's
contents into `public/charting_library/` — Vite serves `public/` at the web
root, so the files land at `/charting_library/…`, which is what
`TVAdvancedChart.jsx` expects. Not committed — it's licensed, not ours to
redistribute; already excluded via `.gitignore`.

```bash
git clone --depth 1 git@github.com:tradingview/charting_library.git tv-tmp
mkdir -p public/charting_library
cp -R tv-tmp/charting_library/* public/charting_library/
rm -rf tv-tmp
```

**On Render** (the live site is a static build — there's no persistent disk
to have installed it onto by hand, so it has to be fetched on every deploy):
`render.yaml`'s `piptest` service build command runs `npm run tv:install`
before `npm run build`, which runs `scripts/tv-install.sh`. That script
needs a `TV_GH_TOKEN` env var — a GitHub personal access token belonging to
whichever account TradingView granted `charting_library` access to — set as
a secret on the `piptest` web service in Render's dashboard. If it's unset
or the clone fails, the build still succeeds and the chart just shows its
"not installed" placeholder rather than the whole site failing to deploy.

To set it up: on GitHub, generate a personal access token for the account
with access (classic token, `repo` scope is enough), then in Render open the
`piptest` service → **Environment** → add `TV_GH_TOKEN` with that value →
save, which triggers a redeploy that actually installs the library this time.

## 3. What's in `src/tv/`

| File | Role |
|---|---|
| `marketFeed.js` | TradingView-shaped caching/lookups over `lib/candles.js` — the same Binance/Twelve-Data routing the live chart already uses, not a second data client. |
| `datafeed.js` | The Datafeed API, plus the replay cursor. Covers every market in `theme.js`'s `SYMBOLS` (crypto **and** forex/index ETFs), not just crypto. |
| `replayController.js` | Drives the cursor at a chosen speed, emits revealed bars. |
| `TVAdvancedChart.jsx` | Mounts the widget, returns a controller object. |

`marketFeed.js` matters more than it looks: it's the thing that keeps this
integration from silently drifting out of sync with the real chart. It calls
`lib/candles.js`'s `loadWindow`/`fetchPaged` — the exact functions
`ReplayChart.jsx` calls today — instead of re-fetching Binance/Twelve Data
independently, so every fix and edge case handled there (multi-host Binance
fallback, the weekend/market-hours widening for forex, the deterministic
synthetic fallback when a feed is unreachable) is inherited for free.

### How replay works

The library asks the datafeed for bars. `getBars` clamps its `to` parameter to
the cursor:

```js
const toMs = Math.min(to * 1000, state.cursorMs + 1);
```

That one line is the entire replay. No timeframe can serve a bar past the
cursor, because they all come through the same clamp. As time advances,
`control.step()` finds the next bar and pushes it via `subscribeBars`.

**The cursor is a timestamp, never a bar index.** This is what makes switching
timeframe free. A moment is a moment on 1s and on 1D; there is no index to
convert, and therefore no conversion to get wrong — which was the cause of
essentially every chart bug in the previous build.

Jumping backwards is the one operation the library resists: it caches bars and
refuses rewrites of history. `control.jumpTo()` therefore fires each
subscription's reset callback and calls `chart.resetData()` so the chart
re-requests everything.

### Verified properties

A harness exercising the cursor logic confirms:

- **No timeframe leaks future bars.** After 50 steps, seven resolutions served
  0 bars past the cursor.
- **Speed cannot change a backtest.** Bursts of 1, 2, 5, 10, 25 and 50 bars per
  frame revealed byte-identical sequences. This was the worst bug in the old
  build — a losing strategy turned profitable at 25×.
- **Timeframe switching lands inside the containing bar**, always less than one
  bar back, never a different moment.
- When a resolution has no data at the cursor's date (1s from months ago,
  typically), the cursor is left alone and the UI is told — rather than being
  silently dragged to the oldest bar that happens to exist.

## 4. Wiring it into the workspace

```jsx
import TVAdvancedChart from "./tv/TVAdvancedChart.jsx";

<TVAdvancedChart
  symbol={symbol}
  interval="30"
  theme={theme}
  startMs={meta.startMs}
  onReady={(api) => { apiRef.current = api; }}
  onBar={(bar) => runEngine(bar)}     // your existing fill/stop/target logic
  onCursor={(ms) => setCursorTime(ms)}
  onDrawingsChanged={() => pushRoomState()}
/>
```

`onBar` fires once per revealed bar, in order, whatever the speed — so the
existing engine can consume it directly. Feed it `bar` instead of `bars[i]` and
delete the loop that walked from `checkedRef.current` to `cursor`; ordering is
now guaranteed upstream.

### What actually has to change in `Simulator.jsx` — read this before starting

This is the part that turned out to be more than "swap the chart component."
`cursor` is currently a **bar index** (`bars[cursor]`), and that one fact
reaches into the fill engine, the scrubber, room sync, and every saved
session already sitting in the database. Below is the concrete design this
migration needs — worked out, not yet written.

**`cursor` becomes a timestamp (ms), not an index.** `bars`, `loading`,
`synthetic`, `shortFrom`, `noOlder`, `loadOlder` and both market-data
`useEffect`s go away entirely — the datafeed (`src/tv/`) now owns fetching.
Track the current bar directly (`const [cur, setCur] = useState(null)`) from
`onBar`/`onCursor`, instead of deriving it from `bars[cursor]`.

**The fill engine runs per-bar, not per-slice.** `runEngine`'s signature
doesn't need to change — call it as `runEngine(trade, [bar], -1, 0)` from
`onBar`. The loop it already has runs exactly once over that one bar, which
is exactly right since `onBar` guarantees order and no gaps.

**The free-drag scrubber has no clean equivalent and should be dropped for
this first landing.** It needs `bars.length` as an upper bound, which no
longer exists (the datafeed doesn't know the full extent of history up
front). Keep the transport buttons — they map cleanly:
- step forward → `control.step()` (the library's own incremental append,
  cheap)
- step back / scrub backward → the library resists rewriting history
  (§3 above), so there's no cheap "go back one bar." Keep a small ring
  buffer of recently-seen bar timestamps from `onBar` (last few hundred is
  plenty) and step back through *that* via `control.jumpTo()`. Stepping
  forward past the end of the buffer falls back to `control.step()`.
- back-to-start → `control.jumpTo(meta.startMs)`, reset the ring buffer to
  just that one timestamp.

A real free-scrub (drag to any point) is a real feature loss worth
mentioning to Josh before landing this, not something to quietly drop.

**Switching symbol/interval must not remount the widget on every tick.**
`TVAdvancedChart`'s own effect remounts the whole widget whenever its
`startMs` prop changes — correct for an actual symbol/interval switch, fatal
if `startMs` is wired straight to the live-ticking `cursor` (a remount every
single bar). Freeze it in a ref instead: `chartStartRef.current = cursor`
set once, inside `switchMarket`, right before `setSymbol`/`setIv` — never on
every tick — and pass `startMs={chartStartRef.current}` to the component.

**Room sync**: `pushRoom` already just forwards whatever `cursor` currently
holds, so no change needed there beyond it now being milliseconds. Two
things do need to change:
- the guest-side drift tolerance (`Math.abs(c - doc.cursor) > 3`) was
  calibrated for *bars*; at millisecond precision that fires on normal
  jitter. Use `> barMsOf(interval) * 2` instead.
- previously, updating the `cursor` *state* was enough to move the chart,
  because the chart rendered straight off `bars[cursor]`. Now the widget
  isn't watching `cursor` at all — a room-sync catch-up (or "back to
  start") has to explicitly call `control.jumpTo(ms)`, not just update
  React state and assume the chart notices.
- drawings: swap the `drawings` array field in the room doc for a `layout`
  snapshot (`api.save()`/`api.load()`, per above) — this is a real, if
  bounded, addition, not a delete. Same snapshot is worth reusing for the
  session's own autosave/restore too (one `layout` blob instead of separate
  `drawings`/`indicators` fields), since it captures both already.

**Backward compatibility — the one with real production stakes.** Every
saved session already in Postgres has `cursor` stored as a small integer
bar-index. The moment this ships, that same field means milliseconds since
epoch. On restore, treat anything implausibly small to be a real millisecond
timestamp (e.g. `< 1e12`, decades before this could ever be real) as the old
format and fall back to `meta.startMs` instead of trying to interpret it —
old sessions resume from their configured start date rather than their exact
left-off point, which is a small, honest degradation instead of a crash or a
chart silently rendering 1970.

### Rooms

`api.save()` returns a full layout snapshot — drawings, indicators, settings.
`api.load(snapshot)` restores it. That replaces the hand-rolled drawing sync:
the host saves on `onDrawingsChanged`, guests load. Snapshots are a few KB, so
send them on change rather than on a timer.

### Trade zones

`api.drawZone({ price, color, text })` creates a labelled horizontal line via
the library's shape API, and `api.removeShape(id)` clears it. Entry, stop and
target become three shapes instead of hand-drawn canvas rectangles.

## 5. What to delete once the widget is wired in

Almost all of it lives in `src/chart/ReplayChart.jsx` now (not `App.jsx` —
that's stale from before the chart was pulled into its own file):

- the whole file: the Lightweight Charts mount, the canvas drawing overlay,
  `paint`, hit testing, pointer handlers, `tsToLogical`/`logicalToTs`
- in `Simulator.jsx`: the tool rail (`TOOLS`), colour swatches, undo/redo
  stack for drawings, the timeframe strip and zoom presets (the library owns
  all of this now), and `loadOlder`/paging state — the datafeed pages itself
- `lib/market.js` and `lib/candles.js` themselves can likely go too once
  `marketFeed.js` is the only thing calling them — check nothing else still
  imports `loadWindow`/`fetchPaged` directly first

**Keep:** the trade engine, `validateSetup`, `computeStats`, the blotter, the
order ticket, session persistence, and the room code. (Market Watch was
already retired separately — nothing to do there.)

## 6. Order of work

1. ~~Get access approved~~ — done
2. ~~Drop the library into `public/`, confirm the chart renders~~ — done
3. ~~Wire `onBar` into the trade engine in `Simulator.jsx`, verify a trade
   fills and stops out~~ — done, verified live against real Binance data: a
   trade armed, filled, and stopped out with correct R (-1.00R) and P&L
4. ~~Move trade zones (entry/stop/target) to the shape API~~ — done
5. ~~Switch room sync to a timestamp cursor~~ — done (the actual fix for the
   bar-index sync bug in `CLAUDE.md`). `save()`/`load()` layout snapshots
   also wired in for drawings/indicators, in place of the old hand-rolled
   `drawings` array field.
6. ~~Delete the old chart code~~ — done: `src/chart/ReplayChart.jsx` and
   `src/tv/binanceFeed.js` (folded into `marketFeed.js`) are gone.
7. Re-run the QA pass — not done yet.

### What's landed, verified against the real widget + real Binance data

Signed up, created a session, armed a trade, stepped the replay, watched it
fill and stop out with correct math, reloaded mid-session and confirmed the
exact cursor position and price restored, and joined a room as a second
account and watched it catch up to the host. Three real bugs turned up doing
this (not caught by the earlier standalone `src/tv/` harness) and got fixed
in the process:

- **The library's very first bars request defaults to a viewport ending near
  wall-clock "now"**, not the replay's actual start date. Clamping `to` down
  to the cursor without also shifting `from` left `from` stranded *after*
  the clamped `to` — an inverted, permanently-empty range. Fixed in
  `datafeed.js`'s `getBars` by re-anchoring the whole requested span onto
  the cursor instead of clamping one end of it. This would have made every
  session whose `startMs` isn't close to today show a blank chart.
- **`runEngine` always returned a new trade object**, even on bars that
  changed nothing, so `Simulator.jsx` was re-drawing the trade-zone shapes
  every single revealed bar instead of only on real fills/closes — visible
  as duplicate price-axis labels stacking up during a fast replay. Fixed at
  the source in `lib/trading.js`: `runEngine` now returns the *same*
  reference when nothing happened.
- **A guest joining a room could land on the wrong year.** The transient
  session a guest joins into is seeded with a placeholder `startMs` near
  today (`App.jsx`'s `joinRoomFromDashboard`); the widget's mount-time start
  position only got corrected to the host's actual date when the guest's
  placeholder symbol/interval also happened to differ from the host's — and
  a fresh join's `BTCUSDT`/`30m` defaults often coincide. Fixed by syncing
  the mount-time start position on every accepted room update, not only
  when the symbol/interval also changes.

### Known gaps in this pass — real, not hidden

- **No free-drag scrubber.** It needed a bar count up front to size an
  `<input type="range">`, which nothing here has any more — the datafeed
  pages history itself. The transport buttons (step, play/pause, back-to-
  start) all work; jumping to an arbitrary far-off point by dragging does
  not, for now.
- **Viewers in a room can still draw locally** using the library's own
  toolbar — nothing stops them client-side the way the old tool rail did by
  disabling itself. Their drawings just don't sync to the room (only a
  host/editor's do), which is a smaller gap than before but not zero.
  Restricting the toolbar itself by role wasn't attempted this pass.
- **A minor residual cosmetic issue**: closing a trade can leave one or two
  stray duplicate price-axis labels behind from the shape API's `removeShape`
  occasionally not taking effect on a legitimate status-change redraw
  (watching → open → closed). Doesn't affect trading correctness — R, P&L,
  and equity were all exactly right in testing — just a couple of leftover
  labels on the axis.
- **The "simulated data" badge is gone.** The old chart surfaced whether a
  session's candles were the deterministic synthetic fallback (used when a
  feed is unreachable); the Datafeed API has no channel for that signal
  today, so it's silently absent rather than wired through.
- **The legacy-cursor backward-compatibility fallback** (§4a above) was
  verified by code review and a logic trace, not a live round-trip through
  a real saved session — reproducing an authenticated direct API write from
  a test script hit friction (the access token lives in memory, not a
  cookie, so a raw `fetch` from outside the app can't authenticate) that
  wasn't worth chasing further given how simple and low-risk the actual
  check is (`cursor < 1e12` → treat as legacy). Worth a real pass before
  this carries production data.

Step 7 (re-run the QA pass) and closing the gaps above are what's left.
