// The real Marina Bay: the circuit from the pole lap's own position data, and the city around it from
// OpenStreetMap, all in the telemetry frame (metres, x east, y north). In the scene that becomes
// x east, y up, z south.
import * as THREE from 'three';
import { DENSE } from './track.js';

const noise = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float grain(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
`;

const finish = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const HAZE = new THREE.Color(0x0e1c30);
const FOG = 0.00042;

const shared = {
  uCam: { value: new THREE.Vector3() },
  uHaze: { value: HAZE },
  uFog: { value: FOG },
};

const fogged = /* glsl */ `
  uniform vec3 uCam;
  uniform vec3 uHaze;
  uniform float uFog;
  vec3 hazed(vec3 c, vec3 p) { return mix(c, uHaze, 1.0 - exp(-length(p - uCam) * uFog)); }
`;

const basicVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vP;
  void main() {
    vUv = uv;
    vP = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
  }
`;

// Everything lying on the ground is drawn in a fixed order with no depth test. At 1.5 km the depth
// buffer cannot separate layers a few centimetres apart, and all of them sit under anything with height.
const painted = { depthTest: false, depthWrite: false, side: THREE.DoubleSide };

export const SPACING = 30; // metres between the floodlight rows, which sets the pools of light

// A strip that follows the road at two offsets from its centre line.
function strip(f, a, b, { y0 = 0, y1 = y0, from = 0, count = f.n, closed = true, flip = false } = {}) {
  const pos = [];
  const uv = [];
  const steps = closed ? count + 1 : count;
  for (let k = 0; k < steps; k++) {
    const i = (from + k) % f.n;
    const c = f.centre[i];
    const s = f.side[i];
    const m = ((from + k) / f.n) * f.total;
    pos.push(c.x + s.x * a, y0, c.z + s.z * a, c.x + s.x * b, y1, c.z + s.z * b);
    uv.push(-1, m, 1, m);
  }
  const idx = [];
  for (let k = 0; k < steps - 1; k++) {
    const q = k * 2;
    if (flip) idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    else idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function boards() {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 128;
  const ctx = c.getContext('2d');
  // Where a real track carries sponsors, this one carries Eugene's numbers.
  const texts = ['98%+ SLA', 'KAM', '95%+ ACCURACY', '54', '10× SURGE', 'KAM', '1,000+ VESSELS', '54'];
  const w = c.width / texts.length;
  texts.forEach((t, i) => {
    ctx.fillStyle = i % 2 ? '#ffd60a' : '#101114';
    ctx.fillRect(i * w, 0, w, c.height);
    ctx.fillStyle = i % 2 ? '#0b0c0e' : '#f4f3ee';
    ctx.font = '600 70px "Albert Sans Variable", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, (i + 0.5) * w, c.height * 0.54);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function fenceTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 64);
  ctx.moveTo(64, 0);
  ctx.lineTo(0, 64);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function buildTrack(f, lap) {
  const group = new THREE.Group();
  group.name = 'track';
  const half = 6.6;

  const road = new THREE.Mesh(
    strip(f, -half, half, { y0: 0.02 }),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uSpace: { value: SPACING } },
      vertexShader: basicVertex,
      ...painted,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vP;
        uniform float uSpace;
        ${fogged} ${noise}
        void main() {
          float far = smoothstep(120.0, 500.0, length(uCam - vP));
          float pool = mix(0.62 + 0.38 * cos(vUv.y * 6.2832 / uSpace), 1.0, far);
          float across = 1.0 - 0.3 * vUv.x * vUv.x;
          float fine = grain(vP.xz * 5.5) * 0.5 + grain(vP.xz * 21.0) * 0.5;
          float laid = 0.92 + 0.14 * grain(vec2(vP.x + vP.z, vP.x - vP.z) * 0.5);
          float rubber = 1.0 - 0.28 * exp(-pow(vUv.x * 2.4, 2.0));
          vec3 asphalt = vec3(0.058, 0.06, 0.066) * (0.84 + 0.32 * fine) * laid * rubber * pool * across * (1.5 + far * 5.0);
          vec3 V = normalize(uCam - vP);
          float grazing = pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          vec3 sheen = vec3(0.62, 0.66, 0.78) * grazing * pool * 0.34;
          float line = smoothstep(0.895, 0.905, abs(vUv.x)) * smoothstep(0.955, 0.945, abs(vUv.x));
          vec3 c = mix(asphalt + sheen, vec3(0.92) * (0.5 + 0.5 * pool), line);
          gl_FragColor = vec4(hazed(c, vP), 1.0);
          ${finish}
        }
      `,
    }),
  );
  road.renderOrder = -5;
  group.add(road);

  // Kerbs on the inside of each corner, on whichever side the corner really turns.
  const kerbParts = [];
  for (const c of lap.corners) {
    const at = c.i * DENSE;
    const a = f.tangent[(at - 4 * DENSE + f.n) % f.n];
    const b = f.tangent[(at + 4 * DENSE) % f.n];
    const turn = a.x * b.z - a.z * b.x; // negative turns left of travel
    const reach = 5 * DENSE;
    const inner = turn < 0 ? half - 0.1 : -half - 1.2;
    const options = { y0: 0.05, y1: 0.05, from: (at - reach + f.n) % f.n, count: reach * 2 + 1, closed: false };
    kerbParts.push(strip(f, inner, inner + 1.3, options));
    const outer = turn < 0 ? -half - 1.2 : half - 0.1;
    kerbParts.push(strip(f, outer, outer + 1.3, { ...options, from: (at + DENSE) % f.n, count: reach + 2 * DENSE }));
  }
  const kerbs = merge(kerbParts);
  group.add(
    Object.assign(new THREE.Mesh(
      kerbs,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uSpace: { value: SPACING } },
        vertexShader: basicVertex,
        ...painted,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vP; uniform float uSpace;
          ${fogged}
          void main() {
            float pool = 0.66 + 0.34 * cos(vUv.y * 6.2832 / uSpace);
            vec3 c = step(0.5, fract(vUv.y / 6.0)) > 0.5 ? vec3(0.62, 0.035, 0.03) : vec3(0.74);
            gl_FragColor = vec4(hazed(c * pool, vP), 1.0);
            ${finish}
          }
        `,
      }),
    ), { renderOrder: -4 }),
  );

  // Concrete barriers with boards, and catch fencing above them.
  const wallAt = half + 2.4;
  const board = boards();
  const wallMaterial = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: board }, uSpace: { value: SPACING } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vP;
      void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vP; uniform sampler2D uMap; uniform float uSpace;
      ${fogged}
      void main() {
        float pool = 0.7 + 0.3 * cos(vUv.y * 6.2832 / uSpace);
        vec3 c = texture2D(uMap, vec2(vUv.y / 48.0, vP.y / 1.2)).rgb;
        c = pow(c, vec3(2.2)) * 0.8 * pool;
        gl_FragColor = vec4(hazed(c, vP), 1.0);
        ${finish}
      }
    `,
  });
  const fenceMaterial = new THREE.MeshBasicMaterial({ color: 0x7c8694, alphaMap: fenceTexture(), side: THREE.DoubleSide, transparent: true, opacity: 0.22, depthWrite: false });
  for (const s of [1, -1]) {
    const wall = wallGeometry(f, wallAt * s, 0, 1.2, s);
    group.add(Object.assign(new THREE.Mesh(wall, wallMaterial), { name: s > 0 ? 'nearWall' : 'farWall' }));
    const fence = wallGeometry(f, wallAt * s + 0.12 * s, 1.2, 4.2);
    const uv = fence.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) / 0.3, i % 2 ? 10 : 0);
    group.add(Object.assign(new THREE.Mesh(fence, fenceMaterial), { name: 'fence' }));
  }
  group.add(floodlights(f, wallAt));
  group.add(startLine(f, half));
  return group;
}

function wallGeometry(f, offset, y0, y1, along = 1) {
  const pos = [];
  const uv = [];
  const { total } = f;
  for (let i = 0; i <= f.n; i++) {
    const k = i % f.n;
    const c = f.centre[k];
    const s = f.side[k];
    const m = (i / f.n) * total * along;
    pos.push(c.x + s.x * offset, y0, c.z + s.z * offset, c.x + s.x * offset, y1, c.z + s.z * offset);
    uv.push(0, m, 1, m);
  }
  const idx = [];
  for (let i = 0; i < f.n; i++) {
    const q = i * 2;
    idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function floodlights(f, wallAt) {
  const group = new THREE.Group();
  const count = Math.floor(f.N / 3);
  const poleGeo = new THREE.BoxGeometry(0.22, 11.5, 0.22);
  poleGeo.translate(0, 5.75, 0);
  const armGeo = new THREE.BoxGeometry(0.16, 0.16, 4.6);
  armGeo.translate(0, 11.2, -2.3);
  const lampGeo = new THREE.BoxGeometry(2.6, 0.2, 0.7);
  lampGeo.translate(0, 10.95, -4.3);
  const metal = new THREE.MeshBasicMaterial({ color: 0x14161b });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 5.4, 5.1) });
  const poles = new THREE.InstancedMesh(poleGeo, metal, count);
  const arms = new THREE.InstancedMesh(armGeo, metal, count);
  const lamps = new THREE.InstancedMesh(lampGeo, lit, count);
  const glow = new Float32Array(count * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    const i = k * 3 * DENSE;
    const sign = k % 2 ? 1 : -1;
    const c = f.centre[i];
    const s = f.side[i];
    p.copy(c).addScaledVector(s, (wallAt + 1.6) * sign);
    const yaw = Math.atan2(s.x * sign, s.z * sign);
    q.setFromAxisAngle(up, yaw);
    m.compose(p, q, one);
    poles.setMatrixAt(k, m);
    arms.setMatrixAt(k, m);
    lamps.setMatrixAt(k, m);
    const lampAt = p.clone().addScaledVector(s, -4.3 * sign);
    lampAt.y = 10.9;
    lampAt.toArray(glow, k * 3);
  }
  group.add(poles, arms, lamps);

  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.BufferAttribute(glow, 3));
  const halo = new THREE.Points(
    points,
    new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1000 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(uScale * 9.0 / -mv.z, 2.0, 180.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = pow(max(0.0, 1.0 - d), 3.0);
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 1.1, a);
        }
      `,
    }),
  );
  halo.frustumCulled = false;
  group.userData.halo = halo;
  group.add(halo);
  group.name = 'floodlights';
  return group;
}

function startLine(f, half) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#101114' : '#f4f3ee';
      ctx.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, half * 2), new THREE.MeshBasicMaterial({ map: t, color: 0x9a9a9a }));
  mesh.rotation.x = -Math.PI / 2;
  const yaw = Math.atan2(f.tangent[0].x, f.tangent[0].z);
  const holder = new THREE.Group();
  holder.position.copy(f.centre[0]);
  holder.position.y = 0.04;
  holder.rotation.y = yaw - Math.PI / 2;
  holder.add(mesh);
  return holder;
}

function merge(list) {
  const pos = [];
  const uv = [];
  const idx = [];
  let base = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

/* The city. */

export function parseCity(buffer) {
  const d = new Int16Array(buffer);
  const S = 0.5;
  let o = 0;
  const [nb, nw, np, nr] = [d[o++], d[o++], d[o++], d[o++]];
  const ring = (n) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(d[o++] * S, d[o++] * S));
    return pts;
  };
  const buildings = [];
  for (let i = 0; i < nb; i++) {
    const top = d[o++] * S;
    const base = d[o++] * S;
    buildings.push({ top, base, ring: ring(d[o++]) });
  }
  const water = [];
  for (let i = 0; i < nw; i++) water.push(ring(d[o++]));
  const parks = [];
  for (let i = 0; i < np; i++) parks.push(ring(d[o++]));
  const roads = [];
  for (let i = 0; i < nr; i++) {
    const major = d[o++] === 1;
    roads.push({ major, line: ring(d[o++]) });
  }
  return { buildings, water, parks, roads };
}

export function buildCity(city, { detail = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'city';
  const buildings = buildingCells(city.buildings, detail);
  group.add(buildings);
  group.add(flatMesh(city.parks, 0.0, parkMaterial(), -8));
  group.add(roadMesh(city.roads, detail));
  const water = flatMesh(city.water, 0.01, waterMaterial(), -6);
  group.add(water);
  if (detail >= 1) {
    group.add(reflection(buildings));
    group.add(waterSurface(water.geometry));
  }
  group.add(ground());
  group.add(beacons(city.buildings));
  group.add(flyer());
  group.add(lasers());
  group.add(sky());
  return group;
}

const CELL = 420; // metres

function buildingCells(buildings, detail) {
  const cells = new Map();
  for (const b of buildings) {
    if (detail < 1 && b.top <= 14) continue;
    let ring = b.ring;
    if (Math.abs(THREE.ShapeUtils.area(ring)) < 12) continue;
    if (THREE.ShapeUtils.area(ring) < 0) ring = [...ring].reverse();
    const key = `${Math.floor(ring[0].x / CELL)}:${Math.floor(ring[0].y / CELL)}`;
    if (!cells.has(key)) cells.set(key, { pos: [], nor: [] });
    const { pos, nor } = cells.get(key);
    const put = (x, y, z, nx, ny, nz) => {
      pos.push(x, y, z);
      nor.push(nx, ny, nz);
    };
    for (const tri of THREE.ShapeUtils.triangulateShape(ring, [])) {
      for (const k of tri) put(ring[k].x, b.top, -ring[k].y, 0, 1, 0);
    }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const [nx, nz] = [dy / len, dx / len];
      put(p.x, b.base, -p.y, nx, 0, nz);
      put(q.x, b.base, -q.y, nx, 0, nz);
      put(q.x, b.top, -q.y, nx, 0, nz);
      put(p.x, b.base, -p.y, nx, 0, nz);
      put(q.x, b.top, -q.y, nx, 0, nz);
      put(p.x, b.top, -p.y, nx, 0, nz);
    }
  }
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN;
      void main() { vP = position; vN = normal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: buildingShader,
  });
  const group = new THREE.Group();
  group.name = 'buildings';
  for (const { pos, nor } of cells.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, material));
  }
  return group;
}

// The city mirrored in the bay: drawn flipped, only where the water marked the stencil.
function reflection(buildings) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    side: THREE.BackSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.EqualStencilFunc,
    stencilZPass: THREE.KeepStencilOp,
    vertexShader: /* glsl */ `
      varying vec3 vP; varying vec3 vN;
      void main() {
        vP = position; vN = normal;
        gl_Position = projectionMatrix * viewMatrix * vec4(position.x, -position.y, position.z, 1.0);
      }
    `,
    fragmentShader: buildingShader,
  });
  const group = new THREE.Group();
  group.name = 'reflection';
  for (const cell of buildings.children) {
    const m = new THREE.Mesh(cell.geometry, material);
    m.frustumCulled = false;
    m.renderOrder = -5.9;
    group.add(m);
  }
  return group;
}

// The water's own surface over the reflection: it darkens it and breaks it into ripples.
function waterSurface(geometry) {
  const m = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uTime: { value: 0 } },
      ...painted,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: worldVertex,
      fragmentShader: /* glsl */ `
        varying vec3 vP; uniform float uTime;
        ${fogged} ${noise}
        void main() {
          float a = grain(vP.xz * vec2(0.34, 0.09) + uTime * 0.1);
          float b = grain(vP.xz * vec2(0.1, 0.55) - uTime * 0.07);
          float ripple = a * b;
          vec3 c = vec3(0.004, 0.009, 0.018) + vec3(0.2, 0.26, 0.36) * smoothstep(0.46, 0.8, ripple) * 0.28;
          gl_FragColor = vec4(hazed(c, vP), 0.42 + 0.46 * smoothstep(0.1, 0.5, ripple));
          ${finish}
        }
      `,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = -5.8;
  return m;
}

const buildingShader = /* glsl */ `
        varying vec3 vP; varying vec3 vN;
        ${fogged}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          // Everything below depends only on position, so overlapping map footprints shade alike
          // and cannot shimmer where their walls coincide.
          float vSeed = hash(floor(vP.xz / 52.0)) + 0.001;
          vec3 n = normalize(vN);
          vec3 c;
          if (abs(n.y) > 0.5) {
            c = vec3(0.012, 0.015, 0.022);
          } else {
            float along = abs(n.x) > abs(n.z) ? vP.z : vP.x;
            vec2 g = vec2(along / (2.1 + 1.3 * fract(vSeed * 17.0)), vP.y / 3.5);
            vec2 id = floor(g), f = fract(g);
            float busy = 0.14 + 0.36 * fract(vSeed * 3.1);
            float lit = step(1.0 - busy, hash(id + vSeed * 91.0));
            float pane = smoothstep(0.12, 0.17, f.x) * smoothstep(0.12, 0.17, 1.0 - f.x) * smoothstep(0.2, 0.26, f.y) * smoothstep(0.1, 0.15, 1.0 - f.y);
            pane *= 1.0 - 0.8 * step(abs(f.x - 0.5), 0.022);
            pane *= 0.72 + 0.28 * smoothstep(0.3, 0.8, f.y);
            float blur = clamp(fwidth(g.x) + fwidth(g.y), 0.0, 1.0);
            float cluster = hash(floor(vec2(id.x / 5.0, id.y / 3.0)) + vSeed * 37.0);
            float amount = mix(lit * pane, busy * 0.16 * (0.25 + 1.5 * cluster * cluster), smoothstep(0.3, 0.85, blur));
            vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(0.72, 0.86, 1.0), step(0.55, fract(vSeed * 7.7)));
            warm = mix(warm, vec3(1.0), 0.28 * hash(id * 1.3));
            vec3 wall = vec3(0.018, 0.024, 0.036) + vec3(0.014, 0.018, 0.028) * (n.x * 0.5 + 0.5);
            c = wall + warm * amount * (0.34 + 0.62 * hash(id * 2.1 + vSeed));
            c += vec3(0.11, 0.075, 0.045) * exp(-vP.y / 10.0);
          }
          gl_FragColor = vec4(hazed(c, vP), 1.0);
          ${finish}
        }
`;

function flatMesh(rings, y, material, order) {
  const pos = [];
  for (const raw of rings) {
    const ring = THREE.ShapeUtils.area(raw) < 0 ? [...raw].reverse() : raw;
    for (const tri of THREE.ShapeUtils.triangulateShape(ring, [])) {
      for (const k of tri) pos.push(ring[k].x, y, -ring[k].y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

const worldVertex = /* glsl */ `
  varying vec3 vP;
  void main() { vP = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
`;

function parkMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: worldVertex,
    ...painted,
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      ${fogged} ${noise}
      void main() {
        float n = grain(vP.xz * 0.09) * 0.6 + grain(vP.xz * 0.5) * 0.4;
        gl_FragColor = vec4(hazed(vec3(0.012, 0.03, 0.02) * (0.5 + n * 1.2), vP), 1.0);
        ${finish}
      }
    `,
  });
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, uTime: { value: 0 } },
    vertexShader: worldVertex,
    ...painted,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
    fragmentShader: /* glsl */ `
      varying vec3 vP; uniform float uTime;
      ${fogged} ${noise}
      void main() {
        vec3 V = normalize(uCam - vP);
        float ripple = grain(vP.xz * vec2(0.5, 0.11) + uTime * 0.12) * grain(vP.xz * vec2(0.13, 0.7) - uTime * 0.09);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        vec3 c = vec3(0.003, 0.006, 0.012) + vec3(0.05, 0.08, 0.14) * fres * (0.25 + ripple);
        c += vec3(0.5, 0.36, 0.2) * smoothstep(0.62, 0.84, ripple) * fres;
        gl_FragColor = vec4(hazed(c, vP), 1.0);
        ${finish}
      }
    `,
  });
}

function roadMesh(roads, detail) {
  const pos = [];
  const shade = [];
  for (const { major, line } of roads) {
    if (!major && detail < 1) continue;
    const half = major ? 4.5 : 2.1;
    for (let i = 0; i < line.length - 1; i++) {
      const p = line[i];
      const q = line[i + 1];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const ox = (-dy / len) * half;
      const oy = (dx / len) * half;
      const v = [
        [p.x + ox, p.y + oy], [p.x - ox, p.y - oy], [q.x - ox, q.y - oy],
        [p.x + ox, p.y + oy], [q.x - ox, q.y - oy], [q.x + ox, q.y + oy],
      ];
      for (const [x, y] of v) {
        pos.push(x, 0.005, -y);
        shade.push(major ? 1 : 0.55);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
  const m = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: { ...shared },
      ...painted,
      vertexShader: /* glsl */ `
        attribute float aShade;
        varying vec3 vP; varying float vShade;
        void main() { vP = position; vShade = aShade; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vP; varying float vShade;
        ${fogged}
        void main() {
          vec3 c = vec3(0.13, 0.085, 0.045) * vShade;
          gl_FragColor = vec4(hazed(c, vP), 1.0);
          ${finish}
        }
      `,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = -7;
  return m;
}

function ground() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(9000, 8), new THREE.ShaderMaterial({
    uniforms: { ...shared },
    ...painted,
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      ${fogged}
      void main() { gl_FragColor = vec4(hazed(vec3(0.016, 0.018, 0.024), vP), 1.0); ${finish} }
    `,
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.05;
  m.renderOrder = -9;
  return m;
}

function sky() {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(8000, 24, 12),
    new THREE.ShaderMaterial({
      uniforms: { uHaze: shared.uHaze },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vD;
        void main() { vD = normalize(position); gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vD; uniform vec3 uHaze;
        void main() {
          float h = clamp(vD.y, 0.0, 1.0);
          vec3 c = mix(uHaze, vec3(0.004, 0.007, 0.016), pow(h, 0.42));
          gl_FragColor = vec4(c, 1.0);
          ${finish}
        }
      `,
    }),
  );
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// The show from the top of Marina Bay Sands, seen over the city on race nights.
function lasers() {
  const group = new THREE.Group();
  group.name = 'lasers';
  const geometry = new THREE.CylinderGeometry(9, 0.5, 2600, 12, 1, true);
  geometry.translate(0, 1300, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 3.0);
        float fall = pow(1.0 - vUv.y, 2.4);
        gl_FragColor = vec4(vec3(0.42, 0.72, 1.0) * edge * fall * 0.85, 1.0);
      }
    `,
  });
  const fans = [-0.62, -0.38, -0.16, 0.07, 0.3, 0.55];
  fans.forEach((lean, i) => {
    const beam = new THREE.Mesh(geometry, material);
    beam.position.set(-322 + i * 12, 208, 815 + i * 6);
    beam.userData = { lean, phase: i * 1.7 };
    beam.frustumCulled = false;
    beam.renderOrder = 3;
    group.add(beam);
  });
  group.userData.sweep = (t) => {
    for (const b of group.children) {
      const { lean, phase } = b.userData;
      b.rotation.set(0.1 + Math.sin(t * 0.07 + phase) * 0.05, 0.42, lean + Math.sin(t * 0.11 + phase) * 0.04);
    }
  };
  group.userData.sweep(0);
  return group;
}

// Aviation beacons on the tall towers, the small red points that mark any big city at night.
function beacons(buildings) {
  const tall = buildings.filter((b) => b.top > 120).sort((a, b) => b.top - a.top).slice(0, 44);
  const pos = [];
  for (const b of tall) {
    const c = b.ring.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(b.ring.length);
    pos.push(c.x, b.top + 1, -c.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.3, 0.05, 0.03), size: 3.2, sizeAttenuation: false }));
  p.frustumCulled = false;
  return p;
}

// The Singapore Flyer, at its real position. OSM only has its footprint, so the wheel is modelled.
function flyer() {
  const g = new THREE.Group();
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.95, 1.5) });
  const dark = new THREE.MeshBasicMaterial({ color: 0x1b2230 });
  const R = 75;
  g.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 8, 96), lit));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 6, 0.45, 6, 96), dark);
  g.add(inner);
  const spokes = new THREE.CylinderGeometry(0.16, 0.16, R * 2, 4);
  const spokeMesh = new THREE.InstancedMesh(spokes, dark, 14);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    m.makeRotationZ((i / 14) * Math.PI);
    spokeMesh.setMatrixAt(i, m);
  }
  g.add(spokeMesh);
  const capsule = new THREE.InstancedMesh(new THREE.SphereGeometry(1.9, 8, 6), lit, 28);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    m.makeTranslation(Math.cos(a) * (R + 2.6), Math.sin(a) * (R + 2.6), 0);
    capsule.setMatrixAt(i, m);
  }
  g.add(capsule);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, R + 16, 8), dark);
    leg.position.set(s * 16, -(R + 16) / 2 + 6, 0);
    leg.rotation.z = s * 0.26;
    g.add(leg);
  }
  g.position.set(-20, 90, 190);
  g.rotation.y = 0.75;
  g.name = 'flyer';
  return g;
}

export { shared as worldUniforms };
