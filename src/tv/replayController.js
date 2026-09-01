/* ============================================================
   replayController.js

   Drives the datafeed cursor forward, one bar at a time, and
   reports every revealed bar. Deliberately knows nothing about
   the chart or what a "bar" actually spans in calendar time —
   it just keeps calling control.step() until enough of it has
   gone by (see setStep/revealForMs below), and control (in
   datafeed.js) is the one that decides, per call, whether that
   means one whole chart-resolution candle or one sub-bar of a
   still-forming one. Whatever it means, every bar in between is
   still revealed and emitted individually and in order — so a 4h
   step still runs the trade engine over every intervening bar,
   nothing gets skipped, a backtest is never wrong just because it
   was stepped through in big jumps.
   ============================================================ */

const TICK_MS = 260;   // fixed real-time cadence between play "ticks"
const MAX_CALLS = 500; // safety cap per reveal batch — see revealForMs

export function createReplayController({ control, onBar, onState }) {
  const state = {
    playing: false, stepMs: 60000, symbol: null, resolution: null,
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

  /* Keep stepping, one bar at a time (so the trade engine sees every one
     of them), until the cursor has advanced by at least `ms` of calendar
     time or MAX_CALLS is hit (an extreme mismatch — e.g. a 1s step on a
     1D chart with nothing cached yet — degrades to "as far as this batch
     gets", not a browser-freezing number of calls). Always takes at
     least one step if there's data to take. `respectPlaying` is only
     true from inside the play loop below: it lets a pause clicked
     mid-batch take effect between individual bars rather than only
     between whole ticks, so Pause stays responsive regardless of step
     size. A manual stepFor() call always runs its full batch — state.
     playing being false at that point is expected, not a reason to cut
     it short. */
  async function revealForMs(ms, respectPlaying) {
    const startCursor = control.cursorMs;
    for (let i = 0; i < MAX_CALLS; i++) {
      if (respectPlaying && !state.playing) return true;
      const ok = await stepOnce();
      if (!ok) return false;
      if (control.cursorMs - startCursor >= ms) return true;
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
          const ok = await revealForMs(state.stepMs, true);
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
    /* advance by `ms` of calendar time — used for the actual "step
       forward" a chosen step size away, so both play() and the manual
       button honour the same size */
    async stepFor(ms) { stop(); return revealForMs(ms, false); },
    setStep(ms) { state.stepMs = Math.max(1, ms | 0); control.setStepMs(state.stepMs); emitState(); },
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
    jumpTo(ms, widget) { stop(); state.atEnd = false; control.jumpTo(ms, widget, state.symbol, state.resolution); emitState(); },
    get state() { return { ...state }; },
  };
}
