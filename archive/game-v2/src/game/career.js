// Career: the CV as a season. Every job is a round on the real circuit. Pick one on the map or the
// timing tower, the car drives there in a time-lapse of the real lap, and its card opens.
// The content is read from the CV in the page, so there's only one copy of it to keep right.
import { sound } from './audio.js';

const CASE_SOURCES = ['Backend database', 'Behavioural logs', 'Timestamps', 'Geolocation'];

function rollNumber(el, calm) {
  const text = el.textContent.trim();
  const match = text.match(/^([^\d]*)([\d,]+)(.*)$/);
  if (!match || calm) return;
  const [, before, digits, after] = match;
  const end = Number(digits.replace(/,/g, ''));
  const started = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - started) / 900);
    const k = 1 - (1 - t) ** 4;
    el.textContent = `${before}${Math.round(end * k).toLocaleString('en-GB')}${after}`;
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
}

export class Career {
  constructor(app) {
    this.app = app;
    this.rounds = [...document.querySelectorAll('.stint')].map((el, i) => ({
      i,
      id: el.id,
      tag: el.dataset.tag,
      at: Number(el.dataset.at),
      sector: Number(el.dataset.sector),
      angle: Number(el.dataset.angle),
      why: el.dataset.why,
      hasCase: el.dataset.case === 'true',
      name: el.querySelector('h4').textContent,
      role: el.querySelector('.stint__role').textContent,
      numbers: [...el.querySelectorAll('.numbers > div')].map((d) => ({ label: d.querySelector('dt').textContent, value: d.querySelector('dd').textContent })),
      story: [...el.querySelectorAll(':scope > p:not(.stint__role)')].map((p) => p.textContent),
      image: el.querySelector('.shot img'),
    }));
  }

  enter(param) {
    const { app } = this;
    const s = app.stage;
    this.el = document.createElement('section');
    this.el.className = 'career';
    this.el.setAttribute('aria-label', 'Career');
    this.el.innerHTML = `
      <ol class="tower" data-ui></ol>
      <div class="pins" aria-hidden="false"></div>
      <aside class="card" data-ui hidden></aside>
      <p class="hint" data-ui></p>`;
    app.root.append(this.el);
    this.tower = this.el.querySelector('.tower');
    this.card = this.el.querySelector('.card');
    this.pins = this.el.querySelector('.pins');
    this.hint = this.el.querySelector('.hint');

    this.rounds.forEach((r) => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#/career/${r.id}"><span>${r.tag}</span><span>S${r.sector}</span></a>`;
      this.tower.append(li);
      r.row = li.firstElementChild;
      if (app.progress[`round-${r.id}`]) r.row.classList.add('is-seen');

      const pin = document.createElement('a');
      pin.className = 'pin';
      pin.href = `#/career/${r.id}`;
      pin.innerHTML = `<i>${r.i + 1}</i><span>${r.tag}</span>`;
      this.pins.append(pin);
      r.pin = pin;
      r.world = s.f.pose(r.at, {});
    });

    const next = document.createElement('li');
    next.innerHTML = `<a class="tower__next" href="#/radio"><span>Your team?</span><span>Next</span></a>`;
    this.tower.append(next);

    s.showPair(false);
    s.place(s.heroIndex);
    s.setReflections(false);
    s.setOffset(0, 0);
    this.current = null;
    s.snap('map');
    this.param(param);
  }

  param(id) {
    const round = this.rounds.find((r) => r.id === id);
    if (round) this.open(round);
    else this.showMap();
  }

  showMap() {
    const s = this.app.stage;
    this.current = null;
    this.card.hidden = true;
    this.el.classList.add('is-map');
    this.rounds.forEach((r) => r.row.classList.remove('is-on'));
    s.view('map', { time: 1.6, arc: 90 });
    s.setOffset(0, 0);
    this.hint.textContent = 'Pick a round on the map or the tower.';
  }

  async open(round) {
    const { app } = this;
    const s = app.stage;
    const wasMap = !this.current;
    this.current = round;
    app.scout(`round-${round.id}`);
    this.el.classList.remove('is-map');
    this.rounds.forEach((r) => {
      r.row.classList.toggle('is-on', r === round);
      if (app.progress[`round-${r.id}`]) r.row.classList.add('is-seen');
    });
    this.fill(round);
    this.hint.textContent = app.phone ? '' : '← → to change round. M for the map.';
    sound.tick(700, 0.05, 0.08);

    s.setOffset(app.phone ? 0 : 0.14, app.phone ? 0.28 : 0);

    // Next door, the car drives there. Across the circuit, the camera flies over the city and picks
    // the car up just before the corner, so a drive never looks faster than a sped-up lap.
    const { N } = s.f;
    const ahead = ((round.at - s.index) % N + N) % N;
    const far = wasMap || ahead > 130;
    if (far) s.place(round.at - 22);
    s.view('follow', { time: far ? 1.5 : 0.9, arc: far ? 70 : 0 });
    const arrived = await s.drive(round.at, far ? 2.4 : undefined);
    if (arrived && this.current === round) {
      s.roundAngle = round.angle;
      s.view('round', { time: 1.6 });
    }
  }

  fill(r) {
    const { app } = this;
    const [hero, ...rest] = r.numbers;
    const sector = ['one', 'two', 'three'][r.sector - 1];
    const card = this.card;

    const tabs = [];
    if (rest.length) tabs.push(['Numbers', `<dl class="card__numbers">${rest.map((n) => `<div><dd>${n.value}</dd><dt>${n.label}</dt></div>`).join('')}</dl>`]);
    tabs.push(['Story', `${r.story.map((p) => `<p class="card__story">${p}</p>`).join('')}${r.image ? `<img class="card__picture" src="${r.image.getAttribute('src')}" alt="${r.image.alt}">` : ''}`]);
    if (r.hasCase) tabs.push(['Case file', this.caseFile()]);
    tabs.push(['Pit wall', `<p class="card__why">${r.why}</p>`]);

    card.hidden = false;
    card.classList.remove('is-in');
    card.innerHTML = `
      <p class="card__round">Round ${r.i + 1} of 8, sector ${sector}</p>
      <h2 class="card__name">${r.name}</h2>
      <p class="card__role">${r.role}</p>
      ${hero ? `<p class="card__hero"><span class="card__figure">${hero.value}</span><span>${hero.label}</span></p>` : ''}
      <div class="tabs" role="tablist" aria-label="${r.name}">${tabs.map(([t], i) => `<button type="button" role="tab" id="tab-${i}" aria-controls="pane-${i}" aria-selected="${i === 0}">${t}</button>`).join('')}</div>
      ${tabs.map(([, html], i) => `<div class="pane" role="tabpanel" id="pane-${i}" aria-labelledby="tab-${i}"${i ? ' hidden' : ''}>${html}</div>`).join('')}
      <div class="card__nav">
        <button type="button" data-go="-1" aria-label="Previous round">Previous</button>
        <button type="button" data-go="1">${r.i === 7 ? 'Next: your team?' : 'Next round'}</button>
        <button type="button" data-map>Map</button>
      </div>`;
    card.scrollTop = 0;
    requestAnimationFrame(() => card.classList.add('is-in'));

    const calm = app.calm();
    const rollIn = (root) => root.querySelectorAll('.card__figure, .card__numbers dd').forEach((n) => rollNumber(n, calm));
    rollIn(card);

    const buttons = [...card.querySelectorAll('[role=tab]')];
    const panes = [...card.querySelectorAll('[role=tabpanel]')];
    const choose = (i) => {
      buttons.forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
      panes.forEach((p, k) => {
        p.hidden = k !== i;
        p.classList.toggle('is-new', k === i);
      });
      sound.tick(820, 0.03, 0.06);
      if (!panes[i].hidden) rollIn(panes[i]);
    };
    buttons.forEach((b, i) => b.addEventListener('click', () => choose(i)));

    card.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => this.step(Number(b.dataset.go))));
    card.querySelector('[data-map]').addEventListener('click', () => {
      location.hash = '#/career';
    });
    if (r.hasCase) this.wireCase();
  }

  // A small piece of the actual job: no single source proves a fraudulent claim, all four together do.
  caseFile() {
    return `
      <div class="case">
        <p class="case__ask">A limited-edition item claim. Cross-reference all four sources to close it.</p>
        <div class="case__sources">${CASE_SOURCES.map((s) => `<button type="button" aria-pressed="false">${s}</button>`).join('')}</div>
        <p class="case__result" aria-live="polite">0 of 4 checked.</p>
      </div>`;
  }

  wireCase() {
    const box = this.card.querySelector('.case');
    const result = box.querySelector('.case__result');
    const buttons = [...box.querySelectorAll('button')];
    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        const n = buttons.filter((x) => x.getAttribute('aria-pressed') === 'true').length;
        sound.tick(500 + n * 120, 0.05, 0.08);
        if (n === 4) {
          result.textContent = 'Case closed. Pay-out stopped. An estimated USD 250k in digital assets protected over the job.';
          box.classList.add('is-closed');
        } else {
          result.textContent = `${n} of 4 checked.`;
          box.classList.remove('is-closed');
        }
      });
    });
  }

  step(by) {
    const i = (this.current?.i ?? -1) + by;
    if (i >= this.rounds.length) location.hash = '#/radio';
    else location.hash = `#/career/${this.rounds[Math.max(0, i)].id}`;
  }

  key(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.step(1);
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.step(-1);
      return true;
    }
    if (e.key === 'm' || e.key === 'M') {
      location.hash = '#/career';
      return true;
    }
    return false;
  }

  // Keeps the pins on the circuit as the camera moves.
  update() {
    if (this.current) return;
    const s = this.app.stage;
    const v = this.v ?? (this.v = s.cam.position.clone());
    const [w, h] = [innerWidth, innerHeight];
    for (const r of this.rounds) {
      v.set(r.world.x, 0, r.world.z).project(s.cam);
      r.pin.style.transform = `translate3d(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px, 0)`;
    }
  }

  leave() {
    const s = this.app.stage;
    s.place(s.heroIndex);
    this.current = null;
  }
}
