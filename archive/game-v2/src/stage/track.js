// The circuit as a shape the game can use: a smooth racing line to follow, a dense centre line to draw
// from, and a fast answer to "where am I on the track?" for the physics and the lap timing.
//
// Lap indexes are in telemetry points, about 10 m apart. Dense indexes are DENSE times finer.
export const DENSE = 3;

const mod = (i, n) => ((i % n) + n) % n;

function smoothClosed(points, radius) {
  const n = points.length;
  return points.map((_, i) => {
    let x = 0;
    let z = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = points[mod(i + k, n)];
      x += p.x;
      z += p.z;
    }
    const w = 2 * radius + 1;
    return { x: x / w, z: z / w };
  });
}

const spline = (a, b, c, d, t) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
const slope = (a, b, c, d, t) => 0.5 * ((c - a) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (3 * b - a - 3 * c + d) * t * t);

export function trackModel(lap) {
  const N = lap.ver.x.length - 1; // the last point closes the lap on the first
  const raw = Array.from({ length: N }, (_, i) => ({ x: lap.ver.x[i], z: -lap.ver.y[i] }));

  // The feed's position samples carry small steps that a camera would feel. Two light passes take
  // them out without moving the line off the road.
  const line = smoothClosed(smoothClosed(raw, 1), 1);
  const road = smoothClosed(raw, 3);

  const total = lap.m[lap.m.length - 1];
  const n = N * DENSE;
  const centre = [];
  const tangent = [];
  const side = [];
  for (let i = 0; i < n; i++) {
    const seg = Math.floor(i / DENSE);
    const t = (i % DENSE) / DENSE;
    const [a, b, c, d] = [road[mod(seg - 1, N)], road[seg], road[mod(seg + 1, N)], road[mod(seg + 2, N)]];
    const tx = slope(a.x, b.x, c.x, d.x, t);
    const tz = slope(a.z, b.z, c.z, d.z, t);
    const len = Math.hypot(tx, tz) || 1;
    centre.push({ x: spline(a.x, b.x, c.x, d.x, t), y: 0, z: spline(a.z, b.z, c.z, d.z, t) });
    tangent.push({ x: tx / len, y: 0, z: tz / len });
    side.push({ x: tz / len, y: 0, z: -tx / len }); // left of travel
  }
  const metres = centre.map((_, i) => (i / n) * total);

  return {
    N,
    n,
    total,
    line,
    centre,
    tangent,
    side,
    metres,

    // A point on the racing line at a fractional lap index.
    pose(index, out = {}) {
      const i = Math.floor(index);
      const t = index - i;
      const [a, b, c, d] = [line[mod(i - 1, N)], line[mod(i, N)], line[mod(i + 1, N)], line[mod(i + 2, N)]];
      const tx = slope(a.x, b.x, c.x, d.x, t);
      const tz = slope(a.z, b.z, c.z, d.z, t);
      const len = Math.hypot(tx, tz) || 1;
      out.x = spline(a.x, b.x, c.x, d.x, t);
      out.z = spline(a.z, b.z, c.z, d.z, t);
      out.tx = tx / len;
      out.tz = tz / len;
      out.yaw = Math.atan2(-tz, tx);
      return out;
    },

    // Nearest place on the road, searching forward and back from where the car last was.
    project(x, z, hint, out = {}) {
      let best = hint;
      let bestD = Infinity;
      for (let k = -90; k <= 90; k++) {
        const j = mod(hint + k, n);
        const c = centre[j];
        const d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      const c = centre[best];
      const s = side[best];
      const t = tangent[best];
      const dx = x - c.x;
      const dz = z - c.z;
      out.i = best;
      out.e = dx * s.x + dz * s.z; // metres left of the road's centre
      out.along = dx * t.x + dz * t.z;
      out.progress = mod(best + out.along / (total / n), n) / DENSE;
      out.tx = t.x;
      out.tz = t.z;
      out.sx = s.x;
      out.sz = s.z;
      return out;
    },
  };
}
