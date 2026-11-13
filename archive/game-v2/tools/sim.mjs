// Runs simulated drivers round the real circuit, far faster than real time, to tune the physics.
import fs from 'node:fs';
import { trackModel } from '../src/stage/track.js';
import { CarPhysics } from '../src/game/physics.js';
const lap = JSON.parse(fs.readFileSync('public/data/lap.json'));
const f = trackModel(lap);
const N = f.N;
const H = 1 / 120;

function run({ start = 0, speed = 1, assist = null, user = () => ({ steer: 0, throttle: 0, brake: 0 }), limit = 300 }) {
  const c = new CarPhysics(f, lap);
  c.reset(start, lap.ver.v[start] / 3.6);
  let t = 0, hits = 0, armed = false, maxE = 0, top = 0, stuck = 0;
  while (t < limit) {
    const before = c.progress;
    const input = user(c, speed);
    c.step(H, input, assist);
    t += H;
    if (c.hit > 0.15) hits++;
    maxE = Math.max(maxE, Math.abs(c.q.e));
    top = Math.max(top, c.v * 3.6);
    if (c.v < 1) { stuck += H; if (stuck > 4) return { t, hits, done: false, why: `stuck at index ${c.progress.toFixed(0)}`, maxE, top }; } else stuck = 0;
    if (c.progress > start + 8) armed = true;
    if (armed && before > N - 40 && c.progress < 40) return { t, hits, done: true, maxE, top };
  }
  return { t, hits, done: false, why: `timeout at index ${c.progress.toFixed(0)}`, maxE, top };
}

const bot = (c, k) => {
  const limit = c.target(k);
  return { steer: c.steerHelp(), throttle: c.v < limit * 0.99 ? 1 : 0, brake: c.v > limit * 1.02 ? 1 : 0 };
};
const fmt = (r) => `${r.done ? r.t.toFixed(3).padStart(8) + ' s' : (' DNF ' + r.why)}  wall hits ${String(r.hits).padStart(4)}  widest ${r.maxE.toFixed(1)} m  top ${r.top.toFixed(0)} km/h`;
console.log('real pole lap 91.373 s, sector three 25.840 s');
for (const k of [1.06, 1.03, 1.0, 0.97, 0.94]) console.log(`pro bot, ${k.toFixed(2)} x pole speed, full lap   `, fmt(run({ speed: k, user: bot })));
for (const k of [1.03, 1.0, 0.97]) console.log(`pro bot, ${k.toFixed(2)} x pole speed, sector 3   `, fmt(run({ start: lap.lines[1], speed: k, user: bot })));
const rookie = { speed: 0.9, pedals: true, steer: 0.62 };
console.log('rookie, hands off the wheel, full lap  ', fmt(run({ assist: rookie })));
console.log('rookie, hands off the wheel, sector 3  ', fmt(run({ start: lap.lines[1], assist: rookie })));
// A clumsy human: steers late with the right idea, on and off the keys.
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clumsy = (c) => { const want = c.steerHelp(); const key = Math.abs(want) < 0.28 ? 0 : Math.sign(want); return { steer: rnd() < 0.2 ? 0 : key, throttle: 0, brake: 0 }; };
console.log('rookie, clumsy keyboard player, lap    ', fmt(run({ assist: rookie, user: clumsy })));
const clumsyPro = (c) => { const want = c.steerHelp(); const key = Math.abs(want) < 0.25 ? 0 : Math.sign(want); const limit = c.target(0.86); return { steer: rnd() < 0.15 ? 0 : key, throttle: c.v < limit ? 1 : 0, brake: c.v > limit * 1.05 ? 1 : 0 }; };
console.log('pro, careful keyboard player, lap      ', fmt(run({ user: clumsyPro })));
for (const k of [1.09, 1.12, 1.15, 1.2]) console.log(`pro bot, ${k.toFixed(2)} x pole speed, full lap   `, fmt(run({ speed: k, user: bot })));
for (const s of [0.5, 0.42, 0.34]) console.log(`rookie steer help ${s}, hands off, lap     `, fmt(run({ assist: { speed: 0.9, pedals: true, steer: s } })));
for (const s of [0.5, 0.42, 0.34]) console.log(`rookie steer help ${s}, clumsy player, lap `, fmt(run({ assist: { speed: 0.9, pedals: true, steer: s }, user: clumsy })));
