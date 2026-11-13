// The half of the page that never moves. One renderer, one world, and a set of broadcast cameras that
// the reading column cuts between. A cut is a slow dissolve: two passes into render targets, mixed.
import * as THREE from 'three';
import { buildCar, repaint } from './car.js';
import { nightEnvironment } from './env.js';
import { trackFrame, buildTrack, parseCity, buildCity, worldUniforms } from './world.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const eased = (t) => t * t * (3 - 2 * t);

// Marina Bay Sands in scene coordinates. The hero looks across the car straight at it.
const TOWERS = new THREE.Vector3(-320, 0, 830);
export const HERO_INDEX = 322;

// Parts of the car and where each one travels when it is taken apart for the spec section.
const EXPLODE = {
  frontWing: [1.5, 0, 0],
  tub: [0, 0, 0],
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
    this.frameTrack = trackFrame(lap);

    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    const info = gl.getContext().getExtension('WEBGL_debug_renderer_info');
    const name = info ? gl.getContext().getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    this.soft = /swiftshader|llvmpipe|software/i.test(name);
    gl.setPixelRatio(this.soft ? 1 : Math.min(devicePixelRatio, phone ? 1.5 : 1.75));
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.06;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl = gl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.environment = nightEnvironment(gl);
    this.scene.environmentIntensity = 1;

    const key = new THREE.DirectionalLight(0xfff6e8, 1.5);
    key.position.set(40, 90, 30);
    const fill = new THREE.DirectionalLight(0xb9ccff, 0.5);
    fill.position.set(-60, 40, -50);
    this.scene.add(key, fill);

    this.track = buildTrack(this.frameTrack, lap);
    this.scene.add(this.track);

    this.car = buildCar();
    this.scene.add(this.car);
    this.shadow = contactShadow();
    this.scene.add(this.shadow);

    this.still = false;
    this.slowFrames = 0;
    this.lowPower = this.soft;
    this.pair = null;
    this.index = HERO_INDEX;
    this.target = HERO_INDEX;
    this.lastIndex = HERO_INDEX;
    this.fromIndex = HERO_INDEX;
    this.explodeAmount = 0;
    this.explodeTarget = 0;
    this.pointerX = 0;
    this.pointerY = 0;
    this.sway = 0;
    this.pose = { p: new THREE.Vector3(), t: new THREE.Vector3(1, 0, 0), yaw: 0, pitch: 0, roll: 0, steer: 0 };
    this.chaseYaw = null;

    this.camA = new THREE.PerspectiveCamera(32, 1, 0.2, 9000);
    this.camB = new THREE.PerspectiveCamera(32, 1, 0.2, 9000);
    this.shotName = 'hero';
    this.shotFrom = 'hero';
    this.fade = 1;
    this.fadeTime = 1.6;

    this.mix = fullscreenMix();
    this.running = false;
    this.needsFrame = true;
    this.clock = new THREE.Clock();
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
    this.needsFrame = true;
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width));
    const h = Math.max(2, Math.round(r.height));
    this.gl.setSize(w, h, false);
    const size = this.gl.getDrawingBufferSize(new THREE.Vector2());
    this.size = size;
    this.aspect = w / h;
    this.camA.aspect = this.aspect;
    this.camB.aspect = this.aspect;
    this.rtA?.dispose();
    this.rtB?.dispose();
    const options = { type: THREE.HalfFloatType, samples: this.soft ? 0 : 4, stencilBuffer: true };
    this.rtA = new THREE.WebGLRenderTarget(size.x, size.y, options);
    this.rtB = new THREE.WebGLRenderTarget(size.x, size.y, options);
    this.needsFrame = true;
  }

  // The point on the racing line at a fractional index, with its heading.
  sample(index, out) {
    const { raw, n } = this.frameTrack;
    const i = Math.floor(index);
    const t = index - i;
    const a = raw[((i - 1) % n + n) % n];
    const b = raw[(i % n + n) % n];
    const c = raw[((i + 1) % n + n) % n];
    const d = raw[((i + 2) % n + n) % n];
    for (const axis of ['x', 'z']) {
      const [p0, p1, p2, p3] = [a[axis], b[axis], c[axis], d[axis]];
      out.p[axis] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      out.t[axis] = 0.5 * ((p2 - p0) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (3 * p1 - p0 - 3 * p2 + p3) * t * t);
    }
    out.p.y = 0;
    out.t.y = 0;
    out.t.normalize();
    out.yaw = Math.atan2(-out.t.z, out.t.x);
    return out;
  }

  // Body attitude from the real speed trace: dive on the brakes, squat on the power, roll in the corner.
  attitude(index, pose) {
    const { v } = this.lap.ver;
    const n = this.frameTrack.n;
    const i = ((Math.round(index) % n) + n) % n;
    const dv = v[(i + 2) % n] - v[(i - 2 + n) % n];
    pose.pitch = clamp(dv * 0.00042, -0.018, 0.012);
    const ahead = this.frameTrack.tangent[(i + 3) % n];
    const behind = this.frameTrack.tangent[(i - 3 + n) % n];
    const bend = behind.x * ahead.z - behind.z * ahead.x;
    pose.roll = clamp(bend * 0.022, -0.016, 0.016);
    pose.steer = clamp(-bend * 0.62, -0.4, 0.4);
  }

  placeCar(car, index, spin, across = 0) {
    const pose = this.sample(index, { p: new THREE.Vector3(), t: new THREE.Vector3() });
    this.attitude(index, pose);
    pose.p.x += pose.t.z * across;
    pose.p.z -= pose.t.x * across;
    car.position.copy(pose.p);
    car.rotation.set(0, 0, 0);
    car.rotation.order = 'YXZ';
    car.rotation.y = pose.yaw;
    car.rotation.z = pose.pitch;
    car.rotation.x = pose.roll;
    for (const w of car.parts.wheels) {
      w.spin.rotation.z -= spin;
      if (w.front) w.steer.rotation.y = pose.steer;
    }
    return pose;
  }

  // Camera positions, written in the car's own frame: x ahead, y up, z to its right.
  rig(name, cam, time) {
    const pose = this.pose;
    const f = pose.t;
    const r = new THREE.Vector3(-f.z, 0, f.x).negate();
    const at = (x, y, z, out = new THREE.Vector3()) => out.copy(pose.p).addScaledVector(f, x).addScaledVector(r, z).setY(pose.p.y + y);
    const px = this.pointerX;
    const py = this.pointerY;
    const drift = this.still ? 0 : Math.sin(time * 0.18);
    const portrait = this.aspect < 1;
    let fov = 32;
    let lift = 0; // raises the picture on phones, where text panels cover the lower part of the stage
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();

    switch (name) {
      case 'hero': {
        // A track photographer's long lens: the car side-on, the boards behind it, then the bay and the towers.
        const away = pose.p.clone().sub(TOWERS).normalize();
        const back = portrait && !this.phone ? 27 : 30;
        pos.copy(pose.p).addScaledVector(away, back).addScaledVector(f, px * 1.6 + drift * 0.5);
        pos.y = 2.6 + py * 0.25;
        look.copy(pose.p).setY(portrait && !this.phone ? 5.4 : 4.1);
        fov = this.phone ? 60 : portrait ? 32 : 26;
        lift = this.phone ? 0.3 : 0;
        break;
      }
      case 'grid':
        at(4.9 + drift * 0.15, 0.42 + py * 0.1, -2.6 + px * 0.4, pos);
        at(-0.5, portrait ? 1.1 : 0.72, 0, look);
        fov = portrait ? 36 : 25;
        break;
      case 'heli':
        at(-44 + drift * 3, 31, 25, pos);
        at(26, 0, -2, look);
        fov = portrait ? 38 : 28;
        break;
      case 'chase':
        at(-8.2, 2.05 + py * 0.2, px * 0.4, pos);
        at(6, 0.7, 0, look);
        fov = portrait ? 46 : 34;
        break;
      case 'onboard':
        at(-0.05, 1.08, 0, pos);
        at(20, 0.72, 0, look);
        fov = portrait ? 74 : 56;
        break;
      case 'front':
        at(7.2, 0.34, 1.7, pos);
        at(0.2, 0.72, 0, look);
        fov = portrait ? 34 : 22;
        break;
      case 'side':
        at(1.5, 5.4, 12.5 + drift * 0.3, pos);
        at(0, 0.7, 0, look);
        fov = portrait ? 32 : 24;
        break;
      case 'over':
        at(-3.4, 8.6, 4.4, pos);
        at(0.5, 0.2, 0, look);
        fov = portrait ? 44 : 30;
        break;
      case 'pair':
        at(-13, 3.8, 1.4, pos);
        at(3, 0.6, 0.5, look);
        fov = this.phone ? 44 : portrait ? 36 : 28;
        lift = this.phone ? 0.26 : 0;
        break;
      case 'spec':
        at(6.6 + drift * 0.3, 3.5 + py * 0.3, 7.3 + px * 0.6, pos);
        at(-0.1, portrait ? 1.3 : 1.0, 0, look);
        fov = portrait ? 46 : 32;
        break;
      case 'circuit':
        pos.set(-610 + drift * 30, 1120, 980);
        look.set(-610, 0, 40);
        fov = portrait ? 56 : 40;
        lift = this.phone ? 0.24 : 0;
        break;
      default:
        at(-8, 2, 0, pos);
        at(6, 0.7, 0, look);
    }
    cam.position.copy(pos);
    cam.fov = fov;
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (lift) cam.setViewOffset(this.size.x, this.size.y, 0, this.size.y * lift, this.size.x, this.size.y);
    else if (cam.view?.enabled) cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  cut(name, jumpTo) {
    if (name === this.shotName) return;
    this.shotFrom = this.fade >= 0.5 ? this.shotName : this.shotFrom;
    this.fromIndex = this.index;
    this.shotName = name;
    this.fade = 0;
    if (jumpTo !== undefined) {
      this.index = jumpTo;
      this.target = jumpTo;
      this.lastIndex = jumpTo;
    }
    this.setFence();
    this.needsFrame = true;
  }

  // The long-lens hero shoots from behind the fence line, through a photographer's hole.
  setFence() {
    const hide = this.shotName === 'hero';
    this.track.traverse((o) => {
      if (o.name === 'fence' || o.name === 'nearWall') o.visible = !hide;
    });
  }

  setLap(index) {
    if (Math.abs(index - this.target) > 0.0005) this.needsFrame = true;
    this.target = index;
    if (this.still) this.index = this.lastIndex = index;
  }

  // Calm mode has no travel: each part of the page gets a finished frame.
  setStill(on) {
    this.still = on;
    if (on) {
      this.pointerTargetX = this.pointerTargetY = 0;
      this.pointerX = this.pointerY = 0;
      this.index = this.lastIndex = this.target;
      this.explodeAmount = this.explodeTarget;
    }
    this.needsFrame = true;
  }

  setExplode(p) {
    if (Math.abs(p - this.explodeTarget) > 0.001) this.needsFrame = true;
    this.explodeTarget = p;
  }

  // Two real cars at the same moment of their own laps, for the analysis.
  setPair(on, verIndex = 0, lecIndex = 0) {
    if (on && !this.pair) {
      const a = repaint(this.car, VER_PAINT);
      const b = repaint(this.car, LEC_PAINT);
      this.pair = { a, b, shadowA: contactShadow(), shadowB: contactShadow() };
      this.scene.add(a, b, this.pair.shadowA, this.pair.shadowB);
    }
    if (!this.pair) return;
    for (const o of [this.pair.a, this.pair.b, this.pair.shadowA, this.pair.shadowB]) o.visible = on;
    this.car.visible = !on;
    this.shadow.visible = !on;
    if (on) {
      this.target = verIndex;
      this.pairLec = lecIndex;
    }
    this.needsFrame = true;
  }

  setPointer(x, y) {
    if (this.still) return;
    this.pointerTargetX = x;
    this.pointerTargetY = y;
    this.needsFrame = true;
  }

  applyExplode(amount) {
    const g = this.car.parts.groups;
    const k = eased(amount);
    this.car.position.y += k * 0.75;
    for (const [name, [x, y, z]] of Object.entries(EXPLODE)) {
      if (!g[name]) continue;
      const home = g[name].userData.home ?? (g[name].userData.home = g[name].position.toArray());
      g[name].position.set(home[0] + x * k, home[1] + y * k, home[2] + z * k);
    }
  }

  render(dt, time) {
    this.index = damp(this.index, this.target, this.pair?.a.visible ? 14 : 7, dt);
    if (Math.abs(this.index - this.target) < 0.002) this.index = this.target;
    const moved = this.index - this.lastIndex;
    this.lastIndex = this.index;
    const spin = (moved * (this.lap.m[1] - this.lap.m[0])) / 0.36;

    const sampled = this.placeCar(this.car, this.index, spin);
    Object.assign(this.pose, sampled);
    this.shadow.position.copy(sampled.p);
    this.shadow.rotation.y = sampled.yaw;

    if (this.pair?.a.visible) {
      // The public position feed is snapped to one line, so the cars run a lane apart to stay visible.
      const a = this.placeCar(this.pair.a, this.index, spin, -1.5);
      const b = this.placeCar(this.pair.b, this.pairLec, spin, 1.5);
      this.pair.shadowA.position.copy(a.p);
      this.pair.shadowA.rotation.y = a.yaw;
      this.pair.shadowB.position.copy(b.p);
      this.pair.shadowB.rotation.y = b.yaw;
    }

    this.explodeAmount = damp(this.explodeAmount, this.explodeTarget, 8, dt);
    if (Math.abs(this.explodeAmount - this.explodeTarget) < 0.001) this.explodeAmount = this.explodeTarget;
    this.applyExplode(this.explodeAmount);

    this.pointerX = damp(this.pointerX, this.pointerTargetX ?? 0, 3, dt);
    this.pointerY = damp(this.pointerY, this.pointerTargetY ?? 0, 3, dt);

    if (!this.still) {
      this.water?.forEach((m) => {
        m.uniforms.uTime.value = time;
      });
      this.lasers?.userData.sweep(time);
    }
    const halo = this.track.getObjectByName('floodlights')?.userData.halo;
    if (halo) halo.material.uniforms.uScale.value = this.size.y / (2 * Math.tan((this.camB.fov * Math.PI) / 360));

    const gl = this.gl;
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / this.fadeTime);
      if (this.fade >= 1 || this.lowPower) {
        this.fade = 1;
      } else {
        const jumped = Math.abs(this.fromIndex - this.index) > 1;
        if (jumped) {
          Object.assign(this.pose, this.placeCar(this.car, this.fromIndex, 0));
          this.shadow.position.copy(this.pose.p);
          this.shadow.rotation.y = this.pose.yaw;
        }
        this.rig(this.shotFrom, this.camA, time);
        worldUniforms.uCam.value.copy(this.camA.position);
        gl.setRenderTarget(this.rtA);
        gl.render(this.scene, this.camA);
        if (jumped) {
          Object.assign(this.pose, this.placeCar(this.car, this.index, 0));
          this.shadow.position.copy(this.pose.p);
          this.shadow.rotation.y = this.pose.yaw;
        }
        this.rig(this.shotName, this.camB, time);
        worldUniforms.uCam.value.copy(this.camB.position);
        gl.setRenderTarget(this.rtB);
        gl.render(this.scene, this.camB);
        gl.setRenderTarget(null);
        this.mix.material.uniforms.a.value = this.rtA.texture;
        this.mix.material.uniforms.b.value = this.rtB.texture;
        this.mix.material.uniforms.k.value = eased(this.fade);
        gl.render(this.mix.scene, this.mix.camera);
        return;
      }
    }
    this.rig(this.shotName, this.camB, time);
    worldUniforms.uCam.value.copy(this.camB.position);
    gl.render(this.scene, this.camB);
  }

  start(onFrame) {
    this.onFrame = onFrame;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const raw = this.clock.getDelta();
      const dt = Math.min(0.05, raw);
      const time = this.clock.elapsedTime;
      // Five slow frames in a row and the dissolve goes: it costs two extra passes of the whole city.
      this.slowFrames = raw > 0.09 ? this.slowFrames + 1 : 0;
      if (this.slowFrames > 5) this.lowPower = true;
      const settling = Math.abs(this.index - this.target) > 0.002 || this.fade < 1 || Math.abs(this.explodeAmount - this.explodeTarget) > 0.001 || Math.abs(this.pointerX - (this.pointerTargetX ?? 0)) > 0.002 || Math.abs(this.pointerY - (this.pointerTargetY ?? 0)) > 0.002;
      if (!this.needsFrame && !settling && (this.phone || this.soft || this.still)) return;
      this.needsFrame = false;
      this.render(dt, time);
      onFrame?.(this.index);
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
  m.position.y = 0.04;
  const holder = new THREE.Group();
  holder.add(m);
  m.position.y = 0.045;
  return holder;
}

function fullscreenMix() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: { a: { value: null }, b: { value: null }, k: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform sampler2D a; uniform sampler2D b; uniform float k;
      void main() {
        gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), k);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera, material };
}
