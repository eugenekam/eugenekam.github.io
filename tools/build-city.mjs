// Builds public/data/city.bin from the OpenStreetMap pull in data-raw/osm.json.
//
// F1 telemetry has its own arbitrary x/y frame, so the real circuit outline (latitude and longitude)
// is fitted to the telemetry path first. Every building footprint then lands in the telemetry frame,
// which puts the lap in the right streets without any hand placement.
//
// File layout, little-endian Int16, half-metre units:
//   header: buildingCount, waterCount, parkCount, roadCount
//   building: height, base, vertexCount, x0, y0, x1, y1 ...
//   water, park: vertexCount, x0, y0, x1, y1 ...
//   road: class (1 major, 2 minor), vertexCount, x0, y0, x1, y1 ...
//
//   node tools/build-city.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data-raw', f)));

const LAT0 = 1.2905;
const LON0 = 103.8580;
const toLocal = (lon, lat) => [(lon - LON0) * Math.cos((LAT0 * Math.PI) / 180) * 111320, (lat - LAT0) * 110574];

// The telemetry path and the circuit outline, each as points in metres.
const lap = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'lap.json')));
const P = lap.ver.x.map((x, i) => [x, lap.ver.y[i]]);
const geo = raw('sg.geojson').features[0].geometry.coordinates.map(([lon, lat]) => toLocal(lon, lat));

const G = [];
for (let i = 1; i < geo.length; i++) {
  const [a, b] = [geo[i - 1], geo[i]];
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
  for (let k = 0; k < n; k++) G.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
}

const centre = (pts) => pts.reduce((c, p) => [c[0] + p[0] / pts.length, c[1] + p[1] / pts.length], [0, 0]);
const cP = centre(P);
const cG = centre(G);

function nearestDistances(fit) {
  return P.map(([x, y]) => {
    const px = fit.s * (fit.c * (x - cP[0]) - fit.n * (y - cP[1])) + fit.tx;
    const py = fit.s * (fit.n * (x - cP[0]) + fit.c * (y - cP[1])) + fit.ty;
    let best = Infinity;
    let hit = null;
    for (const g of G) {
      const d = (g[0] - px) ** 2 + (g[1] - py) ** 2;
      if (d < best) {
        best = d;
        hit = g;
      }
    }
    return { d: Math.sqrt(best), g: hit, p: [x - cP[0], y - cP[1]] };
  });
}

const trimmed = (rows, keep) => {
  const s = [...rows].sort((a, b) => a.d - b.d).slice(0, Math.floor(rows.length * keep));
  return s;
};
const score = (rows) => {
  const s = trimmed(rows, 0.75);
  return s.reduce((t, r) => t + r.d, 0) / s.length;
};

// Coarse search over rotation, then trimmed ICP with scale. The trim lets the fit ignore the part of
// the outline that predates the 2023 layout change.
let fit = null;
let bestScore = Infinity;
for (let deg = 0; deg < 360; deg += 3) {
  const a = (deg * Math.PI) / 180;
  const f = { s: 1, c: Math.cos(a), n: Math.sin(a), tx: cG[0], ty: cG[1] };
  const sc = score(nearestDistances(f));
  if (sc < bestScore) {
    bestScore = sc;
    fit = f;
  }
}

for (let it = 0; it < 30; it++) {
  const pairs = trimmed(nearestDistances(fit), 0.75);
  const mp = centre(pairs.map((r) => r.p));
  const mg = centre(pairs.map((r) => r.g));
  let sxx = 0;
  let sxy = 0;
  let spp = 0;
  for (const r of pairs) {
    const px = r.p[0] - mp[0];
    const py = r.p[1] - mp[1];
    const gx = r.g[0] - mg[0];
    const gy = r.g[1] - mg[1];
    sxx += px * gx + py * gy;
    sxy += px * gy - py * gx;
    spp += px * px + py * py;
  }
  const a = Math.atan2(sxy, sxx);
  const s = Math.hypot(sxx, sxy) / spp;
  const c = Math.cos(a);
  const n = Math.sin(a);
  fit = { s, c, n, tx: mg[0] - s * (c * mp[0] - n * mp[1]), ty: mg[1] - s * (n * mp[0] + c * mp[1]) };
}

const finalRows = nearestDistances(fit);
console.log(`fit: rotation ${((Math.atan2(fit.n, fit.c) * 180) / Math.PI).toFixed(2)} deg, scale ${fit.s.toFixed(4)}, trimmed mean error ${score(finalRows).toFixed(1)} m, 95th percentile ${[...finalRows].sort((a, b) => a.d - b.d)[Math.floor(finalRows.length * 0.95)].d.toFixed(1)} m`);

// From lat/lon to the telemetry frame, the inverse of the fit.
function toTrack(lon, lat) {
  const [gx, gy] = toLocal(lon, lat);
  const dx = (gx - fit.tx) / fit.s;
  const dy = (gy - fit.ty) / fit.s;
  return [fit.c * dx + fit.n * dy + cP[0], -fit.n * dx + fit.c * dy + cP[1]];
}

const number = (v) => {
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function heights(tags) {
  const h = number(tags.height);
  const levels = number(tags['building:levels']);
  const minH = number(tags.min_height);
  const minL = number(tags['building:min_level']);
  const fallback = tags.building === 'roof' ? 6 : tags.building === 'house' ? 8 : 12;
  const top = h ?? (levels ? levels * 3.6 : fallback);
  const base = minH ?? (minL ? minL * 3.6 : tags.building === 'roof' ? top - 1.5 : 0);
  return { top, base: Math.min(base, top - 0.5) };
}

// Douglas-Peucker on a closed ring, enough to drop the near-straight vertices that survey data carries.
function simplify(ring, tolerance) {
  const open = ring.slice(0, -1);
  if (open.length < 5) return open;
  const keep = new Set([0, open.length >> 1]);
  const walk = (a, b) => {
    const [ax, ay] = open[a];
    const [bx, by] = open[b % open.length];
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = open[i];
      const dx = bx - ax;
      const dy = by - ay;
      const d = Math.abs(dy * (px - ax) - dx * (py - ay)) / (Math.hypot(dx, dy) || 1);
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > tolerance) {
      keep.add(at);
      walk(a, at);
      walk(at, b);
    }
  };
  walk(0, open.length >> 1);
  walk(open.length >> 1, open.length);
  return [...keep].sort((a, b) => a - b).map((i) => open[i]);
}

const inside = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

// Multipolygon rings can arrive split across several ways; join them end to end.
function stitchedRings(relation) {
  const open = (relation.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    for (let grew = true; grew && ring[0].join() !== ring[ring.length - 1].join(); ) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        if (w[0].join() === ring[ring.length - 1].join()) ring = ring.concat(w.slice(1));
        else if (w[w.length - 1].join() === ring[ring.length - 1].join()) ring = ring.concat([...w].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring[0].join() === ring[ring.length - 1].join()) rings.push(ring.map(([lon, lat]) => toTrack(lon, lat)));
  }
  return rings;
}

const elements = raw('osm.json').elements;
const ringOf = (geometry) => geometry.map((p) => toTrack(p.lon, p.lat));
const closed = (r) => r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];

// A building drawn with parts is outlined once and modelled in pieces: keep the pieces, drop the outline.
const parts = [];
const outlines = [];
const water = [];
for (const e of elements) {
  const t = e.tags ?? {};
  if (e.type === 'way' && e.geometry) {
    const ring = ringOf(e.geometry);
    if (t['building:part'] && closed(ring)) parts.push({ ring, t });
    else if (t.building && closed(ring)) outlines.push({ ring, t });
    else if (t.natural === 'water' && closed(ring)) water.push(ring);
  } else if (e.type === 'relation') {
    for (const ring of stitchedRings(e)) {
      if (t.building) outlines.push({ ring, t });
      else if (t.natural === 'water') water.push(ring);
    }
  }
}

const parks = [];
const roads = [];
for (const e of raw('osm-roads.json').elements) {
  const t = e.tags ?? {};
  if (e.type === 'relation') {
    if (t.leisure === 'park') parks.push(...stitchedRings(e));
    continue;
  }
  if (!e.geometry) continue;
  const line = ringOf(e.geometry);
  if (t.highway) roads.push({ line, major: /motorway|trunk|primary|secondary/.test(t.highway) });
  else if (closed(line)) parks.push(line);
}

const hasParts = (o) => parts.some((p) => inside(centre(p.ring), o.ring));
const kept = [...parts, ...outlines.filter((o) => !hasParts(o))];

const REACH = 3200; // metres from the circuit centre worth carrying into the browser
const words = [];
const push = (...v) => v.forEach((x) => words.push(Math.max(-32768, Math.min(32767, Math.round(x * 2)))));

let buildings = 0;
let tallest = 0;
for (const { ring, t } of kept) {
  const { top, base } = heights(t);
  const pts = simplify(ring, 0.8);
  if (pts.length < 3) continue;
  const c = centre(pts);
  if (Math.hypot(c[0] - cP[0], c[1] - cP[1]) > REACH) continue;
  words.push(Math.round(top * 2), Math.round(base * 2), pts.length);
  pts.forEach((p) => push(p[0], p[1]));
  buildings++;
  tallest = Math.max(tallest, top);
}

const buildingWords = words.length;
let lakes = 0;
for (const ring of water) {
  const pts = simplify(ring, 2.5);
  if (pts.length < 3) continue;
  words.push(pts.length);
  pts.forEach((p) => push(p[0], p[1]));
  lakes++;
}

let greens = 0;
for (const ring of parks) {
  const pts = simplify(ring, 2.5);
  if (pts.length < 3) continue;
  words.push(pts.length);
  pts.forEach((p) => push(p[0], p[1]));
  greens++;
}

// An open line, thinned with the same perpendicular test as the rings.
function thin(line, tolerance) {
  if (line.length < 3) return line;
  const keep = [line[0]];
  let anchor = 0;
  for (let i = 2; i < line.length; i++) {
    const [ax, ay] = line[anchor];
    const [bx, by] = line[i];
    const off = line.slice(anchor + 1, i).some(([px, py]) => Math.abs((by - ay) * (px - ax) - (bx - ax) * (py - ay)) / (Math.hypot(bx - ax, by - ay) || 1) > tolerance);
    if (off) {
      keep.push(line[i - 1]);
      anchor = i - 1;
    }
  }
  keep.push(line[line.length - 1]);
  return keep;
}

let streets = 0;
for (const { line, major } of roads) {
  const pts = thin(line, 1.2);
  words.push(major ? 1 : 2, pts.length);
  pts.forEach((p) => push(p[0], p[1]));
  streets++;
}

const data = new Int16Array(4 + words.length);
data[0] = buildings;
data[1] = lakes;
data[2] = greens;
data[3] = streets;
data.set(words, 4);
const file = path.join(root, 'public', 'data', 'city.bin');
fs.writeFileSync(file, Buffer.from(data.buffer));

console.log(`parts ${parts.length}, outlines ${outlines.length}, kept ${kept.length}, written ${buildings}; water ${lakes}; parks ${greens}; roads ${streets}; tallest ${tallest} m`);
console.log(`wrote ${path.relative(root, file)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB (${buildingWords} building words)`);
const towers = [['Marina Bay Sands Tower 1', 'Marina Bay Sands Tower 1'], ['Singapore Flyer', 'Singapore Flyer'], ['The Fullerton Hotel', 'The Fullerton Hotel']];
for (const [q, label] of towers) {
  const e = elements.find((x) => x.tags?.name === q && x.geometry);
  if (!e) continue;
  const c = centre(ringOf(e.geometry));
  console.log(`  ${label}: track frame ${c[0].toFixed(0)}, ${c[1].toFixed(0)}`);
}
fs.writeFileSync(path.join(root, 'data-raw', 'fit.json'), JSON.stringify({ ...fit, cP, LAT0, LON0 }));
