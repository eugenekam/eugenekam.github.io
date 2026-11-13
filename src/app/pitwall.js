// Pit Wall: where 0.054 seconds went, told in steps you click through. Each step moves both real cars
// to the place on the lap it's talking about, and the last one hands over the full instrument.
import { lecIndexAt, mountScope } from '../scope.js';
import { sound } from './audio.js';
import { mountTabs, tabList, tabPanes } from './tabs.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function story(lap) {
  const t7 = lap.corners.find((c) => c.n === 7);
  const t16 = lap.corners.find((c) => c.n === 16);
  return {
    t7,
    t16,
    steps: [
      { tab: 'The gap', at: lap.delta.length - 3, figure: '0.054', title: 'Where did it go?', text: 'Singapore, 10 October 2026. Max Verstappen took pole from Charles Leclerc by 0.054 seconds. After 4.9 km that’s 4 metres, less than the length of a car.' },
      { tab: 'The lead', at: lap.lines[1], figure: '0.107', title: 'Leclerc led with one sector left', text: 'Verstappen’s time came on his first Q3 run and his second didn’t beat it, so Leclerc’s final run was his last shot at it. Through the middle sector he was quicker at five of the seven corners and slower at none.' },
      { tab: 'The loss', at: t16.i - 30, figure: '0.161', title: 'Then he lost it in sector three', text: 'Verstappen’s 25.840 was the fastest third sector of the whole session, by anyone. Through it he was quicker at four of the six corners. Leclerc’s two wins there were a single km/h each.' },
      { tab: 'The corner', at: t16.i + 2, title: 'The same choice, two results', text: 'At both corners Leclerc dropped to second gear where Verstappen stayed in third. Pick one to go there.' },
    ],
  };
}

export class PitWall {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    const { steps, t7, t16 } = story(app.lap);
    this.steps = steps;
    this.tween = null;
    this.scope = null;

    const pane = (step) => `
      ${step.figure ? `<p class="card__hero"><span class="card__figure">${step.figure}</span><span>seconds</span></p>` : ''}
      <h3 class="card__ask">${step.title}</h3>
      <p class="card__story">${step.text}</p>`;

    const corner = (c) => `<button type="button" data-corner="${c.n}" aria-pressed="${c.n === 16}"><strong>Turn ${c.n}</strong><span>Leclerc ${c.lec} km/h, Verstappen ${c.ver} km/h</span></button>`;

    this.el = document.createElement('section');
    this.el.className = 'pitwall';
    this.el.setAttribute('aria-label', 'Pit Wall');
    this.el.innerHTML = `
      <aside class="card card--pit" data-ui>
        <p class="card__round">Singapore qualifying, 10 October 2026</p>
        ${tabList([...steps.map((x) => x.tab), 'Instrument'], 'Where the time went')}
        ${tabPanes([
          ...steps.slice(0, 3).map(pane),
          `${pane(steps[3])}<div class="corners">${corner(t7)}${corner(t16)}</div><p class="card__why" id="corner-note">${this.cornerNote(16)}</p>`,
          this.instrument(),
        ])}
      </aside>`;
    app.root.append(this.el);
    this.card = this.el.querySelector('.card');
    requestAnimationFrame(() => this.card.classList.add('is-in'));

    s.setReflections(false);
    s.showPair(true);
    this.index = steps[0].at;
    s.setPair(this.index, lecIndexAt(app.lap, this.index), true);
    s.stepPair(0.016);
    s.lagYaw = s.pose.yaw;
    s.snap('pair');
    s.setOffset(app.phone ? 0 : 0.2, app.phone ? 0.3 : 0);

    this.el.querySelectorAll('[data-corner]').forEach((b) => b.addEventListener('click', () => this.goCorner(Number(b.dataset.corner))));

    this.tabs = mountTabs(this.card, (i) => this.show(i));
    app.setPrompts([[['Q', 'E'], 'Steps'], [['Esc'], 'Menu']]);
  }

  cornerNote(n) {
    return n === 16
      ? 'At Turn 16, in the sector that decided pole, the lower gear came with 6 km/h less at the apex.'
      : 'At Turn 7 the lower gear came with 5 km/h more at the apex. Same choice, opposite result.';
  }

  goCorner(n) {
    const { app } = this;
    const c = app.lap.corners.find((x) => x.n === n);
    this.el.querySelectorAll('[data-corner]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.corner) === n)));
    this.el.querySelector('#corner-note').textContent = this.cornerNote(n);
    sound.tick(760, 0.05, 0.08);
    this.moveTo(c.i + 2);
  }

  show(i) {
    if (i < this.steps.length) {
      this.moveTo(this.steps[i].at);
      return;
    }
    if (this.scope) return;
    const { app } = this;
    const s = app.stage;
    this.scope = mountScope(app.lap, (ver, lec) => {
      this.tween = null;
      this.index = ver;
      s.setPair(ver, lec);
    });
    this.scope.update(this.index);
  }

  instrument() {
    return `
      <div class="scope">
        <div class="scope__read">
          <p class="scope__where"><span id="r-where">Start of the lap</span><span id="r-metres">0 m</span></p>
          <p class="scope__apex" id="r-apex">Between corners.</p>
          <p class="scope__gap"><span id="r-gap">0.000</span><span id="r-who">level</span></p>
          <dl class="scope__cars">
            <div class="is-ver"><dt>VER</dt><dd><span id="r-ver">0</span> km/h</dd></div>
            <div class="is-lec"><dt>LEC</dt><dd><span id="r-lec">0</span> km/h</dd></div>
          </dl>
        </div>
        <div class="scope__plot" id="plot" aria-hidden="true"></div>
        <label class="scope__scrub"><span class="sr">Position on the lap</span><input type="range" id="scrub" min="0" max="493" step="1" value="0"></label>
        <div class="scope__jump" role="group" aria-label="Jump to a corner">
          <button type="button" data-jump="7">Turn 7</button>
          <button type="button" data-jump="16">Turn 16</button>
          <button type="button" data-jump="all" aria-pressed="true">Whole lap</button>
          <button type="button" id="play" aria-pressed="false">Run the lap</button>
        </div>
      </div>
      <p class="card__note">Times at the three timing lines are official. Between them the public feed has four to six samples a second: enough for apex speeds and gears, too coarse to time a single corner, so nothing here does. The feed also puts both cars on one line, so they run a lane apart here to stay visible.</p>`;
  }

  // Short moves roll along the road. Anything else blinks across, so the cars never run backwards.
  moveTo(index) {
    const { app } = this;
    const s = app.stage;
    const ahead = index - this.index;
    if (Math.abs(ahead) < 0.5) return;
    if (app.calm() || ahead < 0 || ahead > 110) {
      this.tween = null;
      app.blink(() => {
        this.index = index;
        s.setPair(index, lecIndexAt(app.lap, index), true);
        s.stepPair(0.016);
        s.lagYaw = s.pose.yaw;
      });
      return;
    }
    this.tween = { from: this.index, to: index, t: 0, T: 2.2 };
  }

  key(e) {
    return this.tabs.key(e);
  }

  update(dt) {
    const t = this.tween;
    if (!t) return false;
    const { app } = this;
    t.t += dt;
    const k = ease(Math.min(1, t.t / t.T));
    this.index = t.from + (t.to - t.from) * k;
    app.stage.setPair(this.index, lecIndexAt(app.lap, this.index), true);
    if (t.t >= t.T) this.tween = null;
    return true;
  }

  leave() {
    this.app.stage.showPair(false);
    this.scope?.stop?.();
    this.scope = null;
  }
}
