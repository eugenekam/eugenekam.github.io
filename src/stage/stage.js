// The 3D world behind everything. One renderer, one city, and a camera that always moves in time, never
// in scroll position: every change of view is an eased flight from wherever the camera is right now.
import * as THREE from 'three';
import { buildCar, repaint } from './car.js';
import { buildConsoleRoom } from './consoleRoom.js';
import { nightEnvironment } from './env.js';
import { trackModel } from './track.js';
import { buildTrack, parseCity, buildCity, worldUniforms } from './world.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Marina Bay Sands in scene coordinates. The hero looks across the car straight at it.
const TOWERS = new THREE.Vector3(-320, 0, 830);
export const HERO_INDEX = 322;

// Parts of the car and where each one travels when it is taken apart.
const EXPLODE = {
  frontWing: [1.5, 0, 0],
  rearWing: [-1.5, 0.45, 0],
  engine: [-0.1, 1.15, 0],
  halo: [0.1, 1.9, 0],
  driver: [0, 1.25, 0],
  podL: [0, 0.1, 1.2],
  podR: [0, 0.1, -1.2],
  floor: [0, -0.62, 0],
  frontAxle: [0.4, 0, 0],
  rearAxle: [-0.4, 0, 0],
  wheelFL: [0.4, 0, 1.25],
  wheelFR: [0.4, 0, -1.25],
  wheelRL: [-0.4, 0, 1.25],
  wheelRR: [-0.4, 0, -1.25],
};

export const VER_PAINT = { body: '#2b5fb8', trim: '#0d1a33', accent: '#d9e4f7' };
export const LEC_PAINT = { body: '#d3102a', trim: '#2a0509', accent: '#f4f3ee' };

export class Stage {
  constructor(canvas, lap, { phone = false } = {}) {
    this.canvas = canvas;
    this.lap = lap;
    this.phone = phone;
    this.f = trackModel(lap);

    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    this.maxDpr = Math.min(devicePixelRatio, phone ? 1.5 : 2);
    this.dpr = Math.min(this.maxDpr, phone ? 1.25 : 1.5);
    gl.setPixelRatio(this.dpr);
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.06;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl = gl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.environment = nightEnvironment(gl);

    const key = new THREE.DirectionalLight(0xfff6e8, 1.5);
    key.position.set(40, 90, 30);
    const fill = new THREE.DirectionalLight(0xb9ccff, 0.5);
    fill.position.set(-60, 40, -50);
    this.scene.add(key, fill);

    this.trackMesh = buildTrack(this.f, lap);
    this.scene.add(this.trackMesh);

    this.car = buildCar();
    this.scene.add(this.car);
    this.shadow = contactShadow();
    this.scene.add(this.shadow);

    this.cam = new THREE.PerspectiveCamera(30, 1, 0.25, 9000);
    this.want = { pos: new THREE.Vector3(), look: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), fov: 30 };
    this.upNow = new THREE.Vector3(0, 1, 0);
    this.from = null;
    this.flight = 1;
    this.flightTime = 1;
    this.flightArc = 0;
    this.viewName = 'hero';

    this.still = false;
    this.index = HERO_INDEX;
    this.velocity = 0;
    this.run = null;
    this.pose = { x: 0, z: 0, tx: 1, tz: 0, yaw: 0, pitch: 0, roll: 0, steer: 0 };
    this.lagYaw = null;
    this.spinRate = 0;
    this.explodeAmount = 0;
    this.explodeTarget = 0;
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.offset = { x: 0, y: 0, tx: 0, ty: 0 };
    this.orbit = { az: 0.9, el: 0.28, dist: 8.5, az0: 0.9, el0: 0.28, dist0: 8.5, x: 0, y: 0.55, z: 0, x0: 0, y0: 0.55, z0: 0 };
    this.roundAngle = 0.4;
    this.roundNow = 0.4;
    this.pair = null;

    this.frames = 0;
    this.frameMs = 0;
    this.running = false;
    this.needsFrame = true;
    this.clock = new THREE.Clock();
    this.place(HERO_INDEX);
    this.lagYaw = this.pose.yaw;
    this.resize();
  }

  async loadCity(url) {
    const res = await fetch(url);
    const city = parseCity(await res.arrayBuffer());
    this.city = buildCity(city, { detail: this.phone ? 0 : 1 });
    this.scene.add(this.city);
    this.water = [];
    this.city.traverse((o) => {
      if (o.material?.uniforms?.uTime) this.water.push(o.material);
    });
    this.lasers = this.city.getObjectByName('lasers');
    this.reflection = this.city.getObjectByName('reflection');
    this.halo = this.trackMesh.getObjectByName('floodlights')?.userData.halo;
    this.needsFrame = true;
  }

  resize() {
    const w = Math.max(2, Math.round(this.canvas.clientWidth));
    const h = Math.max(2, Math.round(this.canvas.clientHeight));
    this.gl.setSize(w, h, false);
    this.size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.aspect = w / h;
    this.cam.aspect = this.aspect;
    this.needsFrame = true;
  }

  setReflections(on) {
    if (this.reflection) this.reflection.visible = on;
  }

  // The hero shoots over the near wall, like a photographer at a gap in the fence.
  setFence(open) {
    this.trackMesh.traverse((o) => {
      if (o.name === 'fence' || o.name === 'nearWall') o.visible = !open;
    });
  }

  setStill(on) {
    this.still = on;
    if (on) {
      this.pointer.tx = this.pointer.ty = this.pointer.x = this.pointer.y = 0;
      this.explodeAmount = this.explodeTarget;
    }
    this.needsFrame = true;
  }

  // Moves the picture so its subject sits in the part of the screen a panel isn't covering.
  setOffset(x, y) {
    this.offset.tx = x;
    this.offset.ty = y;
    if (this.still) {
      this.offset.x = x;
      this.offset.y = y;
    }
    this.needsFrame = true;
  }

  setPointer(x, y) {
    if (this.still) return;
    this.pointer.tx = x;
    this.pointer.ty = y;
    this.needsFrame = true;
  }

  setExplode(p) {
    this.explodeTarget = p;
    if (this.still) this.explodeAmount = p;
    this.needsFrame = true;
  }

  /* The car on the racing line. */

  place(index) {
    this.run?.done?.(false);
    this.run = null;
    this.velocity = 0;
    this.index = ((index % this.f.N) + this.f.N) % this.f.N;
    this.updateLinePose(0);
    this.applyPose(this.car, this.pose, 0);
    this.lagYaw = this.pose.yaw;
    this.needsFrame = true;
  }

  // Drives forward round the lap to a new point in a time-lapse of the real lap. Picks up from the
  // current speed if it's interrupted, so changing your mind mid-drive stays smooth.
  drive(toIndex, seconds) {
    const N = this.f.N;
    this.run?.done?.(false);
    const from = this.index;
    let to = ((toIndex % N) + N) % N;
    while (to <= from + 1) to += N;
    const T = this.still ? 0.001 : seconds ?? clamp((to - from) * 0.034, 1.6, 4.6);
    return new Promise((done) => {
      this.run = { from, to, at: from, v0: this.velocity, t: 0, T, done };
      this.needsFrame = true;
    });
  }

  stepRun(dt) {
    const r = this.run;
    if (!r) return;
    r.t += dt;
    const u = clamp(r.t / r.T);
    const [u2, u3] = [u * u, u * u * u];
    const next = (2 * u3 - 3 * u2 + 1) * r.from + (u3 - 2 * u2 + u) * r.T * r.v0 + (-2 * u3 + 3 * u2) * r.to;
    this.velocity = dt > 0 ? (next - r.at) / dt : 0;
    r.at = next;
    this.index = ((next % this.f.N) + this.f.N) % this.f.N;
    if (u >= 1) {
      this.velocity = 0;
      const { done } = r;
      this.run = null;
      done(true);
    }
  }

  updateLinePose(dt) {
    const f = this.f;
    const out = this.pose;
    f.pose(this.index, out);
    const a = f.pose(this.index - 1.5, {});
    const b = f.pose(this.index + 1.5, {});
    const bend = wrapAngle(b.yaw - a.yaw);
    const metresPerSecond = Math.abs(this.velocity) * 10;
    const brake = this.lastSpeed === undefined ? 0 : (metresPerSecond - this.lastSpeed) / Math.max(dt, 0.008);
    this.lastSpeed = metresPerSecond;
    const rate = dt > 0 ? 8 : 1000;
    out.pitch = damp(out.pitch, clamp(brake * 0.0002, -0.016, 0.012), rate, dt || 1);
    out.roll = damp(out.roll, clamp(bend * 0.02, -0.014, 0.014), rate, dt || 1);
    out.steer = damp(out.steer, clamp(bend * 0.9, -0.42, 0.42), rate, dt || 1);
    this.spinRate = metresPerSecond / 0.36;
  }

  applyPose(car, pose, spin, across = 0) {
    const x = pose.x + pose.tz * across;
    const z = pose.z - pose.tx * across;
    car.position.set(x, 0, z);
    car.rotation.order = 'YXZ';
    car.rotation.set(pose.roll, pose.yaw, pose.pitch);
    for (const w of car.parts.wheels) {
      w.spin.rotation.z -= spin;
      if (w.front) w.steer.rotation.y = pose.steer;
    }
  }

  /* Other cars on the road. */

  showPair(on) {
    if (on && !this.pair) {
      const a = this.assembledCopy(VER_PAINT);
      const b = this.assembledCopy(LEC_PAINT);
      this.pair = { a, b, shadowA: contactShadow(), shadowB: contactShadow(), ia: 0, ib: 0, ta: 0, tb: 0, seeded: false };
      this.scene.add(a, b, this.pair.shadowA, this.pair.shadowB);
    }
    this.setRival(false);
    this.setConsole(false);
    this.setExplode(0);
    if (this.pair) for (const o of [this.pair.a, this.pair.b, this.pair.shadowA, this.pair.shadowB]) o.visible = on;
    this.car.visible = !on;
    this.shadow.visible = !on;
    this.needsFrame = true;
  }

  // A repainted copy of the car with every part in place, even if the hero car is mid-way through being taken apart.
  assembledCopy(paint) {
    const k = this.explodeAmount;
    this.explodeAmount = 0;
    this.applyExplode();
    const copy = repaint(this.car, paint);
    this.explodeAmount = k;
    if (k > 0) this.applyExplode();
    return copy;
  }

  // The pit-wall console room for the Team Radio preview, hung high above the circuit so nothing else shows.
  setConsole(on) {
    if (on && !this.room) {
      this.room = buildConsoleRoom();
      this.roomAt = new THREE.Vector3(this.pose.x, 700, this.pose.z);
      this.room.position.copy(this.roomAt);
      this.scene.add(this.room);
    }
    if (!this.room) return;
    this.room.visible = on;
    this.needsFrame = true;
  }

  // A red car a few lengths ahead of Eugene's, for the Pit Wall preview: the gap he's chasing.
  setRival(on) {
    if (on && !this.rival) {
      const car = this.assembledCopy(LEC_PAINT);
      this.rival = { car, shadow: contactShadow() };
      this.scene.add(car, this.rival.shadow);
    }
    if (!this.rival) return;
    if (on) {
      const p = this.pose;
      const ahead = { ...p, x: p.x + p.tx * 10, z: p.z + p.tz * 10, pitch: 0, roll: 0, steer: 0 };
      this.applyPose(this.rival.car, ahead, 0, -1.9);
      this.rival.shadow.position.copy(this.rival.car.position);
      this.rival.shadow.rotation.y = p.yaw;
    }
    this.rival.car.visible = this.rival.shadow.visible = on;
    this.needsFrame = true;
  }

  setPair(verIndex, lecIndex, instant) {
    const p = this.pair;
    if (!p) return;
    p.ta = verIndex;
    p.tb = lecIndex;
    if (instant || !p.seeded || this.still) {
      p.ia = verIndex;
      p.ib = lecIndex;
      p.seeded = true;
    }
    this.index = verIndex;
    this.needsFrame = true;
  }

  stepPair(dt) {
    const p = this.pair;
    if (!p?.a.visible) return;
    const [wa, wb] = [p.ia, p.ib];
    p.ia = damp(p.ia, p.ta, 12, dt);
    p.ib = damp(p.ib, p.tb, 12, dt);
    const [a, b] = [this.f.pose(p.ia, {}), this.f.pose(p.ib, {})];
    for (const q of [a, b]) q.pitch = q.roll = q.steer = 0;
    // The public position feed is snapped to one line, so the cars run a lane apart to stay visible.
    this.applyPose(p.a, a, (p.ia - wa) * 28, -1.5);
    this.applyPose(p.b, b, (p.ib - wb) * 28, 1.5);
    p.shadowA.position.copy(p.a.position);
    p.shadowA.rotation.y = a.yaw;
    p.shadowB.position.copy(p.b.position);
    p.shadowB.rotation.y = b.yaw;
    Object.assign(this.pose, a, { pitch: 0, roll: 0, steer: 0 });
    this.pose.x = (a.x + b.x) / 2;
    this.pose.z = (a.z + b.z) / 2;
  }

  applyExplode() {
    const g = this.car.parts.groups;
    const k = easeInOut(this.explodeAmount);
    this.car.position.y += k * 0.75;
    for (const [name, [x, y, z]] of Object.entries(EXPLODE)) {
      if (!g[name]) continue;
      const home = g[name].userData.home ?? (g[name].userData.home = g[name].position.toArray());
      g[name].position.set(home[0] + x * k, home[1] + y * k, home[2] + z * k);
    }
  }

  /* The camera. */

  // Fly to a new view from wherever the camera is now.
  view(name, { time = 1.3, arc = 0 } = {}) {
    if (name === this.viewName && this.flight >= 1) return;
    this.fromView = this.viewName;
    this.from = { pos: this.cam.position.clone(), look: this.lookNow?.clone() ?? this.want.look.clone(), up: this.upNow.clone(), fov: this.cam.fov };
    this.viewName = name;
    this.flight = this.still ? 1 : 0;
    this.flightTime = time;
    this.flightArc = arc;
    this.needsFrame = true;
  }

  // Cut straight to a view, for use behind a wipe.
  snap(name) {
    this.fromView = name;
    this.viewName = name;
    this.flight = 1;
    this.from = null;
    this.lagYaw = this.pose.yaw;
    this.needsFrame = true;
  }

  focusOrbit({ az, el, dist, x = 0, y = 0.55, z = 0 }) {
    const o = this.orbit;
    if (az !== undefined) o.az0 = o.az + wrapAngle(az - o.az);
    if (el !== undefined) o.el0 = el;
    if (dist !== undefined) o.dist0 = dist;
    o.x0 = x;
    o.y0 = y;
    o.z0 = z;
    this.needsFrame = true;
  }

  rig(name, time) {
    const pose = this.pose;
    const [fx, fz] = [pose.tx, pose.tz];
    const [lx, lz] = [fz, -fx]; // left of the car
    const lagF = [Math.cos(this.lagYaw), -Math.sin(this.lagYaw)];
    const lagL = [lagF[1], -lagF[0]];
    const at = (x, y, z, out) => out.set(pose.x + fx * x + lx * z, y, pose.z + fz * x + lz * z);
    const lag = (x, y, z, out) => out.set(pose.x + lagF[0] * x + lagL[0] * z, y, pose.z + lagF[1] * x + lagL[1] * z);
    const { pos, look } = this.want;
    const px = this.pointer.x;
    const py = this.pointer.y;
    const drift = this.still ? 0 : Math.sin(time * 0.16);
    const tall = this.aspect < 0.9;
    let fov = 30;
    this.want.up.set(0, 1, 0);

    switch (name) {
      case 'hero': {
        // A track photographer's long lens: car side-on, boards behind it, then the bay and the towers.
        const away = new THREE.Vector3(pose.x, 0, pose.z).sub(TOWERS).normalize();
        pos.set(pose.x, 0, pose.z).addScaledVector(away, this.phone ? 30 : 31);
        pos.x += fx * (px * 2.2 + drift * 0.6);
        pos.z += fz * (px * 2.2 + drift * 0.6);
        pos.y = 2.6 + py * 0.4;
        look.set(pose.x, this.phone ? 4.1 : 6.1, pose.z);
        fov = this.phone ? (tall ? 60 : 30) : tall ? 33 : 30;
        break;
      }
      case 'console': {
        // Across the desk, at screen height: the telemetry, the radio rack, the chair and the people at the wall.
        const r = this.roomAt ?? pos;
        pos.set(r.x + px * 0.35 + drift * 0.25, r.y + 1.42 + py * 0.1, r.z + (tall ? 6.4 : 4.9));
        look.set(r.x, r.y + 1.62, r.z - 0.4);
        fov = tall ? 52 : 40;
        break;
      }
      case 'behind':
        at(-7.8 + drift * 0.3, 1.5 + py * 0.3, 1 + px, pos);
        at(10, 1.1, 0, look);
        fov = tall ? 56 : 38;
        break;
      case 'rise':
        // The whole circuit in one frame, so the preview shows every corner and not just part of the lap.
        if (tall) {
          pos.set(-600 + drift * 18, 5600, 40);
          look.set(-600, 0, 40);
          this.want.up.set(1, 0, 0);
          fov = 48;
        } else {
          // Pulled well back, because the menu board covers the left of the screen and the picture sits in the rest.
          pos.set(-610 + drift * 24, 1870, 1545);
          look.set(-610, 0, 60);
          fov = 44;
        }
        break;
      case 'side':
        at(1.6 + drift * 0.4, 0.75 + py * 0.15, 7 + px * 0.6, pos);
        at(-0.2, 0.7, 0, look);
        fov = tall ? 42 : 26;
        break;
      case 'close':
        at(3.6 + px * 0.5, 0.42 + py * 0.1, 2.5 + drift * 0.2, pos);
        at(0.1, 0.62, 0, look);
        fov = tall ? 44 : 27;
        break;
      case 'cockpit':
        at(1.9 + drift * 0.1, 1.28, 1.7 + px * 0.2, pos);
        at(-0.3, 0.84, 0, look);
        fov = tall ? 34 : 20;
        break;
      case 'map':
        if (tall) {
          // The circuit is long and low, so on a tall screen the map turns to fit it.
          pos.set(-600 + drift * 18, 2900, 40);
          look.set(-600, 0, 40);
          this.want.up.set(1, 0, 0);
          fov = 44;
        } else {
          pos.set(-610 + drift * 24, 1130, 960);
          look.set(-610, 0, 60);
          fov = 38;
        }
        break;
      case 'follow':
        lag(-11, 3.3, 0, pos);
        lag(7, 0.8, 0, look);
        fov = tall ? 62 : 44;
        break;
      case 'round': {
        const a = this.roundNow + drift * 0.12;
        at(Math.cos(a) * 7.6, 1.15 + py * 0.2, Math.sin(a) * 4.4, pos);
        at(0, 0.72, 0, look);
        fov = tall ? 50 : 32;
        break;
      }
      case 'pair':
        lag(-14, 4, 1.2, pos);
        lag(3, 0.6, 0.2, look);
        fov = tall ? 48 : 30;
        break;
      case 'garage': {
        const o = this.orbit;
        const c = Math.cos(o.el) * o.dist;
        const ox = pose.x + fx * o.x + lx * o.z;
        const oz = pose.z + fz * o.x + lz * o.z;
        const [dx, dz] = [Math.cos(o.az) * c, Math.sin(o.az) * c];
        pos.set(ox + fx * dx + lx * dz, o.y + Math.sin(o.el) * o.dist, oz + fz * dx + lz * dz);
        look.set(ox, o.y, oz);
        fov = tall ? 46 : 32;
        break;
      }
      default:
        at(-8, 2, 0, pos);
        at(6, 0.7, 0, look);
    }
    this.want.fov = fov;
  }

  moveCamera(dt, time) {
    const cam = this.cam;
    const open = this.viewName === 'hero' ? this.flight > 0.6 : this.fromView === 'hero' && this.flight < 0.55;
    if (open !== this.fenceOpen) {
      this.fenceOpen = open;
      this.setFence(open);
    }
    this.rig(this.viewName, time);
    const { pos, look, fov } = this.want;
    this.lookNow ??= new THREE.Vector3();
    if (this.flight < 1 && this.from) {
      this.flight = Math.min(1, this.flight + dt / this.flightTime);
      const k = easeInOut(this.flight);
      cam.position.lerpVectors(this.from.pos, pos, k);
      this.lookNow.lerpVectors(this.from.look, look, k);
      cam.position.y += Math.sin(Math.PI * k) * this.flightArc;
      cam.fov = this.from.fov + (fov - this.from.fov) * k;
      this.upNow.lerpVectors(this.from.up, this.want.up, k).normalize();
    } else {
      cam.position.copy(pos);
      this.lookNow.copy(look);
      cam.fov = fov;
      this.upNow.copy(this.want.up);
    }
    cam.up.copy(this.upNow);
    cam.lookAt(this.lookNow);
    const { x, y } = this.offset;
    if (Math.abs(x) > 0.0005 || Math.abs(y) > 0.0005) cam.setViewOffset(this.size.x, this.size.y, x * this.size.x, y * this.size.y, this.size.x, this.size.y);
    else if (cam.view?.enabled) cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // Keeps the frame rate steady by trading resolution, a little at a time.
  tuneQuality(raw) {
    this.frameMs += raw * 1000;
    this.frames++;
    if (this.frames < 45) return;
    const mean = this.frameMs / this.frames;
    this.frames = 0;
    this.frameMs = 0;
    if (document.hidden || mean > 200) return;
    let next = this.dpr;
    if (mean > 21) next = Math.max(0.7, this.dpr * 0.85);
    else if (mean < 12 && this.dpr < this.maxDpr) next = Math.min(this.maxDpr, this.dpr * 1.1);
    if (Math.abs(next - this.dpr) > 0.02) {
      this.dpr = next;
      this.gl.setPixelRatio(next);
      this.resize();
    }
    if (mean > 26 && this.dpr <= 0.75) this.setReflections(false);
  }

  frame(dt, time, raw) {
    this.stepRun(dt);
    if (!this.pair?.a.visible) this.updateLinePose(dt);
    this.stepPair(dt);

    const yawNow = this.pose.yaw;
    this.lagYaw = this.lagYaw === null ? yawNow : this.lagYaw + wrapAngle(yawNow - this.lagYaw) * (1 - Math.exp(-4.5 * dt));

    this.applyPose(this.car, this.pose, this.spinRate * dt);
    this.shadow.position.set(this.pose.x, 0, this.pose.z);
    this.shadow.rotation.y = this.pose.yaw;

    this.explodeAmount = damp(this.explodeAmount, this.explodeTarget, 5, dt);
    if (Math.abs(this.explodeAmount - this.explodeTarget) < 0.001) this.explodeAmount = this.explodeTarget;
    this.applyExplode();

    const o = this.orbit;
    o.az = damp(o.az, o.az0, 6, dt);
    o.el = damp(o.el, o.el0, 6, dt);
    o.dist = damp(o.dist, o.dist0, 5, dt);
    o.x = damp(o.x, o.x0, 5, dt);
    o.y = damp(o.y, o.y0, 5, dt);
    o.z = damp(o.z, o.z0, 5, dt);

    this.roundNow = this.still ? this.roundAngle : damp(this.roundNow, this.roundAngle, 2.6, dt);

    const p = this.pointer;
    p.x = damp(p.x, p.tx, 3, dt);
    p.y = damp(p.y, p.ty, 3, dt);
    this.offset.x = damp(this.offset.x, this.offset.tx, 6, dt);
    this.offset.y = damp(this.offset.y, this.offset.ty, 6, dt);

    if (!this.still) {
      for (const m of this.water ?? []) m.uniforms.uTime.value = time;
      this.lasers?.userData.sweep(time);
    }

    this.moveCamera(dt, time);
    if (this.halo) this.halo.material.uniforms.uScale.value = this.size.y / (2 * Math.tan((this.cam.fov * Math.PI) / 360));
    worldUniforms.uCam.value.copy(this.cam.position);
    this.gl.render(this.scene, this.cam);
    if (raw !== undefined) this.tuneQuality(raw);
  }

  // Anything still moving? Phones and calm mode rest between changes to save the battery.
  get settling() {
    const o = this.orbit;
    return (
      this.run ||
      Math.abs(this.roundNow - this.roundAngle) > 0.002 ||
      this.flight < 1 ||
      Math.abs(this.explodeAmount - this.explodeTarget) > 0.001 ||
      Math.abs(this.offset.x - this.offset.tx) > 0.001 ||
      Math.abs(this.offset.y - this.offset.ty) > 0.001 ||
      Math.abs(this.pointer.x - this.pointer.tx) > 0.002 ||
      Math.abs(o.az - o.az0) > 0.002 ||
      Math.abs(o.dist - o.dist0) > 0.005 ||
      (this.pair?.a.visible && Math.abs(this.pair.ia - this.pair.ta) > 0.002)
    );
  }

  start(update) {
    this.update = update;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const raw = this.clock.getDelta();
      const dt = Math.min(0.05, raw);
      const time = this.clock.elapsedTime;
      const moved = update?.(dt, time);
      if (!moved && !this.needsFrame && !this.settling && (this.phone || this.still)) return;
      this.needsFrame = false;
      this.frame(dt, time, raw);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

function contactShadow() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.translate(128, 64);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 126);
  g.addColorStop(0, 'rgba(0,0,0,.9)');
  g.addColorStop(0.5, 'rgba(0,0,0,.74)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-128, -128, 256, 256);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.0), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.045;
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}
