// A Formula 1 car, modelled in code to real proportions: 3.4 m wheelbase, 18-inch wheels, about 5.3 m
// long and 1.9 m wide. Bodywork is lofted through cross-sections the way a surfacing tool would do it.
//
// Axes: +x forward, +y up, z across the car. The origin is on the ground at mid-wheelbase.
// Each part belongs to a named group so the car can be taken apart for the spec section.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintTextures, YELLOW, INK } from './livery.js';

const WHEEL_R = 0.36;
const AXLE_F = 1.7;
const AXLE_R = -1.7;
const TRACK = 0.8;

const catmull = (a, b, c, d, t) =>
  0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

const DEFAULTS = { cz: 0, skew: 0, p: 2 };

// A surface through cross-sections. Returns (u, v) -> point, u along the stations, v round the section
// starting from the bottom so the texture seam stays out of sight.
function lofted(stations, side = 1) {
  const n = stations.length;
  const field = (key, u) => {
    const t = Math.min(n - 1.0001, Math.max(0, u * (n - 1)));
    const i = Math.floor(t);
    const at = (k) => {
      const s = stations[Math.max(0, Math.min(n - 1, k))];
      return s[key] ?? DEFAULTS[key];
    };
    return catmull(at(i - 1), at(i), at(i + 1), at(i + 2), t - i);
  };
  return (u, v, out = new THREE.Vector3()) => {
    const a = v * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const e = 2 / Math.max(1.2, field('p', u));
    const zz = Math.sign(c) * Math.abs(c) ** e;
    const yy = Math.sign(s) * Math.abs(s) ** e;
    const h = yy >= 0 ? field('top', u) : field('bot', u);
    const z = field('cz', u) + zz * field('hw', u) + field('skew', u) * yy;
    return out.set(field('x', u), field('cy', u) + yy * h, z * side);
  };
}

// Makes triangles from a grid of points, flipping the winding if it came out inside-out.
function gridGeometry(rows, cols, point, uvOf = (i, j) => [i / (rows - 1), j / (cols - 1)]) {
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      point(i, j, p);
      p.toArray(pos, (i * cols + j) * 3);
      const [a, b] = uvOf(i, j);
      uv[(i * cols + j) * 2] = a;
      uv[(i * cols + j) * 2 + 1] = b;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + cols;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function outward(g, centre) {
  const pos = g.attributes.position;
  const idx = g.index.array;
  let score = 0;
  const [a, b, c, n, m] = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());
  for (let i = 0; i < idx.length; i += 3 * 37) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    score += n.dot(m.addVectors(a, b).add(c).divideScalar(3).sub(centre(a)));
  }
  if (score < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
  }
  return g;
}

function loftMesh(surface, stations, { along = 64, round = 40, side = 1 } = {}) {
  const g = gridGeometry(along, round + 1, (i, j, p) => surface(i / (along - 1), j / round, p));
  outward(g, (a) => {
    const u = 0.5;
    return new THREE.Vector3(a.x, surface(u, 0.5).y * 0.5 + surface(u, 0).y * 0.5, surface(u, 0.25).z * 0.5 + surface(u, 0.75).z * 0.5);
  });
  g.computeVertexNormals();
  return g;
}

// A flat cap across one end of a loft, used for the sidepod inlets and the tail.
function loftCap(surface, u, round = 40) {
  const pts = [];
  for (let j = 0; j <= round; j++) pts.push(surface(u, j / round));
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
  const pos = [c.x, c.y, c.z];
  const uv = [0.5, 0.5];
  pts.forEach((p) => {
    pos.push(p.x, p.y, p.z);
    uv.push(0.5, 0.5);
  });
  const idx = [];
  for (let j = 1; j <= round; j++) idx.push(0, j, j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A decal: a patch of a lofted surface lifted a couple of millimetres, carrying its own 0-1 UVs.
function decalPatch(surface, [u0, u1], [v0, v1], { lift = 0.003, flipU = false, flipV = false, swap = false, nu = 22, nv = 16 } = {}) {
  const e = 0.002;
  const [a, b, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const g = gridGeometry(
    nu,
    nv,
    (i, j, p) => {
      const u = u0 + (u1 - u0) * (i / (nu - 1));
      const v = v0 + (v1 - v0) * (j / (nv - 1));
      surface(u, v, p);
      surface(u + e, v, a).sub(p);
      surface(u, v + e, b).sub(p);
      n.crossVectors(a, b).normalize();
      if (n.dot(p.clone().setY(p.y - 0.45).setX(0)) < 0) n.negate();
      p.addScaledVector(n, lift);
    },
    (i, j) => {
      let s = i / (nu - 1);
      let t = j / (nv - 1);
      if (flipU) s = 1 - s;
      if (flipV) t = 1 - t;
      return swap ? [t, s] : [s, t];
    },
  );
  g.computeVertexNormals();
  return g;
}

// A wing element swept across the car. at(z) gives the leading edge, chord and pitch of the section.
function wing({ from, to, steps = 26, at, thick = 0.11, camber = 0.05 }) {
  const loop = [];
  const pts = 9;
  const profile = (c) => [camber * Math.sin(Math.PI * c), thick * 0.5 * (1.4845 * Math.sqrt(c) - 0.63 * c - 1.758 * c * c + 1.4215 * c ** 3 - 0.5075 * c ** 4)];
  for (let i = 0; i <= pts; i++) {
    const c = (1 - Math.cos((Math.PI * i) / pts)) / 2;
    const [mid, t] = profile(c);
    loop.push([c, mid + t]);
  }
  for (let i = pts - 1; i >= 0; i--) {
    const c = (1 - Math.cos((Math.PI * i) / pts)) / 2;
    const [mid, t] = profile(c);
    loop.push([c, mid - t]);
  }
  const cols = loop.length;
  const g = gridGeometry(steps, cols, (i, j, p) => {
    const z = from + (to - from) * (i / (steps - 1));
    const s = at(z);
    const [c, t] = loop[j];
    const a = (s.pitch * Math.PI) / 180;
    const local = c * s.chord;
    const up = t * s.chord;
    p.set(s.x - local * Math.cos(a) + up * Math.sin(a), s.y + local * Math.sin(a) + up * Math.cos(a), z);
  });
  outward(g, (a) => {
    const s = at(a.z);
    return new THREE.Vector3(s.x - s.chord * 0.45, s.y + s.chord * 0.12, a.z);
  });
  g.computeVertexNormals();
  return g;
}

const mirrorZ = (g) => {
  const out = g.clone();
  out.scale(1, 1, -1);
  const idx = out.index?.array;
  if (idx) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  } else {
    const p = out.attributes.position;
    const n = out.attributes.normal;
    const uv = out.attributes.uv;
    const swap = (attr, size) => {
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < size; k++) {
          const a = (i + 1) * size + k;
          const b = (i + 2) * size + k;
          const t = attr.array[a];
          attr.array[a] = attr.array[b];
          attr.array[b] = t;
        }
      }
    };
    swap(p, 3);
    if (n) swap(n, 3);
    if (uv) swap(uv, 2);
  }
  out.computeVertexNormals();
  return out;
};

// A rod between two points, oval so it reads as a faired suspension arm.
function strut(a, b, r = 0.012, flat = 3) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const len = A.distanceTo(B);
  g.scale(r * flat, len, r);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

// A thin plate from an outline in the x-y plane, extruded across the car.
function plate(points, depth = 0.012, z = 0) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, z - depth / 2);
  return g;
}

// Same plate with UVs spread 0-1 over its box, so a livery can be laid on it as a picture.
function paintedPlate(points, depth, z) {
  const g = plate(points, depth, z);
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const normal = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const a = (pos.getX(i) - min.x) / (max.x - min.x);
    uv.setXY(i, normal.getZ(i) < 0 ? 1 - a : a, (pos.getY(i) - min.y) / (max.y - min.y));
  }
  return g;
}

function wheelParts(width) {
  const r = WHEEL_R;
  const rim = 0.2286;
  const w = width / 2;
  const profile = [
    [rim, -w + 0.012], [rim + 0.012, -w], [r - 0.034, -w], [r - 0.012, -w + 0.022], [r - 0.002, -w + 0.055],
    [r, -w + 0.09], [r, w - 0.09], [r - 0.002, w - 0.055], [r - 0.012, w - 0.022], [r - 0.034, w], [rim + 0.012, w], [rim, w - 0.012],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre = new THREE.LatheGeometry(profile, 56);
  tyre.rotateX(Math.PI / 2);

  const barrel = new THREE.CylinderGeometry(rim, rim, width * 0.92, 40, 1, true);
  barrel.rotateX(Math.PI / 2);
  const face = new THREE.CircleGeometry(rim + 0.004, 48);
  const hub = new THREE.CylinderGeometry(0.045, 0.055, 0.05, 20);
  hub.rotateX(Math.PI / 2);
  return { tyre, barrel, face, hub, width };
}

const arcs = (inner, outer, z) => {
  const pieces = [0.15, 1.15, 2.25, 3.25, 4.35, 5.35].map((start) => {
    const g = new THREE.RingGeometry(inner, outer, 18, 1, start, 0.62);
    g.translate(0, 0, z);
    return g;
  });
  return mergeGeometries(pieces);
};

export function buildCar(options = {}) {
  const textures = options.textures ?? paintTextures(options.colours);
  const materials = carMaterials(textures, options.colours);
  const bins = new Map();
  const add = (group, mat, g) => {
    const k = `${group}|${mat}`;
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(g.index ? g.toNonIndexed() : g);
  };

  /* Monocoque and nose. */
  const tubStations = [
    { x: 2.68, cy: 0.208, hw: 0.05, top: 0.02, bot: 0.026, p: 2.2 },
    { x: 2.63, cy: 0.214, hw: 0.092, top: 0.031, bot: 0.034, p: 2.4 },
    { x: 2.42, cy: 0.24, hw: 0.122, top: 0.049, bot: 0.05, p: 2.6 },
    { x: 2.12, cy: 0.286, hw: 0.133, top: 0.068, bot: 0.066, p: 2.8 },
    { x: 1.76, cy: 0.352, hw: 0.15, top: 0.098, bot: 0.088, p: 3 },
    { x: 1.4, cy: 0.42, hw: 0.186, top: 0.134, bot: 0.112, p: 3 },
    { x: 1.04, cy: 0.47, hw: 0.246, top: 0.18, bot: 0.16, p: 3.2 },
    { x: 0.7, cy: 0.495, hw: 0.296, top: 0.214, bot: 0.215, p: 3.4 },
    { x: 0.4, cy: 0.5, hw: 0.33, top: 0.224, bot: 0.25, p: 3.6 },
    { x: 0, cy: 0.49, hw: 0.345, top: 0.235, bot: 0.27, p: 3.8 },
    { x: -0.45, cy: 0.47, hw: 0.345, top: 0.25, bot: 0.27, p: 3.8 },
  ];
  const tub = lofted(tubStations);
  add('tub', 'tub', loftMesh(tub, tubStations, { along: 84, round: 44 }));
  add('tub', 'black', loftCap(tub, 0));

  /* Engine cover, airbox and fin. */
  const coverStations = [
    { x: -0.2, cy: 0.74, hw: 0.05, top: 0.1, bot: 0.1, p: 2 },
    { x: -0.34, cy: 0.745, hw: 0.128, top: 0.2, bot: 0.24, p: 2.2 },
    { x: -0.55, cy: 0.72, hw: 0.168, top: 0.25, bot: 0.27, p: 2.4 },
    { x: -0.85, cy: 0.68, hw: 0.186, top: 0.25, bot: 0.26, p: 2.6 },
    { x: -1.25, cy: 0.6, hw: 0.17, top: 0.215, bot: 0.23, p: 2.6 },
    { x: -1.65, cy: 0.5, hw: 0.125, top: 0.165, bot: 0.19, p: 2.4 },
    { x: -2.0, cy: 0.42, hw: 0.08, top: 0.1, bot: 0.13, p: 2.2 },
    { x: -2.3, cy: 0.36, hw: 0.05, top: 0.05, bot: 0.07, p: 2 },
    { x: -2.37, cy: 0.355, hw: 0.018, top: 0.018, bot: 0.03, p: 2 },
  ];
  const cover = lofted(coverStations);
  add('engine', 'cover', loftMesh(cover, coverStations, { along: 72, round: 40 }));

  const inlet = new THREE.SphereGeometry(1, 24, 16);
  inlet.scale(0.03, 0.088, 0.066);
  inlet.translate(-0.316, 0.902, 0);
  add('engine', 'black', inlet);

  const finPts = [[-0.72, 0.9], [-2.05, 0.56], [-2.28, 0.49], [-2.32, 0.6], [-1.6, 0.78], [-0.95, 0.96]];
  add('engine', 'fin', paintedPlate(finPts, 0.008, 0));

  const tcam = new THREE.CapsuleGeometry(0.018, 0.09, 4, 10);
  tcam.rotateZ(Math.PI / 2);
  tcam.translate(-0.42, 0.998, 0);
  add('engine', 'yellow', tcam);

  /* Sidepods. */
  const podStations = [
    { x: 0.62, cz: 0.5, hw: 0.17, cy: 0.455, top: 0.13, bot: 0.12, p: 4.4, skew: 0.05 },
    { x: 0.5, cz: 0.515, hw: 0.2, cy: 0.455, top: 0.145, bot: 0.14, p: 4, skew: 0.05 },
    { x: 0.15, cz: 0.53, hw: 0.222, cy: 0.445, top: 0.168, bot: 0.152, p: 3.6, skew: 0.07 },
    { x: -0.3, cz: 0.5, hw: 0.222, cy: 0.42, top: 0.17, bot: 0.14, p: 3.2, skew: 0.09 },
    { x: -0.8, cz: 0.42, hw: 0.2, cy: 0.37, top: 0.14, bot: 0.1, p: 2.8, skew: 0.08 },
    { x: -1.3, cz: 0.31, hw: 0.155, cy: 0.3, top: 0.09, bot: 0.07, p: 2.4, skew: 0.04 },
    { x: -1.75, cz: 0.2, hw: 0.095, cy: 0.24, top: 0.045, bot: 0.04, p: 2.2 },
    { x: -2.02, cz: 0.14, hw: 0.04, cy: 0.215, top: 0.018, bot: 0.018, p: 2 },
  ];
  for (const side of [1, -1]) {
    const pod = lofted(podStations, side);
    const podGroup = side > 0 ? 'podL' : 'podR';
    add(podGroup, 'pod', loftMesh(pod, podStations, { along: 72, round: 40, side }));
    add(podGroup, 'black', loftCap(pod, 0));
    // The inlet's lip, a thin frame just proud of the dark mouth.
    add(podGroup, 'kam', decalPatch(pod, [0.2, 0.5], [0.13, 0.36], { lift: 0.004, flipU: side > 0, nu: 30, nv: 16 }));
  }

  /* Floor, with the edge wing and a plank down the middle. */
  const floorHalf = [[1.42, 0.14], [1.12, 0.2], [0.84, 0.44], [0.62, 0.68], [0.44, 0.76], [-1.02, 0.8], [-1.5, 0.78], [-1.84, 0.68], [-2.12, 0.54]];
  const floorShape = new THREE.Shape();
  floorHalf.forEach(([x, z], i) => (i ? floorShape.lineTo(x, z) : floorShape.moveTo(x, z)));
  [...floorHalf].reverse().forEach(([x, z]) => floorShape.lineTo(x, -z));
  floorShape.closePath();
  const floor = new THREE.ExtrudeGeometry(floorShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  floor.rotateX(Math.PI / 2);
  floor.translate(0, 0.09, 0);
  add('floor', 'carbon', floor);

  for (const side of [1, -1]) {
    const fence = plate([[0.55, 0.09], [-1.05, 0.09], [-1.05, 0.135], [-0.3, 0.145], [0.3, 0.135], [0.55, 0.11]], 0.008, 0.792 * side);
    add('floor', 'carbon', fence);
    for (let i = 0; i < 4; i++) {
      const z = (0.32 + i * 0.095) * side;
      add('floor', 'carbon', plate([[0.82 - i * 0.09, 0.09], [0.4 - i * 0.05, 0.09], [0.4 - i * 0.05, 0.16], [0.74 - i * 0.09, 0.125]], 0.006, z));
    }
  }

  /* Diffuser. */
  const rampGrid = gridGeometry(12, 9, (i, j, p) => {
    const t = i / 11;
    const z = (j / 8 - 0.5) * 1.06 * (1 - t * 0.04);
    p.set(-1.62 - t * 0.5, 0.075 + 0.21 * t ** 1.8, z);
  });
  rampGrid.computeVertexNormals();
  add('floor', 'black', rampGrid);
  for (let i = -2; i <= 2; i++) {
    add('floor', 'carbon', plate([[-1.68, 0.08], [-2.14, 0.08], [-2.14, 0.3], [-1.92, 0.19]], 0.008, i * 0.125));
  }
  for (const side of [1, -1]) add('floor', 'carbon', plate([[-1.7, 0.08], [-2.16, 0.08], [-2.16, 0.33], [-1.92, 0.21]], 0.012, 0.53 * side));

  /* Front wing: four elements, rising towards the endplates. */
  const span = 0.9;
  const elements = [
    { x: 2.86, sweep: 0.11, y: 0.085, rise: 0.016, chord: 0.2, pitch: 5 },
    { x: 2.69, sweep: 0.14, y: 0.112, rise: 0.05, chord: 0.17, pitch: 15 },
    { x: 2.54, sweep: 0.15, y: 0.158, rise: 0.09, chord: 0.15, pitch: 27 },
    { x: 2.41, sweep: 0.16, y: 0.214, rise: 0.12, chord: 0.125, pitch: 40 },
  ];
  elements.forEach((e, i) => {
    const at = (z) => {
      const k = Math.abs(z) / span;
      return { x: e.x - e.sweep * k * k, y: e.y + e.rise * k ** 3 + 0.03 * (1 - k) ** 6, chord: e.chord * (1 - 0.1 * k), pitch: e.pitch + 5 * k };
    };
    add('frontWing', i === 3 ? 'yellow' : 'carbon', wing({ from: -span, to: span, steps: 48, at, thick: 0.13 }));
  });
  const fwPlate = [[2.8, 0.04], [2.3, 0.04], [2.24, 0.1], [2.23, 0.25], [2.31, 0.31], [2.52, 0.27], [2.72, 0.17], [2.82, 0.09]];
  for (const side of [1, -1]) add('frontWing', 'yellow', plate(fwPlate, 0.014, 0.907 * side));
  for (const side of [1, -1]) {
    add('frontWing', 'carbon', plate([[2.5, 0.1], [2.34, 0.13], [2.32, 0.23], [2.46, 0.25], [2.58, 0.2]], 0.012, 0.1 * side));
  }

  /* Rear wing: main plane, flap, beam wing, endplates and the swan-neck pylons. */
  const rSpan = 0.5;
  add('rearWing', 'carbon', wing({ from: -rSpan, to: rSpan, steps: 26, thick: 0.13, at: (z) => ({ x: -2.3, y: 0.84 - 0.045 * (Math.abs(z) / rSpan) ** 4, chord: 0.27, pitch: 9 }) }));
  add('rearWing', 'yellow', wing({ from: -rSpan, to: rSpan, steps: 26, thick: 0.14, at: (z) => ({ x: -2.56, y: 0.905 - 0.03 * (Math.abs(z) / rSpan) ** 4, chord: 0.115, pitch: 34 }) }));
  add('rearWing', 'carbon', wing({ from: -0.42, to: 0.42, steps: 16, thick: 0.13, at: () => ({ x: -2.33, y: 0.47, chord: 0.15, pitch: 13 }) }));
  add('rearWing', 'carbon', wing({ from: -0.42, to: 0.42, steps: 16, thick: 0.13, at: () => ({ x: -2.47, y: 0.525, chord: 0.1, pitch: 26 }) }));
  const rwPlate = [[-2.26, 0.42], [-2.72, 0.42], [-2.73, 1.0], [-2.66, 1.05], [-2.34, 1.05], [-2.27, 0.98]];
  add('rearWing', 'endplate', paintedPlate(rwPlate, 0.016, rSpan + 0.008));
  add('rearWing', 'endplate', paintedPlate(rwPlate, 0.016, -rSpan - 0.008));
  for (const z of [0.07, -0.07]) add('rearWing', 'carbon', plate([[-2.2, 0.36], [-2.42, 0.36], [-2.44, 0.84], [-2.34, 0.86], [-2.3, 0.6]], 0.012, z));

  const light = new THREE.BoxGeometry(0.03, 0.06, 0.12);
  light.translate(-2.39, 0.345, 0);
  add('rearWing', 'glow', light);

  /* Halo. */
  const haloPath = new THREE.CatmullRomCurve3(
    [[-0.3, 0.76, 0.3], [-0.14, 0.86, 0.285], [0.12, 0.905, 0.235], [0.33, 0.92, 0.12], [0.4, 0.925, 0], [0.33, 0.92, -0.12], [0.12, 0.905, -0.235], [-0.14, 0.86, -0.285], [-0.3, 0.76, -0.3]].map((p) => new THREE.Vector3(...p)),
  );
  add('halo', 'halo', new THREE.TubeGeometry(haloPath, 70, 0.024, 10));
  const pylon = new THREE.CatmullRomCurve3([[0.4, 0.925, 0], [0.52, 0.87, 0], [0.68, 0.74, 0]].map((p) => new THREE.Vector3(...p)));
  const pylonGeo = new THREE.TubeGeometry(pylon, 16, 0.03, 10);
  pylonGeo.scale(1, 1, 0.62);
  add('halo', 'halo', pylonGeo);

  /* Cockpit: coaming, seat well, helmet, wheel, mirrors. */
  const coamingShape = new THREE.CatmullRomCurve3(
    [[0.46, 0.0], [0.34, 0.2], [0.05, 0.27], [-0.25, 0.25], [-0.34, 0.12], [-0.34, -0.12], [-0.25, -0.25], [0.05, -0.27], [0.34, -0.2]].map(([x, z]) => new THREE.Vector3(x, 0.735, z)),
    true,
  );
  add('tub', 'black', new THREE.TubeGeometry(coamingShape, 80, 0.016, 8, true));
  const well = new THREE.Shape();
  coamingShape.getPoints(50).forEach((p, i) => (i ? well.lineTo(p.x, p.z) : well.moveTo(p.x, p.z)));
  const wellGeo = new THREE.ShapeGeometry(well);
  wellGeo.rotateX(Math.PI / 2);
  wellGeo.translate(0, 0.732, 0);
  add('tub', 'dark', wellGeo);

  const helmet = new THREE.SphereGeometry(0.128, 28, 20);
  helmet.scale(1.08, 1, 0.98);
  helmet.translate(-0.04, 0.85, 0);
  add('driver', 'helmet', helmet);
  const visor = new THREE.SphereGeometry(0.1305, 24, 12, Math.PI - 0.95, 1.9, 1.04, 0.62);
  visor.scale(1.08, 1, 0.98);
  visor.translate(-0.04, 0.85, 0);
  add('driver', 'visor', visor);
  const collar = new THREE.CylinderGeometry(0.09, 0.15, 0.1, 16);
  collar.translate(-0.05, 0.745, 0);
  add('driver', 'dark', collar);
  const steering = new THREE.BoxGeometry(0.04, 0.12, 0.24);
  steering.rotateZ(-0.5);
  steering.translate(0.24, 0.72, 0);
  add('driver', 'dark', steering);

  for (const side of [1, -1]) {
    const pod = new THREE.SphereGeometry(1, 16, 12);
    pod.scale(0.055, 0.04, 0.085);
    pod.translate(0.34, 0.755, 0.53 * side);
    add('tub', 'black', pod);
    const stalk = strut([0.34, 0.745, 0.3 * side], [0.34, 0.755, 0.5 * side], 0.006, 2.4);
    add('tub', 'carbon', stalk);
  }

  /* Suspension. */
  const frontArms = [
    [[1.92, 0.52, 0.12], [1.72, 0.47, 0.66]], [[1.5, 0.52, 0.19], [1.68, 0.47, 0.66]],
    [[1.98, 0.27, 0.13], [1.72, 0.2, 0.66]], [[1.42, 0.3, 0.18], [1.68, 0.2, 0.66]],
    [[1.62, 0.6, 0.14], [1.7, 0.22, 0.64]], [[1.84, 0.4, 0.14], [1.8, 0.33, 0.66]],
  ];
  const rearArms = [
    [[-1.42, 0.5, 0.14], [-1.68, 0.54, 0.64]], [[-1.95, 0.5, 0.1], [-1.72, 0.54, 0.64]],
    [[-1.42, 0.24, 0.16], [-1.68, 0.2, 0.64]], [[-1.95, 0.24, 0.1], [-1.72, 0.2, 0.64]],
    [[-1.58, 0.56, 0.12], [-1.7, 0.22, 0.62]],
  ];
  for (const side of [1, -1]) {
    for (const [a, b] of frontArms) add('frontAxle', 'carbon', strut([a[0], a[1], a[2] * side], [b[0], b[1], b[2] * side], 0.0095));
    for (const [a, b] of rearArms) add('rearAxle', 'carbon', strut([a[0], a[1], a[2] * side], [b[0], b[1], b[2] * side], 0.0095));
    const duct = new THREE.CylinderGeometry(0.16, 0.13, 0.17, 24);
    duct.rotateX(Math.PI / 2);
    const rearDuct = duct.clone();
    duct.translate(AXLE_F, WHEEL_R, 0.62 * side);
    rearDuct.translate(AXLE_R, WHEEL_R, 0.6 * side);
    add('frontAxle', 'carbon', duct);
    add('rearAxle', 'carbon', rearDuct);
  }

  const car = new THREE.Group();
  car.name = 'car';
  const groups = {};
  for (const [key, list] of bins) {
    const [group, mat] = key.split('|');
    if (!groups[group]) {
      groups[group] = new THREE.Group();
      groups[group].name = group;
      car.add(groups[group]);
    }
    const prepared = list.map((g) => {
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(prepared, false), materials[mat]);
    mesh.name = key;
    mesh.castShadow = true;
    groups[group].add(mesh);
  }

  /* Wheels, each in its own group so they can spin and steer. */
  const front = wheelParts(0.31);
  const rear = wheelParts(0.39);
  const wheels = [];
  const placeWheel = (parts, x, z, name) => {
    const steer = new THREE.Group();
    steer.position.set(x, WHEEL_R, z);
    steer.name = name;
    const spin = new THREE.Group();
    const side = Math.sign(z);
    const tyre = new THREE.Mesh(parts.tyre, materials.tyre);
    tyre.castShadow = true;
    const barrel = new THREE.Mesh(parts.barrel, materials.rim);
    const face = new THREE.Mesh(parts.face, materials.wheel);
    face.position.z = (parts.width / 2 - 0.012) * side;
    if (side < 0) face.rotation.y = Math.PI;
    const hub = new THREE.Mesh(parts.hub, materials.yellow);
    hub.position.z = (parts.width / 2 - 0.004) * side;
    const marks = new THREE.Mesh(arcs(0.268, 0.298, 0), materials.marks);
    marks.position.z = (parts.width / 2 + 0.0015) * side;
    if (side < 0) marks.rotation.y = Math.PI;
    spin.add(tyre, barrel, face, hub, marks);
    steer.add(spin);
    car.add(steer);
    wheels.push({ steer, spin, front: x > 0 });
    groups[name] = steer;
  };
  placeWheel(front, AXLE_F, TRACK + 0.005, 'wheelFL');
  placeWheel(front, AXLE_F, -TRACK - 0.005, 'wheelFR');
  placeWheel(rear, AXLE_R, TRACK - 0.005, 'wheelRL');
  placeWheel(rear, AXLE_R, -TRACK + 0.005, 'wheelRR');

  /* Lettering, laid on the surfaces as decals. */
  const decal = (group, name, g, tex) => {
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    m.name = name;
    m.renderOrder = 2;
    groups[group].add(m);
  };
  decal('tub', 'nose-number', decalPatch(tub, [0.28, 0.36], [0.42, 0.58], { lift: 0.0025, swap: true, flipV: true }), textures.number);

  car.parts = { groups, wheels, materials, textures };
  return car;
}

// A plain-painted copy of the car for the two real drivers in the analysis. Shares all the geometry.
export function repaint(car, colours) {
  const textures = paintTextures(colours);
  const copy = car.clone(true);
  const swap = {
    'tub|tub': textures.tub,
    'engine|cover': textures.cover,
    'podL|pod': textures.pod,
    'podR|pod': textures.pod,
    'engine|fin': textures.fin,
    'rearWing|endplate': textures.endplate,
  };
  const accent = new THREE.Color(colours.accent);
  const painted = new Map();
  copy.traverse((o) => {
    if (!o.isMesh) return;
    if (swap[o.name]) {
      const m = o.material.clone();
      m.map = swap[o.name];
      o.material = m;
    } else if (o.name.endsWith('|kam') || o.name === 'nose-number') {
      o.visible = false;
    } else if (o.material === car.parts.materials.yellow || o.material === car.parts.materials.helmet || o.material === car.parts.materials.marks) {
      if (!painted.has(o.material)) {
        const m = o.material.clone();
        m.color.copy(accent);
        painted.set(o.material, m);
      }
      o.material = painted.get(o.material);
    }
  });
  const wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].map((name) => {
    const steer = copy.getObjectByName(name);
    return { steer, spin: steer.children[0], front: name.startsWith('wheelF') };
  });
  copy.parts = { wheels };
  return copy;
}

function carMaterials(t, colours = {}) {
  const coat = { clearcoat: 1, clearcoatRoughness: 0.07, roughness: 0.34, metalness: 0.06 };
  const accent = colours.accent ?? YELLOW;
  const yellow = new THREE.MeshPhysicalMaterial({ color: accent, ...coat });
  return {
    tub: new THREE.MeshPhysicalMaterial({ map: t.tub, ...coat }),
    cover: new THREE.MeshPhysicalMaterial({ map: t.cover, ...coat }),
    pod: new THREE.MeshPhysicalMaterial({ map: t.pod, ...coat }),
    fin: new THREE.MeshPhysicalMaterial({ map: t.fin, ...coat, side: THREE.DoubleSide }),
    endplate: new THREE.MeshPhysicalMaterial({ map: t.endplate, ...coat }),
    kam: new THREE.MeshPhysicalMaterial({ map: t.kam, transparent: true, ...coat, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
    yellow,
    black: new THREE.MeshPhysicalMaterial({ color: INK, roughness: 0.48, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.85, side: THREE.DoubleSide }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x1c1e22, map: t.carbon, roughness: 0.5, metalness: 0.05, clearcoat: 0.45, clearcoatRoughness: 0.32 }),
    halo: new THREE.MeshPhysicalMaterial({ color: 0x0d0e11, roughness: 0.36, metalness: 0.3, clearcoat: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.08, metalness: 0.9, clearcoat: 1 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.74, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }),
    wheel: new THREE.MeshPhysicalMaterial({ map: t.wheel, roughness: 0.4, metalness: 0.35, clearcoat: 0.6 }),
    marks: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 0.01, 0.008) }),
  };
}
