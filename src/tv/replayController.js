/* ============================================================
   replayController.js

   Drives the datafeed cursor forward at a chosen speed and
   reports every revealed bar. Deliberately knows nothing about
   the chart: it emits bars, and whoever listens (the trade
   engine, the room sync) reacts.

   Every revealed bar is emitted exactly once, in order, whatever
   the speed — so a backtest run at 50x gives the same result as
   one run at 1x.
   ============================================================ */

export function createReplayController({ control, onBar, onState }) {
  const state = {
    playing: false, speed: 1, symbol: null, resolution: null,
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

  function loop(now) {
    if (!state.playing) return;
    if (!last) last = now;
    acc += now - last;
    last = now;
    const per = 1000 / state.speed;
    /* Cap the burst so a backgrounded tab doesn't dump thousands of bars
       at once when it regains focus. Time is not skipped, only deferred. */
    let budget = Math.min(Math.floor(acc / per), 40);
    if (budget > 0) {
      acc -= budget * per;
      (async () => {
        for (let i = 0; i < budget && state.playing; i++) {
          const ok = await stepOnce();
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
    async step() { stop(); return stepOnce(); },
    setSpeed(s) { state.speed = s; emitState(); },
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
