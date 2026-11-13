// Time Trial: drive the real Marina Bay against a ghost of the real pole lap, then get a debrief that
// does to your lap exactly what the Pit Wall does to Leclerc's. That's Eugene's pitch, played.
import { sound } from './audio.js';
import { Input } from './input.js';
import { CarPhysics } from './physics.js';

const SUBSTEP = 1 / 120;
const LEVELS = {
  rookie: { name: 'Rookie', note: 'Throttle and brakes are handled. You steer, and the car helps.', speed: 0.9, pedals: true, steer: 0.42 },
  pro: { name: 'Pro', note: 'All yours. Throttle, brakes and steering.', speed: 1, pedals: false, steer: 0 },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clock = (s) => {
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(3);
  return m ? `${m}:${rest.padStart(6, '0')}` : rest;
};
const signed = (s) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(3)}`;

export class Trial {
  constructor(app) {
    this.app = app;
    this.input = new Input();
    this.events = {
      sprint: { id: 'sprint', name: 'Sector three', note: 'The 26 seconds that decided pole.', start: app.lap.lines[1], target: app.lap.cars.ver.sectors[2], marks: [app.lap.corners[15].i, app.lap.corners[17].i] },
      lap: { id: 'lap', name: 'Full lap', note: '4.9 km of Marina Bay, flat out.', start: 0, target: app.lap.cars.ver.time, marks: [app.lap.lines[0], app.lap.lines[1]] },
    };
    this.choice = { event: 'sprint', level: 'rookie' };
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    this.car = new CarPhysics(s.f, app.lap);
    this.state = 'setup';
    this.el = document.createElement('section');
    this.el.className = 'trial';
    this.el.setAttribute('aria-label', 'Time Trial');
    app.root.append(this.el);
    s.showPair(false);
    s.setReflections(!app.phone);
    s.prepareGhost();
    this.setup();
  }

  best(event, level) {
    return this.app.store.get(`kam-best-${event}-${level}`, null);
  }

  setup() {
    const { app } = this;
    const s = app.stage;
    this.state = 'setup';
    this.input.detach();
    sound.stopEngine();
    s.showGhost(false);
    s.place(s.heroIndex);
    s.view('behind', { time: 1.1 });
    s.setOffset(app.phone ? 0 : 0.2, app.phone ? 0.3 : 0);

    const tile = (group, key, name, note, on) => `
      <label class="tile${on ? ' is-on' : ''}">
        <input type="radio" name="${group}" value="${key}"${on ? ' checked' : ''}>
        <span class="tile__name">${name}</span><span class="tile__note">${note}</span>
      </label>`;
    const touch = matchMedia('(pointer: coarse)').matches;
    this.el.innerHTML = `
      <aside class="card card--setup is-in" data-ui>
        <h2 class="card__name">Beat the pole lap</h2>
        <p class="card__story">You’re on the real circuit, against a ghost of Verstappen’s real pole lap. Afterwards Eugene’s debrief shows exactly where your time went.</p>
        <fieldset><legend>Event</legend>${Object.values(this.events).map((e) => tile('event', e.id, e.name, e.note, this.choice.event === e.id)).join('')}</fieldset>
        <fieldset><legend>Driver</legend>${Object.entries(LEVELS).map(([k, l]) => tile('level', k, l.name, l.note, this.choice.level === k)).join('')}</fieldset>
        <p class="card__best" id="best"></p>
        <button class="go" type="button" id="go">Lights out</button>
        <p class="card__keys">${touch ? 'Hold the left or right side of the screen to steer.' : 'Arrow keys or WASD to drive. C changes camera. R resets. Esc pauses. A gamepad works too.'}</p>
      </aside>`;
    const showBest = () => {
      const b = this.best(this.choice.event, this.choice.level);
      const e = this.events[this.choice.event];
      this.el.querySelector('#best').textContent = `Target ${clock(e.target)}${b ? `. Your best ${clock(b)}` : ''}`;
    };
    showBest();
    this.el.querySelectorAll('input[type=radio]').forEach((r) => {
      r.addEventListener('change', () => {
        this.choice[r.name] = r.value;
        this.el.querySelectorAll(`input[name=${r.name}]`).forEach((x) => x.closest('.tile').classList.toggle('is-on', x.checked));
        showBest();
        sound.tick(640, 0.04, 0.07);
      });
    });
    this.el.querySelector('#go').addEventListener('click', () => this.begin());
  }

  begin() {
    const { app } = this;
    const s = app.stage;
    const event = this.events[this.choice.event];
    this.event = event;
    this.level = LEVELS[this.choice.level];
    const N = s.f.N;

    // A rolling start: the car drives itself up to speed while the lights come on, then it's yours.
    this.leadFrom = (event.start - 34 + N) % N;
    this.handOver = (event.start - 9 + N) % N;
    this.car.reset(this.leadFrom, app.lap.ver.v[this.leadFrom] / 3.6);
    this.state = 'lead';
    this.t = 0;
    this.started = false;
    this.armed = false;
    this.samples = [];
    this.hits = 0;
    this.splits = [];
    this.lastP = this.car.progress;
    this.timer = 0;
    this.camera = 0;
    this.lights = 0;
    this.lightClock = 0;
    this.leadTime = 0;

    this.el.innerHTML = `
      <div class="hud" data-ui>
        <div class="hud__clock">
          <span class="hud__time" id="h-time">0.000</span>
          <span class="hud__delta" id="h-delta"></span>
        </div>
        <ol class="hud__splits" id="h-splits"></ol>
        <svg class="hud__map" id="h-map" aria-hidden="true"></svg>
        <div class="hud__dash">
          <div class="revs" id="h-revs">${'<i></i>'.repeat(14)}</div>
          <div class="hud__speed"><span id="h-speed">0</span><small>km/h</small></div>
          <div class="hud__gear"><span id="h-gear">1</span><small>gear</small></div>
        </div>
        <p class="hud__msg" id="h-msg"></p>
      </div>
      <div class="lights" id="lights" aria-hidden="true">${'<i></i>'.repeat(5)}</div>
      <div class="pads" id="pads" hidden>
        <button type="button" data-pad="left" aria-label="Steer left"></button>
        <button type="button" data-pad="right" aria-label="Steer right"></button>
        <div class="pads__pedals" id="pedals" hidden>
          <button type="button" data-pad="down">Brake</button>
          <button type="button" data-pad="up">Throttle</button>
        </div>
      </div>
      <div class="pause" id="pause" data-ui hidden>
        <h2 class="card__name">Paused</h2>
        <button class="go" type="button" id="resume">Carry on</button>
        <button type="button" id="again">Restart</button>
        <button type="button" id="quit">Change event</button>
      </div>`;

    const q = (id) => this.el.querySelector(id);
    this.ui = {
      time: q('#h-time'), delta: q('#h-delta'), speed: q('#h-speed'), gear: q('#h-gear'), msg: q('#h-msg'),
      splits: q('#h-splits'), revs: [...q('#h-revs').children], lights: q('#lights'), pause: q('#pause'),
    };
    this.drawMap(q('#h-map'));
    q('#resume').addEventListener('click', () => this.pause(false));
    q('#again').addEventListener('click', () => this.begin());
    q('#quit').addEventListener('click', () => this.setup());

    if (matchMedia('(pointer: coarse)').matches) {
      const pads = q('#pads');
      pads.hidden = false;
      q('#pedals').hidden = this.level.pedals;
      pads.querySelectorAll('[data-pad]').forEach((b) => {
        const set = (on) => (e) => {
          e.preventDefault();
          this.input.touch[b.dataset.pad] = on;
          b.classList.toggle('is-on', on);
        };
        b.addEventListener('pointerdown', set(true));
        b.addEventListener('pointerup', set(false));
        b.addEventListener('pointercancel', set(false));
        b.addEventListener('pointerleave', set(false));
      });
    }

    this.input.attach();
    sound.startEngine();
    s.showGhost(true);
    s.setGhost(this.leadFrom, 0);
    s.setOffset(0, 0);
    s.setFree(this.carState());
    s.lagYaw = this.car.yaw;
    s.snap('chase');
    this.frames = 0;
  }

  carState() {
    const c = this.car;
    return { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch, roll: c.roll, steer: c.lock, v: c.v };
  }

  drawMap(svg) {
    const { x, y } = this.app.lap.ver;
    const [minX, maxX, minY, maxY] = [Math.min(...x), Math.max(...x), Math.min(...y), Math.max(...y)];
    const scale = 96 / (maxX - minX);
    this.mapX = (v) => 2 + (v - minX) * scale;
    this.mapY = (v) => 2 + (maxY - v) * scale;
    svg.setAttribute('viewBox', `0 0 100 ${(maxY - minY) * scale + 4}`);
    const d = x.map((v, i) => `${i ? 'L' : 'M'}${this.mapX(v).toFixed(1)} ${this.mapY(y[i]).toFixed(1)}`).join('');
    svg.innerHTML = `<path d="${d}Z"/><circle class="ghost" r="2.6"/><circle class="you" r="3.2"/>`;
    this.dotGhost = svg.querySelector('.ghost');
    this.dotYou = svg.querySelector('.you');
  }

  // Lap index the pole car had reached this many seconds after the start line.
  ghostIndex(t) {
    const times = this.app.lap.ver.t;
    const from = times[this.event.start];
    const want = from + t;
    let [lo, hi] = [this.event.start, times.length - 1];
    if (want >= times[hi]) return hi - 0.001;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= want) lo = mid;
      else hi = mid;
    }
    return lo + (want - times[lo]) / (times[hi] - times[lo] || 1);
  }

  poleTime(p) {
    const times = this.app.lap.ver.t;
    const i = Math.floor(p);
    const f = p - i;
    return times[i] + ((times[i + 1] ?? times[i]) - times[i]) * f - times[this.event.start];
  }

  key(e) {
    if (this.state === 'setup' || this.state === 'debrief') {
      if (e.key === 'Enter' && this.state === 'setup' && !e.target.closest?.('button')) {
        this.begin();
        return true;
      }
      return false;
    }
    if (e.key === 'Escape') {
      this.pause(this.state !== 'paused');
      return true;
    }
    if (e.code === 'KeyR' && this.state === 'run') {
      const back = Math.max(0, Math.floor(this.car.progress) - 2);
      this.car.reset(back, 20);
      return true;
    }
    if (e.code === 'KeyC') {
      this.camera = (this.camera + 1) % 3;
      this.app.stage.view(['chase', 'onboard', 'tv'][this.camera], { time: 0.35 });
      return true;
    }
    return false;
  }

  pause(on) {
    this.resume = on ? this.state : this.resume;
    this.state = on ? 'paused' : this.resume;
    this.ui.pause.hidden = !on;
    if (on) sound.engine(0, 0);
  }

  tick(h) {
    const c = this.car;
    const N = this.app.stage.f.N;
    const driving = this.state === 'run';
    const input = driving ? this.input.read() : { throttle: 0, brake: 0, steer: 0 };
    const assist = driving ? (this.level.steer || this.level.pedals ? this.level : null) : { speed: 1, pedals: true, steer: 1 };
    const before = c.progress;
    c.step(h, input, assist);
    if (c.hit > 0.15) {
      if (driving) this.hits++;
      this.app.stage.shake = Math.min(1, c.hit + 0.3);
    }

    if (this.started) {
      this.t += h;
      this.timer += h;
    }

    // Crossing the start line starts the clock.
    const e = this.event;
    const crossed = (a, b, line) => (b >= a ? a < line && b >= line : a < line || b >= line);
    if (!this.started && crossed(before, c.progress, e.start)) {
      this.started = true;
      this.t = 0;
    }
    if (!this.started) return;

    const p = c.progress < e.start - 40 && e.start > 100 ? c.progress + N : c.progress;
    if (p > e.start + 6) this.armed = true;

    if (this.timer >= 0.05) {
      this.timer = 0;
      this.samples.push({ p, t: this.t, v: c.v, th: c.throttle, br: c.brake, hit: c.hit > 0.15 });
    }

    e.marks.forEach((m, k) => {
      if (this.splits[k] === undefined && crossed(before, c.progress, m)) {
        this.splits[k] = { you: this.t, pole: this.poleTime(m) };
        this.showSplit(k);
      }
    });

    if (this.armed && before > N - 40 && c.progress < 40) this.finish();
  }

  showSplit(k) {
    const s = this.splits[k];
    const li = document.createElement('li');
    const gap = s.you - s.pole;
    li.className = gap <= 0 ? 'is-best' : 'is-off';
    li.textContent = signed(gap);
    this.ui.splits.append(li);
  }

  update(dt) {
    const { app } = this;
    const s = app.stage;
    if (this.state !== 'lead' && this.state !== 'run' && this.state !== 'done') return false;

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    for (let i = 0; i < steps; i++) this.tick(dt / steps);
    s.setFree(this.carState());

    const c = this.car;
    s.setGhost(this.started ? this.ghostIndex(this.t) : c.progress - 0.2 + 0.2, dt);
    sound.engine(c.revs, c.throttle);

    if (this.state === 'lead') this.runLights(dt);

    // The display only needs about thirty updates a second.
    this.frames++;
    if (this.frames % 2 === 0) this.draw();
    return true;
  }

  runLights(dt) {
    const c = this.car;
    const N = this.app.stage.f.N;
    const span = (this.handOver - this.leadFrom + N) % N;
    const done = (c.progress - this.leadFrom + N) % N;
    const lit = clamp(Math.floor((done / span) * 6), 0, 5);
    if (lit !== this.lights) {
      this.lights = lit;
      this.ui.lights.classList.add('is-up');
      [...this.ui.lights.children].forEach((l, i) => l.classList.toggle('is-on', i < lit));
      if (lit) sound.light();
    }
    this.leadTime += dt;
    if (done >= span) {
      [...this.ui.lights.children].forEach((l) => l.classList.remove('is-on'));
      this.ui.lights.classList.remove('is-up');
      this.ui.msg.textContent = '';
      this.state = 'run';
      sound.go();
    }
  }

  draw() {
    const { ui, car: c } = this;
    const { lap } = this.app;
    ui.speed.textContent = Math.round(c.v * 3.6);
    ui.gear.textContent = c.gear;
    const lit = Math.round(c.revs * ui.revs.length);
    ui.revs.forEach((r, i) => r.classList.toggle('is-on', i < lit));

    const i = Math.floor(c.progress) % lap.ver.x.length;
    this.dotYou.setAttribute('cx', this.mapX(lap.ver.x[i]));
    this.dotYou.setAttribute('cy', this.mapY(lap.ver.y[i]));

    if (!this.started) return;
    ui.time.textContent = clock(this.t);
    const g = Math.floor(this.ghostIndex(this.t));
    this.dotGhost.setAttribute('cx', this.mapX(lap.ver.x[g]));
    this.dotGhost.setAttribute('cy', this.mapY(lap.ver.y[g]));
    if (this.samples.length > 4) {
      const last = this.samples[this.samples.length - 1];
      const gap = last.t - this.poleTime(Math.min(last.p, lap.ver.t.length - 1.01));
      ui.delta.textContent = signed(gap);
      ui.delta.classList.toggle('is-best', gap <= 0);
    }
    ui.msg.textContent = c.wrongWay ? 'Wrong way' : '';
  }

  finish() {
    if (this.state !== 'run') return;
    const { app } = this;
    const s = app.stage;
    this.state = 'debrief';
    this.finalTime = this.t;
    this.input.detach();
    sound.stopEngine();
    sound.go();
    app.scout('trial');
    const key = `kam-best-${this.event.id}-${this.choice.level}`;
    const old = app.store.get(key, null);
    this.isBest = !old || this.finalTime < old;
    if (this.isBest) app.store.set(key, this.finalTime);
    s.showGhost(false);
    s.place(Math.floor(this.car.progress) + 1);
    s.view('round', { time: 1.8 });
    s.setOffset(app.phone ? 0 : 0.2, app.phone ? 0.34 : 0);
    this.debrief(this.analyse());
  }

  // The same questions the Pit Wall asks of Leclerc, asked of you.
  analyse() {
    const { lap } = this.app;
    const e = this.event;
    const N = this.app.stage.f.N;
    const end = N;
    const rows = this.samples;
    const youAt = (p) => {
      let [lo, hi] = [0, rows.length - 1];
      if (p <= rows[0].p) return rows[0].t;
      if (p >= rows[hi].p) return this.finalTime;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].p <= p) lo = mid;
        else hi = mid;
      }
      return rows[lo].t + ((rows[hi].t - rows[lo].t) * (p - rows[lo].p)) / (rows[hi].p - rows[lo].p || 1);
    };
    const gapAt = (p) => youAt(p) - this.poleTime(p);

    const corners = lap.corners.filter((c) => c.i >= e.start);
    const zones = corners.map((c, k) => {
      const prev = k ? corners[k - 1] : null;
      const next = corners[k + 1];
      const from = prev ? (prev.i + c.i) / 2 : e.start;
      const to = next ? (c.i + next.i) / 2 : end - 0.01;
      const inside = rows.filter((r) => r.p >= from && r.p < to);
      const low = inside.length ? Math.min(...inside.map((r) => r.v)) * 3.6 : 0;
      return { n: c.n, lost: gapAt(to) - gapAt(from), apex: Math.round(low), pole: c.ver, hit: inside.some((r) => r.hit) };
    });
    const worst = [...zones].sort((a, b) => b.lost - a.lost).slice(0, 3);
    const best = [...zones].sort((a, b) => a.lost - b.lost)[0];

    const speeds = [];
    for (let i = e.start; i < end; i++) speeds.push({ i, pole: lap.ver.v[i] });
    const you = speeds.map((s) => {
      let [lo, hi] = [0, rows.length - 1];
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].p <= s.i) lo = mid;
        else hi = mid;
      }
      return rows[hi].v * 3.6;
    });
    const full = rows.filter((r) => r.th > 0.9).length / rows.length;
    return { gap: this.finalTime - e.target, worst, best, speeds, you, full, hits: this.hits };
  }

  debrief(a) {
    const { app } = this;
    const e = this.event;
    const lec = e.id === 'lap' ? app.lap.cars.lec.time : app.lap.cars.lec.sectors[2];
    const line = (z) => {
      const verdict = z.apex > z.pole + 2 ? 'Too quick to stay tidy' : z.apex < z.pole - 2 ? 'Speed left on the table' : 'Right speed, wrong line';
      return `<li><strong>Turn ${z.n}</strong><span>${z.lost.toFixed(2)} s lost</span><em>Your apex ${z.apex} km/h, Verstappen’s ${z.pole}. ${verdict}${z.hit ? ', and you found the wall' : ''}.</em></li>`;
    };
    const w = 100;
    const h = 40;
    const x = (i) => (i / (a.speeds.length - 1)) * w;
    const y = (v) => h - (v / 330) * h;
    const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join('');
    const beatPole = a.gap < 0;

    this.el.innerHTML = `
      <aside class="card card--debrief" data-ui>
        <p class="card__round">Engineer’s debrief, ${e.name.toLowerCase()}, ${LEVELS[this.choice.level].name.toLowerCase()}</p>
        <h2 class="card__name">${clock(this.finalTime)}</h2>
        <p class="card__role">${beatPole ? `${Math.abs(a.gap).toFixed(3)} under the pole time. Verstappen would like a word.` : `${a.gap.toFixed(3)} off the pole time${this.isBest ? '. A new personal best' : ''}.`}</p>
        <div class="trace">
          <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
            <path class="trace__pole" d="${path(a.speeds.map((s) => s.pole))}" vector-effect="non-scaling-stroke"/>
            <path class="trace__you" d="${path(a.you)}" vector-effect="non-scaling-stroke"/>
          </svg>
          <p class="trace__key"><span class="is-you">You</span><span class="is-pole">Verstappen</span><span>Speed through the ${e.id === 'lap' ? 'lap' : 'sector'}</span></p>
        </div>
        <h3 class="card__sub">Where the time went</h3>
        <ol class="losses">${a.worst.map(line).join('')}</ol>
        <p class="card__story">Your best work was Turn ${a.best.n}${a.best.lost <= 0 ? `, where you beat the pole lap by ${Math.abs(a.best.lost).toFixed(2)} s` : `, only ${a.best.lost.toFixed(2)} s off`}. ${a.hits ? `You touched the wall ${a.hits === 1 ? 'once' : `${a.hits} times`}.` : 'No wall contact.'} Leclerc’s ${clock(lec)} is your next target.</p>
        <p class="card__why">Finding the corner that cost you is the job. It’s what Eugene wants to do for a living.</p>
        <div class="card__nav">
          <button class="go" type="button" id="again">Go again</button>
          <button type="button" id="change">Change event</button>
          <a class="button-link" href="#/radio">Talk to Eugene</a>
        </div>
      </aside>`;
    requestAnimationFrame(() => this.el.querySelector('.card').classList.add('is-in'));
    this.el.querySelector('#again').addEventListener('click', () => this.begin());
    this.el.querySelector('#change').addEventListener('click', () => this.setup());
  }

  leave() {
    const s = this.app.stage;
    this.input.detach();
    sound.stopEngine();
    s.showGhost(false);
    this.state = 'setup';
  }
}
