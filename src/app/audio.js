// Interface sounds, off until someone asks for them. They're synthesised, so there are no files to load.
let ctx = null;
let master = null;
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
};
