// Builds public/data/lap.json from the raw OpenF1 pulls in data-raw/.
//
// Both laps are measured against one reference line by track position, not by integrating speed:
// a few metres of integration drift at 90 km/h would read as 0.2 s of driving that never happened.
// The two time axes are then pinned to the official sector times, so the delta at each timing line
// is exactly the published number. Between the lines it comes from position samples taken about
// four times a second.
//
//   node tools/build-lap.mjs            writes the file and prints the findings
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data-raw', f)));

const LENGTH = 4927; // metres, the published length of the current Marina Bay layout
const POINTS = 494; // one point about every ten metres, with the last one on the line

const bestLap = (n) => raw(`laps_${n}.json`).filter((l) => l.lap_duration).sort((a, b) => a.lap_duration - b.lap_duration)[0];

function load(n) {
  const lap = bestLap(n);
  const t0 = Date.parse(lap.date_start);
  const stamp = (r) => ({ ...r, t: (Date.parse(r.date) - t0) / 1000 });
  return {
    n,
    lap,
    dur: lap.lap_duration,
    sectors: [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3],
    car: raw(`car_${n}.json`).map(stamp).sort((a, b) => a.t - b.t),
    loc: raw(`loc_${n}.json`).map(stamp).sort((a, b) => a.t - b.t).filter((r) => r.x !== 0 || r.y !== 0),
  };
}

// Linear interpolation of ys over a rising xs.
function lerpIn(xs, ys, x) {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = xs[hi] === xs[lo] ? 0 : Math.min(1, Math.max(0, (x - xs[lo]) / (xs[hi] - xs[lo])));
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}

const at = (rows, t, key) => lerpIn(rows.map((r) => r.t), rows.map((r) => r[key]), t);

// The reference line is Verstappen's lap with a little run-up on each side of the finish.
const ver = load(3);
const lec = load(16);
const ref = ver.loc.filter((r) => r.t >= -2.5 && r.t <= ver.dur + 2.5);
const refS = [0];
for (let i = 1; i < ref.length; i++) {
  refS.push(refS[i - 1] + Math.hypot(ref[i].x - ref[i - 1].x, ref[i].y - ref[i - 1].y) / 10);
}

// Track position of each sample: its projection on the reference line, walking forward from the last hit.
function project(rows) {
  const out = [];
  let from = 0;
  for (const r of rows) {
    let best = { d: Infinity, s: 0, i: from };
    for (let i = Math.max(0, from - 4); i < Math.min(ref.length - 1, from + 26); i++) {
      const a = ref[i];
      const b = ref[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const f = Math.max(0, Math.min(1, ((r.x - a.x) * dx + (r.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(r.x - (a.x + dx * f), r.y - (a.y + dy * f));
      if (d < best.d) best = { d, s: refS[i] + (refS[i + 1] - refS[i]) * f, i };
    }
    from = best.i;
    out.push({ t: r.t, s: best.s, off: best.d / 10 });
  }
  return out;
}

const verPos = project(ref);
const lecPos = project(lec.loc.filter((r) => r.t >= -2.5 && r.t <= lec.dur + 2.5));

const rising = (rows) => {
  const out = [];
  for (const r of rows) if (!out.length || r.s > out[out.length - 1].s + 0.05) out.push(r);
  return out;
};
const verT = rising(verPos);
const lecT = rising(lecPos);
const timeAt = (rows, s) => lerpIn(rows.map((r) => r.s), rows.map((r) => r.t), s);
const posAt = (rows, t) => lerpIn(rows.map((r) => r.t), rows.map((r) => r.s), t);

// The finish line and the two timing lines: where each car was at its official times, averaged.
const marks = (d, rows) => [0, d.sectors[0], d.sectors[0] + d.sectors[1], d.dur].map((t) => posAt(rows, t));
const verMarks = marks(ver, verT);
const lecMarks = marks(lec, lecT);
const start = (verMarks[0] + lecMarks[0]) / 2;
const span = (verMarks[3] - verMarks[0] + (lecMarks[3] - lecMarks[0])) / 2;
const lineS = [0, (verMarks[1] + lecMarks[1]) / 2 - start, (verMarks[2] + lecMarks[2]) / 2 - start, span];

const toMetres = LENGTH / span;
const grid = Array.from({ length: POINTS }, (_, i) => (i / (POINTS - 1)) * span);

// Pins one car's time axis to its official splits; what it moves is printed as a health check.
function pinned(d, rows) {
  const official = [0, d.sectors[0], d.sectors[0] + d.sectors[1], d.dur];
  const shift = lineS.map((s, i) => official[i] - timeAt(rows, start + s));
  return { shift, time: grid.map((s) => timeAt(rows, start + s) + lerpIn(lineS, shift, s)) };
}

const v = pinned(ver, verT);
const l = pinned(lec, lecT);

function trace(d, rows) {
  const times = grid.map((s) => timeAt(rows, start + s));
  const series = (key) => {
    const ts = d.car.map((r) => r.t);
    const ys = d.car.map((r) => r[key]);
    return times.map((t) => lerpIn(ts, ys, t));
  };
  const gear = times.map((t) => d.car.reduce((b, r) => (Math.abs(r.t - t) < Math.abs(b.t - t) ? r : b)).n_gear);
  const loc = (key) => {
    const ts = d.loc.map((r) => r.t);
    const ys = d.loc.map((r) => r[key] / 10);
    return times.map((t) => lerpIn(ts, ys, t));
  };
  return { speed: series('speed'), throttle: series('throttle'), brake: series('brake'), gear, x: loc('x'), y: loc('y'), z: loc('z') };
}

const vt = trace(ver, verT);
const lt = trace(lec, lecT);

function smooth(values, radius) {
  return values.map((_, i) => {
    const r = Math.min(radius, i, values.length - 1 - i); // the window narrows at the ends so they hold still
    let sum = 0;
    for (let k = i - r; k <= i + r; k++) sum += values[k];
    return sum / (2 * r + 1);
  });
}

// Positive: Leclerc is behind Verstappen at this point of the lap. Sample timestamps jitter by up to
// 0.08 s, so the line between the timing points is a broad trend, about 160 m wide, and no more.
const rawDelta = grid.map((_, i) => l.time[i] - v.time[i]);
const smoothed = smooth(smooth(rawDelta, 8), 8);
const idxAt = (s) => Math.round((s / span) * (POINTS - 1));
const lineDelta = [0, lec.sectors[0] - ver.sectors[0], lec.sectors[0] + lec.sectors[1] - ver.sectors[0] - ver.sectors[1], lec.dur - ver.dur];
const residual = lineS.map((s, i) => lineDelta[i] - smoothed[idxAt(s)]);
const delta = smoothed.map((x, i) => x + lerpIn(lineS, residual, grid[i]));

const circuit = raw('circuit_61.json');
const nearest = (px, py) => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < POINTS; i++) {
    const d = (vt.x[i] - px) ** 2 + (vt.y[i] - py) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};
const cornerIdx = circuit.corners.map((c) => nearest(c.trackPosition.x / 10, c.trackPosition.y / 10));

// Apex speed: the lowest raw sample between the midpoints to the neighbouring corners. Unlike time
// deltas these come straight off the speed channel, so they hold up corner by corner. The grid is
// not used here because interpolating it can step over the one sample that is the true minimum.
function apex(d, rows, k) {
  const from = k === 0 ? 0 : Math.round((cornerIdx[k - 1] + cornerIdx[k]) / 2);
  const to = k === cornerIdx.length - 1 ? POINTS - 1 : Math.round((cornerIdx[k] + cornerIdx[k + 1]) / 2);
  const [a, b] = [timeAt(rows, start + grid[from]), timeAt(rows, start + grid[to])];
  const samples = d.car.filter((r) => r.t >= a && r.t <= b);
  return { speed: Math.min(...samples.map((r) => r.speed)), gear: Math.min(...samples.map((r) => r.n_gear)) };
}

const corners = circuit.corners.map((c, k) => {
  const v = apex(ver, verT, k);
  const l = apex(lec, lecT, k);
  return { n: c.number, i: cornerIdx[k], m: Math.round(grid[cornerIdx[k]] * toMetres), ver: v.speed, lec: l.speed, verGear: v.gear, lecGear: l.gear };
});

const round = (a, p) => a.map((x) => Number(x.toFixed(p)));
const mean = (rows, key) => rows.reduce((s, w) => s + w[key], 0) / rows.length;
const weather = raw('weather.json');
const drivers = raw('q26_drivers.json');
const person = (n) => drivers.find((d) => d.driver_number === n);
const lapsAll = raw('laps_all.json').filter((x) => x.lap_duration && !x.is_pit_out_lap && x.lap_duration < 100);
const bestSector = (key) => {
  const b = lapsAll.filter((x) => x[key]).sort((a, c) => a[key] - c[key])[0];
  return { code: person(b.driver_number).name_acronym, time: b[key] };
};

const carInfo = (d) => ({
  code: person(d.n).name_acronym,
  name: person(d.n).full_name,
  team: person(d.n).team_name,
  time: d.dur,
  sectors: d.sectors,
  segments: [d.lap.segments_sector_1, d.lap.segments_sector_2, d.lap.segments_sector_3],
});

const out = {
  session: {
    event: 'Singapore Grand Prix',
    session: 'Qualifying',
    date: '2026-10-10',
    circuit: 'Marina Bay',
    length: LENGTH,
    air: Number(mean(weather, 'air_temperature').toFixed(1)),
    track: Number(mean(weather, 'track_temperature').toFixed(1)),
    humidity: Math.round(mean(weather, 'humidity')),
  },
  cars: { ver: carInfo(ver), lec: carInfo(lec) },
  bestSectors: [bestSector('duration_sector_1'), bestSector('duration_sector_2'), bestSector('duration_sector_3')],
  order: raw('q26_result.json').slice(0, 5).map((q) => ({ pos: q.position, code: person(q.driver_number).name_acronym, time: q.duration[2], gap: q.gap_to_leader[2] })),
  lines: lineS.slice(1).map((s) => idxAt(s)),
  corners,
  m: round(grid.map((s) => s * toMetres), 0),
  ver: { t: round(v.time, 3), v: round(vt.speed, 0), th: round(vt.throttle, 0), br: round(vt.brake, 0), g: vt.gear, x: round(vt.x, 1), y: round(vt.y, 1), z: round(vt.z, 1) },
  lec: { t: round(l.time, 3), v: round(lt.speed, 0), th: round(lt.throttle, 0), br: round(lt.brake, 0), g: lt.gear, x: round(lt.x, 1), y: round(lt.y, 1) },
  delta: round(delta, 3),
};

fs.mkdirSync(path.join(root, 'public', 'data'), { recursive: true });
const file = path.join(root, 'public', 'data', 'lap.json');
fs.writeFileSync(file, JSON.stringify(out));

// The findings, printed for a human to check before any of them reach the page.
console.log(`wrote ${path.relative(root, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${POINTS} points)`);
console.log(`reference line ${span.toFixed(0)} m, scaled to ${LENGTH} m (${((toMetres - 1) * 100).toFixed(2)}%)`);
console.log(`lateral offset of LEC from VER line: median ${lecPos.map((p) => p.off).sort((a, b) => a - b)[lecPos.length >> 1].toFixed(2)} m, max ${Math.max(...lecPos.map((p) => p.off)).toFixed(2)} m`);
console.log('\nhow far official timing had to move each raw time axis (s)');
console.log('  VER', v.shift.map((x) => x.toFixed(3)).join('  '));
console.log('  LEC', l.shift.map((x) => x.toFixed(3)).join('  '));
console.log('\ndelta at the lines against official');
lineS.forEach((s, i) => console.log(`  ${(s * toMetres).toFixed(0).padStart(5)} m  delta ${delta[idxAt(s)].toFixed(3).padStart(7)}  official ${lineDelta[i].toFixed(3).padStart(7)}  (before pinning residual ${residual[i].toFixed(3)})`));

// Brake point and throttle pickup around each corner, the two things a coarse feed still shows well.
const firstBrake = (trace, from, to) => {
  for (let i = from; i <= to; i++) if (trace.brake[i] > 50) return i;
  return null;
};
const pickup = (trace, from, to) => {
  for (let i = from; i <= to; i++) if (trace.throttle[i] > 90) return i;
  return null;
};
const metres = (i) => (i === null ? '   -' : String(Math.round(grid[i] * toMetres)).padStart(4));

console.log('\ncorner by corner: apex speed, brake point and full-throttle point');
console.log('  corner      at   apex VER LEC  diff   gear VER LEC   brake VER LEC    throttle VER LEC');
corners.forEach((c, k) => {
  const from = k === 0 ? 0 : Math.round((corners[k - 1].i + c.i) / 2);
  const to = k === corners.length - 1 ? POINTS - 1 : Math.round((c.i + corners[k + 1].i) / 2);
  const sector = c.i < out.lines[0] ? 1 : c.i < out.lines[1] ? 2 : 3;
  console.log(`  S${sector} T${String(c.n).padEnd(3)} ${String(c.m).padStart(6)} m   ${String(c.ver).padStart(3)} ${String(c.lec).padStart(3)}  ${String(c.ver - c.lec).padStart(4)}      ${c.verGear}   ${c.lecGear}    ${metres(firstBrake(vt, from, c.i))} ${metres(firstBrake(lt, from, c.i))}      ${metres(pickup(vt, c.i, to))} ${metres(pickup(lt, c.i, to))}`);
});
console.log('\nbroad trend at each corner (not for quoting corner by corner)');
console.log('  ' + corners.map((c) => `T${c.n} ${delta[c.i].toFixed(2)}`).join('  '));

const inLap = (d) => d.car.filter((r) => r.t >= 0 && r.t <= d.dur);
const full = (d) => ((inLap(d).filter((r) => r.throttle >= 98).length / inLap(d).length) * 100).toFixed(1);
const lead = delta.reduce((b, x, i) => (x < delta[b] ? i : b), 0);
const trail = delta.reduce((b, x, i) => (x > delta[b] ? i : b), 0);
const lineSpeed = (vt.speed[POINTS - 1] + lt.speed[POINTS - 1]) / 2;
console.log('\nlap facts');
console.log(`  top speed VER ${Math.max(...inLap(ver).map((r) => r.speed))} LEC ${Math.max(...inLap(lec).map((r) => r.speed))}; slowest VER ${Math.min(...inLap(ver).map((r) => r.speed))} LEC ${Math.min(...inLap(lec).map((r) => r.speed))}`);
console.log(`  full throttle VER ${full(ver)}% LEC ${full(lec)}%`);
console.log(`  LEC furthest ahead ${delta[lead].toFixed(3)} at ${(grid[lead] * toMetres).toFixed(0)} m; furthest behind ${delta[trail].toFixed(3)} at ${(grid[trail] * toMetres).toFixed(0)} m`);
console.log(`  speed at the line ${lineSpeed.toFixed(0)} km/h, so 0.054 s is ${((lineSpeed / 3.6) * 0.054).toFixed(1)} m`);
console.log(`  best sectors ${out.bestSectors.map((b) => `${b.code} ${b.time}`).join(', ')}`);
console.log(`  session air ${out.session.air} C, track ${out.session.track} C, humidity ${out.session.humidity}%`);
