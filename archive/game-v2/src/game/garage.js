// Garage: the car on its own. Drag to spin it, click a part to fly in, and pull the whole thing apart.
// Each part carries one true thing about what Eugene brings.
import { sound } from './audio.js';
import { Vector3 } from 'three';

const PARTS = [
  { id: 'wing', name: 'Front wing', title: 'First contact', at: [2.55, 0.28, 0.62], view: { az: 0.75, el: 0.26, dist: 3.8, x: 2.1, y: 0.3 }, text: 'The first thing to meet the air. Player support in English and Mandarin on a top-2 global gaming platform.' },
  { id: 'halo', name: 'Halo', title: 'Audit-ready', at: [0.3, 1.0, 0], view: { az: 0.9, el: 0.42, dist: 3.4, x: 0.2, y: 0.85 }, text: 'Built so nothing gets through. Clear authorisation trails across procurement and logistics, to the reporting standards of a NASDAQ-listed company.' },
  { id: 'driver', name: 'Cockpit', title: 'Four languages on the radio', at: [-0.05, 1.05, -0.2], view: { az: -0.9, el: 0.34, dist: 3.1, x: 0, y: 0.82 }, text: 'English, Mandarin, Malay and Cantonese.' },
  { id: 'pods', name: 'Sidepods', title: 'Cooling under load', at: [-0.1, 0.72, 0.72], view: { az: 1.45, el: 0.2, dist: 4.2, x: -0.2, y: 0.5 }, text: 'A 10× surge in tickets, with resolution accuracy at 95%+ and SLA compliance at 98%+.' },
  { id: 'floor', name: 'Floor', title: 'Where the speed hides', at: [-0.7, 0.2, 0.88], view: { az: 1.2, el: 0.08, dist: 4.6, x: -0.5, y: 0.22 }, text: 'The part nobody sees. More than 1,000 vessels in one clean Excel database, with SQL and Python basics from re/Start on top.' },
  { id: 'engine', name: 'Power unit', title: 'Certified', at: [-0.9, 1.08, 0], view: { az: 2.5, el: 0.38, dist: 4.2, x: -0.9, y: 0.8 }, text: 'AWS Certified Cloud Practitioner and Google Project Management: Specialization.' },
  { id: 'rear', name: 'Rear wing', title: 'Keeping it planted', at: [-2.5, 1.15, 0.4], view: { az: 2.9, el: 0.24, dist: 3.8, x: -2.3, y: 0.8 }, text: 'Procurement and sales operations in AutoCount, supporting on average SGD 50,000 a month across 10 client accounts.' },
  { id: 'wheel', name: 'Tyres', title: 'Where it meets the road', at: [1.7, 0.78, 0.88], view: { az: 0.3, el: 0.16, dist: 3.4, x: 1.7, y: 0.36, z: 0.3 }, text: 'About 20 delivery loads a week between suppliers, outlets and clients, sequenced without direct supervision.' },
];

export class Garage {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    s.showPair(false);
    s.place(s.heroIndex);
    s.setReflections(true);
    s.setOffset(0, 0);
    s.focusOrbit({ az: 0.95, el: 0.26, dist: 8.2 });
    s.orbit.az = s.orbit.az0;
    s.orbit.dist = s.orbit.dist0;
    s.orbit.el = s.orbit.el0;
    s.snap('garage');

    this.el = document.createElement('section');
    this.el.className = 'garage';
    this.el.setAttribute('aria-label', 'Garage');
    this.el.innerHTML = `
      <div class="drag" aria-hidden="true"></div>
      <div class="pins pins--parts"></div>
      <aside class="card card--part" data-ui hidden></aside>
      <div class="garage__tools" data-ui>
        <button type="button" id="apart" aria-pressed="false">Take it apart</button>
        <button type="button" id="whole">Whole car</button>
      </div>
      <p class="hint" data-ui>${app.phone ? 'Drag to spin. Tap a marker.' : 'Drag to spin. Click a marker.'}</p>`;
    app.root.append(this.el);

    this.layer = this.el.querySelector('.pins');
    this.card = this.el.querySelector('.card');
    this.markers = PARTS.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'marker';
      b.setAttribute('aria-label', p.name);
      if (app.progress[`part-${p.id}`]) b.classList.add('is-seen');
      b.addEventListener('click', () => this.pick(p));
      this.layer.append(b);
      return { p, b, v: new Vector3() };
    });

    const apart = this.el.querySelector('#apart');
    apart.addEventListener('click', () => {
      const on = apart.getAttribute('aria-pressed') !== 'true';
      apart.setAttribute('aria-pressed', String(on));
      apart.textContent = on ? 'Put it back' : 'Take it apart';
      s.setExplode(on ? 1 : 0);
      s.focusOrbit({ dist: on ? 11 : 8.2, y: on ? 1.1 : 0.55 });
      this.layer.classList.toggle('is-off', on);
      this.card.hidden = true;
      sound.tick(on ? 180 : 320, 0.2, 0.14);
    });
    this.el.querySelector('#whole').addEventListener('click', () => this.reset());

    this.drag = null;
    const zone = this.el.querySelector('.drag');
    zone.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, az: s.orbit.az0, el: s.orbit.el0 };
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      s.orbit.az0 = this.drag.az + (e.clientX - this.drag.x) * 0.006;
      s.orbit.el0 = Math.min(1.1, Math.max(0.03, this.drag.el + (e.clientY - this.drag.y) * 0.004));
      s.needsFrame = true;
    });
    zone.addEventListener('pointerup', () => {
      this.drag = null;
    });
    zone.addEventListener('wheel', (e) => {
      s.orbit.dist0 = Math.min(13, Math.max(3, s.orbit.dist0 + e.deltaY * 0.004));
      s.needsFrame = true;
    }, { passive: true });
  }

  pick(p) {
    const { app } = this;
    const s = app.stage;
    app.scout(`part-${p.id}`);
    this.markers.forEach((m) => {
      m.b.classList.toggle('is-on', m.p === p);
      if (m.p === p) m.b.classList.add('is-seen');
    });
    s.focusOrbit({ x: 0, y: 0.55, z: 0, ...p.view });
    s.setOffset(app.phone ? 0 : 0.14, app.phone ? 0.24 : 0);
    const seen = this.markers.filter((m) => m.b.classList.contains('is-seen')).length;
    this.card.hidden = false;
    this.card.classList.remove('is-in');
    this.card.innerHTML = `
      <p class="card__round">${p.name}, ${seen} of ${PARTS.length} found</p>
      <h2 class="card__name">${p.title}</h2>
      <p class="card__story">${p.text}</p>`;
    requestAnimationFrame(() => this.card.classList.add('is-in'));
    sound.tick(760, 0.06, 0.09);
  }

  reset() {
    const s = this.app.stage;
    this.card.hidden = true;
    this.markers.forEach((m) => m.b.classList.remove('is-on'));
    s.focusOrbit({ az: s.orbit.az0, el: 0.26, dist: 8.2 });
    s.setOffset(0, 0);
  }

  key(e) {
    const o = this.app.stage.orbit;
    if (e.key === 'ArrowLeft') o.az0 -= 0.25;
    else if (e.key === 'ArrowRight') o.az0 += 0.25;
    else return false;
    this.app.stage.needsFrame = true;
    return true;
  }

  update(dt) {
    const s = this.app.stage;
    if (!this.drag && !this.card.classList.contains('is-in') && !s.still) s.orbit.az0 += dt * 0.09;
    if (this.layer.classList.contains('is-off')) return;
    const [w, h] = [innerWidth, innerHeight];
    s.car.updateMatrixWorld();
    for (const m of this.markers) {
      m.v.set(...m.p.at);
      s.car.localToWorld(m.v);
      m.v.project(s.cam);
      m.b.style.transform = `translate3d(${((m.v.x + 1) / 2) * w}px, ${((1 - m.v.y) / 2) * h}px, 0)`;
    }
  }

  leave() {
    this.app.stage.setExplode(0);
  }
}
