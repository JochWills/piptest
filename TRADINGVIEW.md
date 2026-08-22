# Migrating PipTest to TradingView Advanced Charts

The custom canvas chart in `src/App.jsx` is replaced by TradingView's Advanced
Charts. You get every drawing tool, all timeframes, the indicator library and
data paging for free. The replay engine, trade simulation, stats and rooms stay
yours — Advanced Charts deliberately ships no Bar Replay, so that part is
implemented here through the datafeed.

---

## 1. Request access (do this first — it gates everything)

Apply at **https://www.tradingview.com/advanced-charts/**

You'll be asked for a company and a public URL. Use **NOX Media Group** and
`https://piptest.com`. TradingView does not issue these licences for personal
use, hobby projects or testing — company + public web application only. Approval
gives your GitHub account read access to the `tradingview/charting_library` repo.

**Ask them one question explicitly while you're at it.** The docs say the library
is free provided the TradingView attribution stays visible and the implementation
is public, "not behind a paywall". PipTest is planned as a subscription product.
Competitors clearly operate paid tiers on this library, so there is an answer —
but get it in writing before you build a business model on it.

## 2. Install the library

It is not on npm and not on any CDN. Once you have repo access:

```bash
git clone --depth 1 git@github.com:tradingview/charting_library.git tv-tmp
mkdir -p public/charting_library
cp -R tv-tmp/charting_library/* public/charting_library/
rm -rf tv-tmp
```

Vite serves `public/` at the web root, so the files land at
`/charting_library/…`, which is what `TVAdvancedChart.jsx` expects.

**Do not commit the library.** It's licensed, not yours to redistribute. Add to
`.gitignore`:

```
public/charting_library/
```

Then add the clone step to Render's build command:

```
npm ci && npm run tv:install && npm run build
```

with a `tv:install` script that clones using a deploy key. Until that's set up,
the chart renders a clear "not installed" panel rather than a blank frame.

## 3. What's in `src/tv/`

| File | Role |
|---|---|
| `binanceFeed.js` | Fetching, paging, caching. Knows nothing about TradingView. |
| `datafeed.js` | The Datafeed API, plus the replay cursor. |
| `replayController.js` | Drives the cursor at a chosen speed, emits revealed bars. |
| `TVAdvancedChart.jsx` | Mounts the widget, returns a controller object. |

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

### Rooms

`api.save()` returns a full layout snapshot — drawings, indicators, settings.
`api.load(snapshot)` restores it. That replaces the hand-rolled drawing sync:
the host saves on `onDrawingsChanged`, guests load. Snapshots are a few KB, so
send them on change rather than on a timer.

### Trade zones

`api.drawZone({ price, color, text })` creates a labelled horizontal line via
the library's shape API, and `api.removeShape(id)` clears it. Entry, stop and
target become three shapes instead of hand-drawn canvas rectangles.

## 5. What to delete from `App.jsx`

Roughly 600 lines, and the source of most of the QA report:

- the whole `Chart` component — canvas overlay, `paint`, hit testing, pointer
  handlers
- `tsToLogical` / `logicalToTs` / `ptL` / `geoRef` and the manual `toX`
- the tool rail, colour swatches, undo/redo stack for drawings
- `lookbackBars`, `fetchKlinesPaged`, `loadOlder`, `shortBy`, `noOlder`
- the timeframe strip and zoom presets (the library owns these)

**Keep:** the trade engine, `validateSetup`, `computeStats`, the blotter,
Performance Overview, Market Watch, the dashboard, session persistence, and the
room code.

## 6. Order of work

1. Get access approved (days, not hours — start now)
2. Drop the library into `public/`, confirm the chart renders
3. Wire `onBar` into the existing engine, verify a trade fills and stops out
4. Move trade zones to the shape API
5. Switch room sync to `save()` / `load()`
6. Delete the old chart code
7. Re-run the QA pass — most of the chart findings should simply be gone

Steps 2–5 are testable independently, so nothing is blocked on the whole
migration landing at once.
