// Sound, off until someone asks for it. Everything is synthesised, so there are no files to load.
let ctx = null;
let master = null;
let engine = null;
let on = false;

function boot() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

export const sound = {
  get on() {
    return on;
  },

  set(value) {
    on = value;
    if (on) boot();
    if (ctx) master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.03);
    if (ctx && on) ctx.resume();
  },

  tick(pitch = 880, length = 0.05, level = 0.12) {
    if (!on) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = pitch;
    g.gain.setValueAtTime(level, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length);
    o.connect(g).connect(master);
    o.start();
    o.stop(ctx.currentTime + length);
  },

  // The five start lights and the release.
  light() {
    this.tick(660, 0.16, 0.2);
  },

  go() {
    this.tick(1320, 0.34, 0.25);
  },

  startEngine() {
    if (!on || engine) return;
    const shape = ctx.createGain();
    shape.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const low = ctx.createOscillator();
    low.type = 'sawtooth';
    const high = ctx.createOscillator();
    high.type = 'square';
    const highGain = ctx.createGain();
    highGain.gain.value = 0.28;
    low.connect(filter);
    high.connect(highGain).connect(filter);
    filter.connect(shape).connect(master);
    low.start();
    high.start();
    engine = { low, high, shape, filter };
  },

  // revs 0-1 within the gear, load 0-1 from the throttle.
  engine(revs, load) {
    if (!engine) return;
    const base = 150 + revs * 300;
    const t = ctx.currentTime;
    engine.low.frequency.setTargetAtTime(base, t, 0.02);
    engine.high.frequency.setTargetAtTime(base * 2.01, t, 0.02);
    engine.filter.frequency.setTargetAtTime(700 + load * 2400 + revs * 900, t, 0.04);
    engine.shape.gain.setTargetAtTime(0.05 + load * 0.15, t, 0.03);
  },

  stopEngine() {
    if (!engine) return;
    const { low, high, shape } = engine;
    shape.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    low.stop(ctx.currentTime + 0.3);
    high.stop(ctx.currentTime + 0.3);
    engine = null;
  },
};
