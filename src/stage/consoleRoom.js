// The pit-wall console room, for the Team Radio preview: a strategist's desk in a team garage, with the
// telemetry screen, the radio rack, headsets and chairs. Built from boxes and canvases in the same flat,
// night-lit style as the rest of the scene, and kept far from the circuit so nothing else shows through.
import * as THREE from 'three';

const YELLOW = '#ffd60a';
const INK = '#0b0c0e';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const standard = (color, roughness = 0.6, metalness = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const basic = (map, color = 0xffffff) => new THREE.MeshBasicMaterial(map ? { map } : { color });

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

// The telemetry screen: a timing list on the left, the circuit with live dots on the right, a gap bar below.
function screenTexture() {
  return canvasTexture(1024, 576, (g, w, h) => {
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d1527';
    g.fillRect(0, 0, w, 34);
    g.fillStyle = YELLOW;
    g.fillRect(14, 10, 120, 14);
    g.fillStyle = '#9fb3d9';
    g.font = '600 16px Arial, sans-serif';
    g.fillText('LIVE TIMING', 150, 24);
    g.fillText('SINGAPORE · QUALIFYING', w - 250, 24);
    // Timing list.
    const rows = 17;
    for (let i = 0; i < rows; i++) {
      const y = 50 + i * 28;
      g.fillStyle = i % 2 ? '#0b1222' : '#0e182b';
      g.fillRect(10, y, 330, 26);
      g.fillStyle = i === 3 ? YELLOW : '#41506f';
      g.fillRect(16, y + 6, 22, 14);
      g.fillStyle = i === 3 ? '#ffffff' : '#7f90b4';
      g.fillRect(48, y + 9, 50 + ((i * 37) % 40), 8);
      g.fillStyle = i < 2 ? '#2ee59d' : i === 3 ? YELLOW : '#5a6b92';
      g.fillRect(250, y + 9, 60 + ((i * 23) % 24), 8);
    }
    // The circuit, with cars as dots.
    g.save();
    g.translate(360, 44);
    g.fillStyle = '#081029';
    g.fillRect(0, 0, 654, 420);
    g.strokeStyle = '#1b3a78';
    g.lineWidth = 2;
    for (let x = 0; x < 654; x += 54) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 420);
      g.stroke();
    }
    for (let y = 0; y < 420; y += 54) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(654, y);
      g.stroke();
    }
    const track = [[90, 300], [90, 170], [170, 96], [300, 96], [350, 160], [470, 160], [540, 96], [600, 150], [600, 290], [520, 350], [380, 350], [300, 300], [210, 350], [130, 350]];
    g.strokeStyle = '#d9e4f7';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    track.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    g.strokeStyle = '#26406f';
    g.lineWidth = 3;
    g.stroke();
    const dots = [[170, 96, YELLOW], [350, 160, '#ff3b4a'], [540, 96, '#4da3ff'], [600, 230, '#2ee59d'], [380, 350, '#ff3b4a'], [210, 350, '#ffffff'], [90, 230, '#4da3ff']];
    for (const [x, y, c] of dots) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // The gap bar.
    g.fillStyle = '#0d1527';
    g.fillRect(360, 480, 654, 86);
    g.fillStyle = '#ff3b4a';
    g.fillRect(372, 498, 220, 16);
    g.fillStyle = '#4da3ff';
    g.fillRect(372, 528, 320, 16);
    g.fillStyle = YELLOW;
    g.font = '600 28px Arial, sans-serif';
    g.fillText('+0.054', 860, 540);
  });
}

// The radio rack under the screen: rows of red channel lights and two readouts.
function rackTexture() {
  return canvasTexture(768, 160, (g, w, h) => {
    g.fillStyle = '#17191e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0b0c0e';
    g.fillRect(14, 14, w - 28, h - 28);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 22; i++) {
        const on = (i * 7 + row * 3) % 5 !== 0;
        g.fillStyle = on ? '#ff2b3a' : '#4a0e14';
        g.fillRect(34 + i * 24, 34 + row * 46, 14, 24);
      }
    }
    for (const x of [590, 690]) {
      g.fillStyle = '#070b16';
      g.fillRect(x - 38, 28, 76, 46);
      g.fillStyle = YELLOW;
      g.font = '600 28px Arial, sans-serif';
      g.fillText(x < 640 ? '44' : '07', x - 20, 62);
    }
    g.fillStyle = '#2ee59d';
    g.fillRect(560, 110, 16, 16);
    g.fillStyle = '#9fb3d9';
    g.fillRect(590, 110, 110, 16);
  });
}

function floorTexture() {
  return canvasTexture(1024, 880, (g, w, h) => {
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#0d0f13';
    g.lineWidth = 3;
    for (let x = 0; x < w; x += 73) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y < h; y += 73) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    // The painted lanes that keep a path clear to the pit lane.
    g.fillStyle = YELLOW;
    g.fillRect(w * 0.18, 0, 12, h);
    g.fillRect(w * 0.82 - 12, 0, 12, h);
    g.fillRect(0, h * 0.86, w, 12);
  });
}

function ceilingTexture() {
  return canvasTexture(1024, 768, (g, w, h) => {
    g.fillStyle = '#dcdfe5';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b9bec8';
    g.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += 128) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
}

// The far wall: the pit lane at night through a long window, with the lights out of focus.
function windowTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04060d');
    sky.addColorStop(0.55, '#0a1630');
    sky.addColorStop(1, '#1a2a44');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#10151f';
    g.fillRect(0, h * 0.72, w, h * 0.28);
    const lamps = ['#ffe9a8', '#ffffff', '#8fd3ff', YELLOW, '#ffb347'];
    for (let i = 0; i < 70; i++) {
      const x = ((i * 131) % w) + ((i * 17) % 11);
      const y = h * 0.3 + ((i * 53) % (h * 0.5));
      const r = 5 + ((i * 7) % 14);
      g.globalAlpha = 0.28 + ((i * 13) % 50) / 100;
      g.fillStyle = lamps[i % lamps.length];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = YELLOW;
    g.fillRect(0, h * 0.7, w, 5);
  });
}

function chair(parts, x, z, yaw, dark, trim) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.add(box(0.5, 0.07, 0.5, dark, 0, 0.46, 0));
  g.add(box(0.5, 0.5, 0.06, dark, 0, 0.78, 0.25));
  g.add(box(0.5, 0.025, 0.07, trim, 0, 1.04, 0.25));
  for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 8), dark);
    leg.position.set(lx, 0.22, lz);
    g.add(leg);
  }
  parts.add(g);
}

function headset(parts, x, z, yaw, dark, trim) {
  const g = new THREE.Group();
  g.position.set(x, 1.07, z);
  g.rotation.y = yaw;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 24, Math.PI), dark);
  band.position.y = 0.04;
  g.add(band);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(0.12 * s, 0.04, 0);
    g.add(cup);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 20), trim);
    ring.rotation.z = Math.PI / 2;
    ring.position.set(0.148 * s, 0.04, 0);
    g.add(ring);
  }
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), dark);
  boom.rotation.x = Math.PI / 2.4;
  boom.position.set(0.13, -0.01, 0.1);
  g.add(boom);
  parts.add(g);
}

// A strategist at the wall: white race suit with the team stripe, a cap, a headset and one hand to the ear.
function person(parts, x, z, yaw, cap, skin, dark, trim, handUp = true) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const suit = standard(0xe9edf2, 0.7, 0.05);
  const stripe = standard(0x2b5fb8, 0.6, 0.05);
  for (const s of [-1, 1]) {
    g.add(box(0.17, 0.92, 0.2, suit, 0.1 * s, 0.46, 0));
    g.add(box(0.03, 0.92, 0.205, stripe, 0.185 * s, 0.46, 0));
  }
  g.add(box(0.44, 0.6, 0.25, suit, 0, 1.22, 0));
  g.add(box(0.05, 0.6, 0.255, stripe, 0.22, 1.22, 0));
  const arm = (sx, rx, rz) => {
    const a = box(0.11, 0.56, 0.12, suit, 0, -0.26, 0);
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * sx, 1.46, 0);
    pivot.rotation.set(rx, 0, rz);
    pivot.add(a);
    g.add(pivot);
  };
  arm(-1, 0.25, 0.12);
  if (handUp) arm(1, -2.4, -0.28);
  else arm(1, 0.25, -0.12);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), standard(skin, 0.7, 0));
  head.position.y = 1.7;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), standard(cap, 0.8, 0));
  hat.position.y = 1.72;
  g.add(hat);
  g.add(box(0.16, 0.012, 0.11, standard(cap, 0.8, 0), 0, 1.745, 0.14));
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), dark);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(0.125 * s, 1.71, 0);
    g.add(cup);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.01, 8, 20, Math.PI), dark);
  band.position.y = 1.73;
  band.rotation.z = 0;
  g.add(band);
  g.add(box(0.1, 0.014, 0.014, trim, -0.05, 1.01, 0.13));
  parts.add(g);
}

export function buildConsoleRoom() {
  const room = new THREE.Group();
  room.name = 'consoleRoom';

  const black = standard(0x0b0c0e, 0.38, 0.35);
  const deskTop = standard(0x181a1f, 0.3, 0.4);
  const seat = standard(0x14161a, 0.8, 0.05);
  const trim = standard(0xffd60a, 0.5, 0.1, { emissive: 0xffd60a, emissiveIntensity: 0.25 });
  const wall = standard(0x0e1117, 0.9, 0.05);

  // Floor, ceiling, walls.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, metalness: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), basic(ceilingTexture(), 0xffffff));
  ceiling.material.color.setRGB(0.72, 0.74, 0.78);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3.5;
  room.add(ceiling);
  // Black beams across the ceiling, with a strip of white light between each pair.
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const z of [-4, -1.4, 1.2, 3.8]) {
    room.add(box(14, 0.34, 0.5, black, 0, 3.33, z));
    room.add(box(14, 0.04, 0.22, glow, 0, 3.47, z + 1.3));
  }
  room.add(box(0.4, 0.3, 12, black, -3.4, 3.35, 0));
  room.add(box(0.4, 0.3, 12, black, 3.4, 3.35, 0));

  // One-sided walls facing in, so the room reads as a cutaway while the camera flies up to it.
  const panel = (w, h, x, y, z, yaw) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wall);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    room.add(m);
  };
  panel(14, 3.5, 0, 1.75, -5.9, 0);
  panel(14, 3.5, 0, 1.75, 6, Math.PI);
  panel(12, 3.5, -7, 1.75, 0, Math.PI / 2);
  panel(12, 3.5, 7, 1.75, 0, -Math.PI / 2);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.5), basic(windowTexture()));
  view.position.set(0, 1.9, -5.88);
  room.add(view);
  room.add(box(11.1, 0.05, 0.05, trim, 0, 1.12, -5.86));

  // The desk: a flattened hexagon in black, with a pale top and a yellow edge.
  const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.96, 6), black);
  desk.rotation.y = Math.PI / 6;
  desk.scale.set(1.45, 1, 0.8);
  desk.position.y = 0.48;
  room.add(desk);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.05, 6), deskTop);
  top.rotation.y = Math.PI / 6;
  top.scale.set(1.45, 1, 0.8);
  top.position.y = 0.985;
  room.add(top);
  room.add(box(2.0, 0.025, 0.025, trim, 0, 0.93, 1.03));
  for (const x of [-1.2, 1.2]) room.add(box(0.12, 0.2, 0.03, standard(0x2a2d34, 0.5, 0.5), x, 0.62, 0.9));

  // The radio rack and the screen above it.
  const rack = box(1.7, 0.42, 0.5, black, 0, 1.22, -0.25);
  room.add(rack);
  const rackFace = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.34), basic(rackTexture()));
  rackFace.position.set(0, 1.22, 0.006);
  rackFace.position.z = -0.25 + 0.252;
  room.add(rackFace);
  room.add(box(0.3, 0.3, 0.16, black, 0, 1.58, -0.3));
  room.add(box(1.7, 1.02, 0.12, black, 0, 2.2, -0.3));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.89), basic(screenTexture()));
  screen.position.set(0, 2.2, -0.238);
  room.add(screen);
  // A small bar of light under the screen's lip, so it reads as lit.
  room.add(box(1.5, 0.012, 0.02, trim, 0, 1.68, -0.24));

  // Headsets, bottles and a mug on the desk.
  headset(room, -0.8, 0.5, 0.5, black, trim);
  headset(room, 0.8, 0.5, -0.5, black, trim);
  const bottle = standard(0x1b2d22, 0.3, 0.2);
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), bottle);
  b1.position.set(-1.05, 1.12, -0.35);
  room.add(b1);
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 14), bottle);
  b2.position.set(1.05, 1.12, -0.35);
  room.add(b2);

  person(room, -1.75, -0.45, 0.95, 0x2b5fb8, 0xc99a76, black, trim, false);
  person(room, 1.75, -0.4, -0.95, 0x6d1a2b, 0x7a4b32, black, trim);

  // Chairs: one back to the camera in front of the desk, and a few pushed in either side.
  chair(room, 0, 2.2, Math.PI, seat, trim);
  chair(room, -2.3, 1.5, -Math.PI * 0.55, seat, trim);
  chair(room, -2.9, 0, -Math.PI * 0.5, seat, trim);
  chair(room, -2.5, -1.7, -Math.PI * 0.42, seat, trim);
  chair(room, 2.3, 1.4, Math.PI * 0.55, seat, trim);
  chair(room, 2.9, -0.1, Math.PI * 0.5, seat, trim);
  chair(room, 2.5, -1.8, Math.PI * 0.42, seat, trim);

  // Cable loops hanging from the ceiling, and a stack of cases against the back wall.
  for (const [x, y] of [[-3.8, 2.6], [3.9, 2.7]]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.025, 8, 36), black);
    loop.position.set(x, y, -1.2);
    loop.rotation.y = 0.5;
    room.add(loop);
  }
  for (const [x, y, w] of [[-5.2, 0.35, 1.2], [-5.2, 0.9, 1.0], [5.1, 0.35, 1.3]]) room.add(box(w, 0.5, 0.7, standard(0x23262d, 0.7, 0.3), x, y, -4.6));

  // Its own light, so it doesn't depend on the lamps over the circuit.
  const key = new THREE.DirectionalLight(0xe8efff, 1.4);
  key.position.set(1.5, 6, 6);
  key.target.position.set(0, 1.2, 0);
  const fill = new THREE.DirectionalLight(0xfff0d8, 0.6);
  fill.position.set(-4, 3, 3);
  fill.target.position.set(0, 1, 0);
  room.add(key, key.target, fill, fill.target);

  return room;
}
