/* ============================================================
   replayController.js

   Drives the datafeed cursor forward, one step at a time, and
   reports every revealed bar. Deliberately knows nothing about
   the chart: it emits bars, and whoever listens (the trade
   engine, the room sync) reacts.

   A "step" is however many bars the caller says it is (see
   `setStep` / `stepBars` below) — the controller itself doesn't
   know what that number means in calendar time, or what interval
   the chart is even on (Simulator works that out from the chosen
   step size vs. the chart's own bar duration; see stepBarsFor in
   theme.js). Whatever the step size, every bar in between is still
   revealed and emitted individually and in order — so a 4h step
   still runs the trade engine over every intervening 1-minute bar,
   nothing gets skipped, a backtest is never wrong just because it
   was stepped through in big jumps.
   ============================================================ */

const TICK_MS = 260; // fixed real-time cadence between play "ticks"

export function createReplayController({ control, onBar, onState }) {
  const state = {
    playing: false, stepBars: 1, symbol: null, resolution: null,
    atEnd: false, busy: false, covered: true, earliest: null,
  };
  let raf = 0, acc = 0, last = 0;

  const emitState = () => onState && onState({ ...state });

  async function stepOnce() {
    if (state.busy) return false;
    state.busy = true;
    try {
      const bar = await control.step(state.symbol, state.resolution);
      if (!bar) { state.atEnd = true; stop(); emitState(); return false; }
      state.atEnd = false;
      onBar && onBar(bar);
      return true;
    } finally { state.busy = false; }
  }

  /* Reveal up to n bars, one at a time and in order (so the trade engine
     sees every one of them) — used both for a manual "step forward" and
     for each tick of play(). `respectPlaying` is only true from inside
     the play loop below: it lets a pause clicked mid-batch (a big step
     size can mean this batch is dozens of bars) take effect between
     individual bars rather than only between whole ticks, so Pause stays
     just as responsive as it was before step sizes existed. A manual
     stepBars() call always runs its full batch — state.playing being
     false at that point is expected, not a reason to cut it short. */
  async function revealBars(n, respectPlaying) {
    for (let i = 0; i < n; i++) {
      if (respectPlaying && !state.playing) return true;
      const ok = await stepOnce();
      if (!ok) return false;
    }
    return true;
  }

  function loop(now) {
    if (!state.playing) return;
    if (!last) last = now;
    acc += now - last;
    last = now;
    /* Cap the burst so a backgrounded tab doesn't dump a huge number of
       ticks at once when it regains focus. Time is not skipped, only
       deferred — every bar in every deferred tick still gets revealed. */
    let ticks = Math.min(Math.floor(acc / TICK_MS), 5);
    if (ticks > 0) {
      acc -= ticks * TICK_MS;
      (async () => {
        for (let i = 0; i < ticks && state.playing; i++) {
          const ok = await revealBars(state.stepBars, true);
          if (!ok) break;
        }
      })();
    }
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (state.playing || state.atEnd) return;
    state.playing = true; last = 0; acc = 0;
    raf = requestAnimationFrame(loop);
    emitState();
  }
  function stop() {
    state.playing = false;
    cancelAnimationFrame(raf); raf = 0; last = 0; acc = 0;
    emitState();
  }

  return {
    play, pause: stop,
    toggle() { state.playing ? stop() : play(); },
    /* single bar, e.g. for anything that always wants exactly one
       regardless of the current step size */
    async step() { stop(); return stepOnce(); },
    /* n bars — used for the actual "step forward" a chosen step size
       away, so both play() and the manual button honour the same size */
    async stepBars(n) { stop(); return revealBars(n, false); },
    setStep(bars) { state.stepBars = Math.max(1, bars | 0); emitState(); },
    async setMarket(symbol, resolution) {
      const changed = symbol !== state.symbol || resolution !== state.resolution;
      state.symbol = symbol; state.resolution = resolution;
      if (changed) {
        state.atEnd = false;
        const r = await control.realign(symbol, resolution);
        state.covered = r.covered;
        state.earliest = r.earliest || null;
      }
      emitState();
      return state.covered !== false;
    },
    jumpTo(ms, widget) { stop(); state.atEnd = false; control.jumpTo(ms, widget); emitState(); },
    get state() { return { ...state }; },
  };
}
