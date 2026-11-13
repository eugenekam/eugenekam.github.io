import '@fontsource-variable/albert-sans';
import '@fontsource-variable/imbue/opsz.css';
import './styles.css';
import { mountScope } from './scope.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)');
const remember = {
  get() {
    try {
      return localStorage.getItem('kam-motion');
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem('kam-motion', value);
    } catch {
      /* Private windows can refuse storage. The choice then lasts for this visit. */
    }
  },
};
let stillMode = calm.matches && remember.get() !== 'on';
const phone = matchMedia('(max-width: 860px)');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/* Entrances, once, as each part arrives. */
const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        reveal.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
);
document.querySelectorAll('[data-reveal], .stint').forEach((el) => reveal.observe(el));

/* The contact field writes an email with the visitor's own words as the subject. */
document.getElementById('ask').addEventListener('submit', (e) => {
  e.preventDefault();
  const role = document.getElementById('role').value.trim();
  const subject = role || 'A seat on the pit wall';
  location.href = `mailto:eugenekkh@gmail.com?subject=${encodeURIComponent(subject)}`;
});

// Without the lap data the page still reads in full: the poster stays and the table holds the numbers.
const lap = await fetch('/data/lap.json').then((r) => r.json()).catch(() => null);
if (!lap) {
  window.__ready = true;
  throw new Error('Lap data did not load');
}

const stageEl = document.getElementById('stage');
const barLeft = document.getElementById('bar-left');
const barRight = document.getElementById('bar-right');
const towerEl = document.getElementById('tower');
const mapEl = document.getElementById('map');

/* The stints as a timing tower, and the circuit as a small map. Both are real data. */
const stints = [...document.querySelectorAll('.stint')];
const rows = stints.map((s) => {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span></span><span></span>`;
  row.children[0].textContent = s.dataset.index;
  const sector = s.closest('.sector').id;
  row.children[1].textContent = sector === 'sector-one' ? 'S1' : sector === 'sector-two' ? 'S2' : 'S3';
  towerEl.append(row);
  return row;
});

const xs = lap.ver.x;
const ys = lap.ver.y;
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);
const scale = 96 / (maxX - minX);
const mapX = (x) => 2 + (x - minX) * scale;
const mapY = (y) => 2 + (maxY - y) * scale;
mapEl.setAttribute('viewBox', `0 0 100 ${(maxY - minY) * scale + 4}`);
const trace = document.createElementNS('http://www.w3.org/2000/svg', 'path');
trace.setAttribute('d', xs.map((x, i) => `${i ? 'L' : 'M'}${mapX(x).toFixed(1)} ${mapY(ys[i]).toFixed(1)}`).join('') + 'Z');
const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
dot.setAttribute('r', 3.2);
mapEl.append(trace, dot);

function readout(index) {
  const i = Math.max(0, Math.min(lap.delta.length - 1, Math.round(index)));
  const corner = lap.corners.find((c) => Math.abs(c.i - i) <= 6);
  const sector = i < lap.lines[0] ? 'Sector 1' : i < lap.lines[1] ? 'Sector 2' : 'Sector 3';
  const v = lap.ver;
  const pedal = v.br[i] > 50 ? 'on the brakes' : `${Math.round(v.th[i])}% throttle`;
  barLeft.textContent = `${corner ? `Turn ${corner.n}` : sector}, ${lap.m[i].toLocaleString('en-GB')} m`;
  barRight.textContent = `${v.v[i]} km/h, gear ${v.g[i]}, ${pedal}`;
  dot.setAttribute('cx', mapX(xs[i]));
  dot.setAttribute('cy', mapY(ys[i]));
}

const heroBar = () => {
  barLeft.textContent = 'Pole lap, 1:31.373';
  barRight.textContent = 'Marina Bay, Singapore';
};

let stage = null;
let scope = null;

/* The analysis works with or without the 3D stage. */
scope = mountScope(lap, (verIndex, lecIndex) => {
  if (stage && zone === 'tool') {
    stage.setPair(true, verIndex, lecIndex);
    readout(verIndex);
    barRight.textContent = `VER ${lap.ver.v[Math.round(verIndex)]} km/h, LEC ${lap.lec.v[Math.round(verIndex)]} km/h`;
  }
});

/* The director: what the reading column is on decides what the stage shows. */
const shots = [...document.querySelectorAll('[data-shot]')];
const lapSection = document.getElementById('lap');
const sectorTwo = document.getElementById('sector-two');
const sectorThree = document.getElementById('sector-three');
const tool = document.getElementById('analysis');
const spec = document.getElementById('spec');
const LAST = lap.delta.length - 2;
let zone = 'top';
let stageIndex = 0;

function direct() {
  if (!stage) return;
  const vh = innerHeight;
  const line = vh * 0.55;
  let active = shots[0];
  for (const el of shots) if (el.getBoundingClientRect().top <= line) active = el;
  const shot = active.dataset.shot;
  const inLap = lapSection.contains(active);
  const next = inLap ? 'lap' : active === tool ? 'tool' : active === spec ? 'spec' : 'top';

  // The column's sector headings line up with the real timing lines, so "Sector two" arrives as the
  // car crosses the first one.
  const r = lapSection.getBoundingClientRect();
  const marks = [r.top, sectorTwo.getBoundingClientRect().top, sectorThree.getBoundingClientRect().top, r.bottom];
  const stops = [0, lap.lines[0], lap.lines[1], LAST];
  let leg = 0;
  while (leg < 2 && line >= marks[leg + 1]) leg++;
  const lapIndex = stops[leg] + clamp((line - marks[leg]) / (marks[leg + 1] - marks[leg])) * (stops[leg + 1] - stops[leg]);

  if (next !== zone) {
    const was = zone;
    zone = next;
    towerEl.classList.toggle('is-on', zone === 'lap');
    mapEl.classList.toggle('is-on', zone === 'lap' || zone === 'tool');
    if (zone === 'lap') {
      stage.setPair(false);
      stage.setExplode(0);
      stage.cut(shot, lapIndex);
    } else if (zone === 'tool') {
      const i = scope.current();
      stage.setExplode(0);
      stage.cut('pair', i);
      stage.setPair(true, i, scope.lecIndexAt(i));
      readout(i);
    } else {
      if (was === 'tool') stage.setPair(false);
      stage.cut(shot, stage.heroIndex);
      heroBar();
      if (zone === 'spec') {
        barLeft.textContent = 'Car 54, taken apart';
        barRight.textContent = 'Modelled to real proportions';
      }
    }
  } else {
    stage.cut(shot);
  }

  if (zone === 'lap') {
    // In calm mode the car holds a finished frame for each stint instead of driving with the scroll.
    if (stillMode) {
      const anchor = active.getBoundingClientRect().top + active.offsetHeight * 0.5;
      let part = 0;
      while (part < 2 && anchor >= marks[part + 1]) part++;
      stage.setLap(stops[part] + clamp((anchor - marks[part]) / (marks[part + 1] - marks[part])) * (stops[part + 1] - stops[part]));
    } else {
      stage.setLap(lapIndex);
    }
    stints.forEach((s, k) => {
      const on = s === active;
      rows[k].classList.toggle('is-on', on);
      rows[k].classList.toggle('is-past', !on && s.getBoundingClientRect().top < line);
    });
  }
  if (zone === 'spec') {
    const s = spec.getBoundingClientRect();
    stage.setExplode(stillMode ? 1 : clamp((vh * 0.72 - s.top) / (s.height * 0.75)));
  }
}

let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    direct();
  });
}, { passive: true });

const motionButton = document.getElementById('motion');

function setMotion(full) {
  stillMode = !full;
  motionButton.setAttribute('aria-pressed', String(full));
  motionButton.textContent = full ? 'Calm version' : 'Full motion';
  stage?.setStill(stillMode);
  direct();
}

if (calm.matches) {
  motionButton.hidden = false;
  setMotion(!stillMode);
  motionButton.addEventListener('click', () => {
    const full = stillMode;
    remember.set(full ? 'on' : 'off');
    setMotion(full);
  });
}

async function bootStage() {
  const test = document.createElement('canvas');
  if (!test.getContext('webgl2')) return;
  const [{ Stage, HERO_INDEX }] = await Promise.all([
    import('./stage/stage.js'),
    document.fonts.load('400 100px "Imbue Variable"'),
    document.fonts.load('600 60px "Albert Sans Variable"'),
  ]);
  const made = new Stage(document.getElementById('scene'), lap, { phone: phone.matches });
  made.heroIndex = HERO_INDEX;
  made.setStill(stillMode);
  await made.loadCity('/data/city.bin');
  made.setFence();
  made.render(0.016, 0);
  stage = made;
  window.__stage = made;
  stageEl.classList.add('is-live');
  made.start((index) => {
    if (zone === 'lap') readout(index);
  });
  direct();

  new ResizeObserver(() => made.resize()).observe(stageEl);
  stageEl.addEventListener('pointermove', (e) => {
    const r = stageEl.getBoundingClientRect();
    made.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  stageEl.addEventListener('pointerleave', () => made.setPointer(0, 0));

  const pause = () => {
    if (document.hidden) made.stop();
    else if (!made.running) made.start(made.onFrame);
  };
  document.addEventListener('visibilitychange', pause);
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !document.hidden && !made.running) made.start(made.onFrame);
    else if (!e.isIntersecting) made.stop();
  }).observe(stageEl);
}

bootStage().finally(() => {
  window.__ready = true;
});
