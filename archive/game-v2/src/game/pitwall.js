// Pit Wall: you're the analyst. Three calls, each answered by the official numbers, and then the full
// instrument unlocks so you can drag along both laps yourself.
import { lecIndexAt, mountScope } from '../scope.js';
import { sound } from './audio.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class PitWall {
  constructor(app) {
    this.app = app;
    const { lap } = app;
    const t16 = lap.corners.find((c) => c.n === 16);
    const t7 = lap.corners.find((c) => c.n === 7);
    this.calls = [
      {
        at: lap.lines[0],
        ask: 'Verstappen took pole by 0.054. Who was ahead with one sector to go?',
        options: ['Verstappen', 'Leclerc'],
        right: 1,
        then: lap.lines[1],
        reply: 'Leclerc, by 0.107. His middle sector of 38.401 was 0.130 quicker than Verstappen’s, and this was his final run.',
      },
      {
        at: lap.lines[1],
        ask: 'He led by 0.107 and finished 0.054 behind. So what did the last sector cost him?',
        options: ['0.054', '0.107', '0.161'],
        right: 2,
        then: t16.i + 2,
        reply: '0.161. Verstappen’s 25.840 was the fastest third sector of the session, by anyone.',
      },
      {
        at: t16.i + 2,
        ask: 'At one of these corners Leclerc went down to second gear where Verstappen held third, and carried less speed. Which?',
        options: ['Turn 7', 'Turn 13', 'Turn 16'],
        right: 2,
        then: t16.i + 2,
        reply: `Turn 16: apex ${t16.ver} against ${t16.lec} km/h. He made the same choice at Turn 7 and gained 5 km/h there (${t7.ver} against ${t7.lec}), so it’s the result that differs, not the idea.`,
      },
    ];
  }

  enter() {
    const { app } = this;
    const s = app.stage;
    this.step = 0;
    this.firstTry = 0;
    this.missed = false;
    this.tween = null;
    this.el = document.createElement('section');
    this.el.className = 'pitwall';
    this.el.setAttribute('aria-label', 'Pit Wall');
    this.el.innerHTML = `<aside class="card card--pit" data-ui></aside>`;
    app.root.append(this.el);
    this.card = this.el.querySelector('.card');

    s.setReflections(false);
    s.showPair(true);
    this.index = this.calls[0].at;
    s.setPair(this.index, lecIndexAt(app.lap, this.index), true);
    s.stepPair(0.016);
    s.lagYaw = s.pose.yaw;
    s.snap('pair');
    s.setOffset(app.phone ? 0 : 0.2, app.phone ? 0.3 : 0);
    this.showCall();
  }

  moveTo(index, seconds = 1.8) {
    const { app } = this;
    if (app.calm()) {
      this.index = index;
      app.stage.setPair(index, lecIndexAt(app.lap, index), true);
      return;
    }
    this.tween = { from: this.index, to: index, t: 0, T: seconds };
  }

  showCall() {
    const c = this.calls[this.step];
    this.missed = false;
    this.card.classList.remove('is-in');
    this.card.innerHTML = `
      <p class="card__round">Call ${this.step + 1} of ${this.calls.length}, Singapore qualifying, 10 October 2026</p>
      <h2 class="card__ask">${c.ask}</h2>
      <div class="answers">${c.options.map((o, i) => `<button type="button" data-a="${i}">${o}</button>`).join('')}</div>
      <p class="card__story" id="reply" aria-live="polite"></p>
      <div class="card__nav" id="next" hidden><button class="go" type="button"></button></div>`;
    requestAnimationFrame(() => this.card.classList.add('is-in'));
    this.card.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.answer(b, c)));
    const next = this.card.querySelector('#next button');
    next.textContent = this.step === this.calls.length - 1 ? 'Open the instrument' : 'Next call';
    next.addEventListener('click', () => {
      this.step++;
      if (this.step === this.calls.length) this.showScope();
      else this.showCall();
    });
  }

  answer(button, c) {
    const pick = Number(button.dataset.a);
    const reply = this.card.querySelector('#reply');
    if (pick !== c.right) {
      this.missed = true;
      button.classList.add('is-wrong');
      button.disabled = true;
      reply.textContent = 'Not that one. Have another look.';
      sound.tick(200, 0.14, 0.12);
      return;
    }
    if (!this.missed) this.firstTry++;
    button.classList.add('is-right');
    this.card.querySelectorAll('[data-a]').forEach((b) => {
      b.disabled = true;
    });
    reply.textContent = c.reply;
    this.card.querySelector('#next').hidden = false;
    sound.tick(980, 0.09, 0.12);
    this.moveTo(c.then);
  }

  showScope() {
    const { app } = this;
    const s = app.stage;
    app.scout('pitwall');
    this.card.classList.remove('is-in');
    this.card.classList.add('card--scope');
    this.card.innerHTML = `
      <p class="card__round">${this.firstTry} of ${this.calls.length} first time. The instrument’s yours</p>
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
      <p class="card__note">Times at the three timing lines are official. Between them the public feed has four to six samples a second: enough for apex speeds and gears, too coarse to time a single corner, so nothing here does.</p>`;
    requestAnimationFrame(() => this.card.classList.add('is-in'));
    this.scope = mountScope(app.lap, (ver, lec) => {
      this.tween = null;
      this.index = ver;
      s.setPair(ver, lec);
    });
    this.scope.update(this.calls[2].then);
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
    const s = this.app.stage;
    s.showPair(false);
    this.scope?.stop?.();
    this.scope = null;
  }
}
